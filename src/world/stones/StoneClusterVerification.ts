import { TerrainField } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import { WorldConfigLoader } from "../WorldConfigLoader";
import { validateWorldConfig } from "../WorldConfigValidator";
import { StoneClusterComposition } from "./StoneClusterComposition";
import {
  StoneClusterField,
  type StoneClusterCandidate,
  type StoneClusterDescriptor,
} from "./StoneClusterField";
import {
  CLUSTER_INFLUENCE_SEPARATION_RATIO,
  CONFLICT_NEIGHBOR_COUNT,
  DESCRIPTOR_CACHE_LIMIT,
  MEMBER_LABELS,
  RAW_CANDIDATE_CACHE_LIMIT,
  classifyStoneClusterProcess,
  clampClusterLocalToInfluence,
  clusterInfluenceIntersectsAabb,
  clusterLocalToWorld,
  clusterMinimumSeparation,
  clusterPointInsideInfluence,
  fillClusterConflictNeighbors,
  fillStoneCellMacroCoordinates,
  maxNormalizedReach,
  packLatticeKey,
  resolveOverlapPush,
  STONE_CELL_MACRO_QUERY_COUNT,
  STONE_CELL_SOURCE_MARGIN,
  stoneSourceCellCacheLimit,
  type StoneClusterProcess,
  type StoneMacroCoord,
} from "./StoneClusterTuning";
import { StoneField, type StoneInstance } from "./StoneField";
import { StoneRandom } from "./StoneRandom";

const PRIMARY_MIN = -12;
const PRIMARY_MAX = 12;
const PRIMARY_COUNT = (PRIMARY_MAX - PRIMARY_MIN + 1) ** 2;
const CHUNK_MIN = -2;
const CHUNK_MAX = 2;
const POSITION_DECIMALS = 4;
const ANGLE_DECIMALS = 6;
const SCALE_DECIMALS = 6;
const QUERY_ORDER_SEED = 0x51c1a57e;
const PROCESSES: readonly StoneClusterProcess[] = [
  "compact",
  "ridge",
  "scree",
  "fan",
];

function fail(message: string): never {
  throw new Error(`[stone-clusters] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function quantize(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function canonicalRaw(candidate: StoneClusterCandidate): string {
  return [
    candidate.gridX,
    candidate.gridZ,
    candidate.seed,
    candidate.rawActive ? 1 : 0,
    quantize(candidate.centerX, POSITION_DECIMALS),
    quantize(candidate.centerZ, POSITION_DECIMALS),
    quantize(candidate.height, POSITION_DECIMALS),
    quantize(candidate.geologyPotential, SCALE_DECIMALS),
    quantize(candidate.suitability, SCALE_DECIMALS),
    quantize(candidate.priority, SCALE_DECIMALS),
    candidate.process,
    quantize(candidate.strike, ANGLE_DECIMALS),
    quantize(candidate.direction, ANGLE_DECIMALS),
    quantize(candidate.majorRadius, POSITION_DECIMALS),
    quantize(candidate.minorRadius, POSITION_DECIMALS),
    quantize(candidate.influenceRadius, POSITION_DECIMALS),
    candidate.budget,
    candidate.biomeIndex,
    candidate.paletteKey,
    quantize(candidate.valueBase, SCALE_DECIMALS),
    quantize(candidate.mossBase, SCALE_DECIMALS),
    quantize(candidate.mossBias, SCALE_DECIMALS),
  ].join("|");
}

function canonicalDescriptor(descriptor: StoneClusterDescriptor): string {
  return `${canonicalRaw(descriptor)}|${descriptor.active ? 1 : 0}`;
}

function canonicalInstance(instance: StoneInstance): string {
  return [
    quantize(instance.x, POSITION_DECIMALS),
    quantize(instance.z, POSITION_DECIMALS),
    quantize(instance.height, POSITION_DECIMALS),
    quantize(instance.rotationY, ANGLE_DECIMALS),
    quantize(instance.scale, SCALE_DECIMALS),
    instance.archetype,
    instance.variantIndex,
    quantize(instance.moss, SCALE_DECIMALS),
    quantize(instance.valueScale, SCALE_DECIMALS),
  ].join("|");
}

function visitDomain(
  min: number,
  max: number,
  fn: (gridX: number, gridZ: number) => void,
): void {
  for (let gridZ = min; gridZ <= max; gridZ += 1) {
    for (let gridX = min; gridX <= max; gridX += 1) {
      fn(gridX, gridZ);
    }
  }
}

function shuffledCoords(
  min: number,
  max: number,
  seed: number,
): Array<{ gridX: number; gridZ: number }> {
  const coords: Array<{ gridX: number; gridZ: number }> = [];
  visitDomain(min, max, (gridX, gridZ) => coords.push({ gridX, gridZ }));
  const random = StoneRandom.fromSeed(seed);
  for (let index = coords.length - 1; index > 0; index -= 1) {
    const swap = random.integer(0, index);
    const current = coords[index];
    coords[index] = coords[swap];
    coords[swap] = current;
  }
  return coords;
}

function graph(config: WorldConfig): {
  terrain: TerrainField;
  clusters: StoneClusterField;
  composition: StoneClusterComposition;
  stones: StoneField;
} {
  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);
  return {
    terrain,
    clusters: stones.getClusterField(),
    composition: new StoneClusterComposition(config),
    stones,
  };
}

function collectRaw(
  clusters: StoneClusterField,
  min: number,
  max: number,
): Map<string, string> {
  const out = new Map<string, string>();
  visitDomain(min, max, (gridX, gridZ) => {
    out.set(
      `${gridX}:${gridZ}`,
      canonicalRaw(clusters.getRawCandidate(gridX, gridZ)),
    );
  });
  return out;
}

function collectDescriptors(
  clusters: StoneClusterField,
  order: "row" | "reverse" | "shuffle",
): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (gridX: number, gridZ: number): void => {
    out.set(
      `${gridX}:${gridZ}`,
      canonicalDescriptor(clusters.getDescriptor(gridX, gridZ)),
    );
  };
  if (order === "row") {
    visitDomain(PRIMARY_MIN, PRIMARY_MAX, visit);
  } else if (order === "reverse") {
    for (let gridZ = PRIMARY_MAX; gridZ >= PRIMARY_MIN; gridZ -= 1) {
      for (let gridX = PRIMARY_MAX; gridX >= PRIMARY_MIN; gridX -= 1) {
        visit(gridX, gridZ);
      }
    }
  } else {
    for (const coord of shuffledCoords(
      PRIMARY_MIN,
      PRIMARY_MAX,
      QUERY_ORDER_SEED,
    )) {
      visit(coord.gridX, coord.gridZ);
    }
  }
  return out;
}

function assertMapsEqual(
  left: Map<string, string>,
  right: Map<string, string>,
  label: string,
): void {
  assert(
    left.size === right.size,
    `${label}: size ${left.size} vs ${right.size}.`,
  );
  for (const [key, value] of left) {
    const other = right.get(key);
    assert(other !== undefined, `${label}: missing ${key}.`);
    assert(
      value === other,
      `${label}: ${key} rewrote.\nwas ${value}\nnow ${other}`,
    );
  }
}

export function verifyStoneClusters(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);
  validateWorldConfig(config);
  assert(PRIMARY_COUNT === 625, "Primary domain must be 25x25.");
  assert(
    PRIMARY_COUNT > RAW_CANDIDATE_CACHE_LIMIT,
    "Domain must exceed raw cache.",
  );
  assert(
    PRIMARY_COUNT > DESCRIPTOR_CACHE_LIMIT,
    "Domain must exceed descriptor cache.",
  );

  const first = graph(config);
  const second = graph(config);
  assertMapsEqual(
    collectRaw(first.clusters, PRIMARY_MIN, PRIMARY_MAX),
    collectRaw(second.clusters, PRIMARY_MIN, PRIMARY_MAX),
    "A. Raw candidate determinism",
  );
  assertMapsEqual(
    collectDescriptors(first.clusters, "row"),
    collectDescriptors(second.clusters, "row"),
    "B. Final descriptor determinism",
  );

  const row = collectDescriptors(
    new StoneClusterField(first.terrain, config),
    "row",
  );
  assertMapsEqual(
    row,
    collectDescriptors(new StoneClusterField(first.terrain, config), "reverse"),
    "C. Query-order reverse",
  );
  assertMapsEqual(
    row,
    collectDescriptors(new StoneClusterField(first.terrain, config), "shuffle"),
    "C. Query-order shuffle",
  );

  const replay = new Map<string, string>();
  visitDomain(PRIMARY_MIN, PRIMARY_MIN + 7, (gridX, gridZ) => {
    replay.set(
      `${gridX}:${gridZ}`,
      canonicalDescriptor(first.clusters.getDescriptor(gridX, gridZ)),
    );
  });
  visitDomain(
    80,
    80 + Math.ceil(Math.sqrt(DESCRIPTOR_CACHE_LIMIT)) + 4,
    (gridX, gridZ) => {
      first.clusters.getRawCandidate(gridX, gridZ);
      first.clusters.getDescriptor(gridX, gridZ);
    },
  );
  visitDomain(PRIMARY_MIN, PRIMARY_MIN + 7, (gridX, gridZ) => {
    const key = `${gridX}:${gridZ}`;
    const now = canonicalDescriptor(first.clusters.getDescriptor(gridX, gridZ));
    assert(
      replay.get(key) === now,
      `D. Descriptor cache eviction rewrote ${key}.\nwas ${replay.get(key)}\nnow ${now}`,
    );
  });

  let isolationChecked = false;
  visitDomain(PRIMARY_MIN, PRIMARY_MAX, (gridX, gridZ) => {
    if (isolationChecked) {
      return;
    }
    const descriptor = first.clusters.getDescriptor(gridX, gridZ);
    if (!descriptor.active) {
      return;
    }
    const jitter = config.stoneClusterCenterJitter;
    const spacing = config.stoneClusterSpacing;
    const reconstructedX =
      (gridX +
        0.5 +
        StoneRandom.fromSeed(descriptor.seed).fork("center-x").signed(jitter)) *
      spacing;
    assert(
      Math.abs(reconstructedX - descriptor.centerX) < 1e-9,
      "E. center-x fork is not isolated.",
    );
    const yawA = StoneRandom.fromSeed(descriptor.seed)
      .fork(MEMBER_LABELS[0])
      .fork("yaw")
      .range(0, Math.PI);
    StoneRandom.fromSeed(descriptor.seed)
      .fork(MEMBER_LABELS[0])
      .fork("family")
      .next();
    const yawC = StoneRandom.fromSeed(descriptor.seed)
      .fork(MEMBER_LABELS[0])
      .fork("yaw")
      .range(0, Math.PI);
    assert(
      yawA === yawC,
      "E. yaw fork shifted after an unrelated family draw.",
    );
    isolationChecked = true;
  });
  assert(isolationChecked, "E. No active descriptor found for RNG isolation.");

  const neighbors: StoneMacroCoord[] = [];
  visitDomain(PRIMARY_MIN, PRIMARY_MAX, (gridX, gridZ) => {
    const descriptor = first.clusters.getDescriptor(gridX, gridZ);
    if (!descriptor.active) {
      return;
    }
    fillClusterConflictNeighbors(gridX, gridZ, neighbors);
    for (let index = 0; index < CONFLICT_NEIGHBOR_COUNT; index += 1) {
      const neighbor = first.clusters.getDescriptor(
        neighbors[index].gridX,
        neighbors[index].gridZ,
      );
      if (!neighbor.active) {
        continue;
      }
      const distance = Math.hypot(
        descriptor.centerX - neighbor.centerX,
        descriptor.centerZ - neighbor.centerZ,
      );
      const minimum = clusterMinimumSeparation(
        config.stoneClusterSpacing,
        descriptor.influenceRadius,
        neighbor.influenceRadius,
      );
      assert(
        distance + 1e-9 >= minimum,
        `F. Active neighbors ${gridX}:${gridZ} and ${neighbor.gridX}:${neighbor.gridZ} overlap.`,
      );
    }
  });

  const maxThreshold =
    config.stoneClusterSpacing * CLUSTER_INFLUENCE_SEPARATION_RATIO;
  const minTwoAway =
    config.stoneClusterSpacing * (2 - 2 * config.stoneClusterCenterJitter);
  assert(
    minTwoAway > maxThreshold,
    "G. Two-away macro cells can still conflict.",
  );
  for (let dz = -2; dz <= 2; dz += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= 1) {
        continue;
      }
      const minDistance =
        config.stoneClusterSpacing *
        (Math.hypot(dx, dz) - 2 * config.stoneClusterCenterJitter);
      assert(
        minDistance > maxThreshold,
        `G. Offset ${dx},${dz} can still conflict.`,
      );
    }
  }

  const queried: StoneMacroCoord[] = [];
  const brute: StoneMacroCoord[] = [];
  for (const { cellX, cellZ } of [
    { cellX: 0, cellZ: 0 },
    { cellX: 1, cellZ: -3 },
    { cellX: -7, cellZ: 4 },
  ]) {
    const count = fillStoneCellMacroCoordinates(
      cellX,
      cellZ,
      config.stoneCellSize,
      config.stoneClusterSpacing,
      queried,
    );
    assert(
      count === STONE_CELL_MACRO_QUERY_COUNT,
      "N. Stone cells must query nine macros.",
    );
    const originGx = Math.floor(
      ((cellX + 0.5) * config.stoneCellSize) / config.stoneClusterSpacing,
    );
    const originGz = Math.floor(
      ((cellZ + 0.5) * config.stoneCellSize) / config.stoneClusterSpacing,
    );
    let bruteCount = 0;
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const slot =
          brute[bruteCount] ?? (brute[bruteCount] = { gridX: 0, gridZ: 0 });
        slot.gridX = originGx + dx;
        slot.gridZ = originGz + dz;
        bruteCount += 1;
      }
    }
    const minX = cellX * config.stoneCellSize;
    const minZ = cellZ * config.stoneCellSize;
    const production = new Set(
      queried.slice(0, count).map((coord) => `${coord.gridX}:${coord.gridZ}`),
    );
    for (let index = 0; index < bruteCount; index += 1) {
      const coord = brute[index];
      const descriptor = first.clusters.getDescriptor(coord.gridX, coord.gridZ);
      if (
        descriptor.active &&
        clusterInfluenceIntersectsAabb(
          descriptor.centerX,
          descriptor.centerZ,
          descriptor.influenceRadius,
          minX,
          minX + config.stoneCellSize,
          minZ,
          minZ + config.stoneCellSize,
        )
      ) {
        assert(
          production.has(`${coord.gridX}:${coord.gridZ}`),
          `H. 3x3 missed intersecting descriptor ${coord.gridX}:${coord.gridZ}.`,
        );
      }
    }
  }

  const processSeen = new Set<StoneClusterProcess>();
  let activeCount = 0;
  let splitChecked = false;
  let quietMacros = 0;
  visitDomain(PRIMARY_MIN, PRIMARY_MAX, (gridX, gridZ) => {
    const descriptor = first.clusters.getDescriptor(gridX, gridZ);
    if (descriptor.geologyPotential <= 0) {
      quietMacros += 1;
      assert(!descriptor.rawActive, `Quiet macro ${gridX}:${gridZ} activated.`);
      assert(
        descriptor.majorRadius === 0 && descriptor.influenceRadius === 0,
        `Quiet macro ${gridX}:${gridZ} still built radii.`,
      );
    } else {
      processSeen.add(descriptor.process);
      assert(
        descriptor.process ===
          classifyStoneClusterProcess(
            descriptor.landformSlope,
            descriptor.landformConvexity,
          ),
        `Process drifted from landform at ${gridX}:${gridZ}.`,
      );
      if (!descriptor.rawActive) {
        assert(
          descriptor.majorRadius === 0,
          `Inactive macro ${gridX}:${gridZ} still built radii.`,
        );
      }
    }
    if (!descriptor.active) {
      return;
    }
    activeCount += 1;
    const specs = first.composition.compose(descriptor);
    const resolved = first.stones.getResolvedCluster(gridX, gridZ);
    assert(
      specs.length <= descriptor.budget,
      `I. Specs exceeded budget at ${gridX}:${gridZ}.`,
    );
    assert(
      resolved.members.length <= descriptor.budget,
      `I. Resolved members exceeded budget at ${gridX}:${gridZ}.`,
    );
    if (resolved.members.length > 0) {
      assert(
        resolved.members[0].role === "anchor",
        `J. Member 0 must be the anchor.`,
      );
      assert(
        resolved.members.filter((member) => member.role === "anchor").length ===
          1,
        `J. Formation ${gridX}:${gridZ} must have one anchor.`,
      );
    }
    const ownerMacros: StoneMacroCoord[] = [];
    for (const spec of specs) {
      const authored = clusterLocalToWorld(
        descriptor.centerX,
        descriptor.centerZ,
        descriptor.direction,
        descriptor.majorRadius,
        descriptor.minorRadius,
        spec.localU,
        spec.localV,
      );
      assert(
        clusterPointInsideInfluence(
          descriptor.centerX,
          descriptor.centerZ,
          descriptor.influenceRadius,
          authored.x,
          authored.z,
        ),
        `H. Authored member ${spec.index} left the influence circle at ${gridX}:${gridZ}.`,
      );
    }
    for (const member of resolved.members) {
      assert(
        clusterPointInsideInfluence(
          descriptor.centerX,
          descriptor.centerZ,
          descriptor.influenceRadius,
          member.instance.x,
          member.instance.z,
        ),
        `H. Resolved member ${member.memberIndex} left the influence circle at ${gridX}:${gridZ}.`,
      );
      const ownerX = Math.floor(member.instance.x / config.stoneCellSize);
      const ownerZ = Math.floor(member.instance.z / config.stoneCellSize);
      const ownerMinX = ownerX * config.stoneCellSize;
      const ownerMinZ = ownerZ * config.stoneCellSize;
      const ownerCount = fillStoneCellMacroCoordinates(
        ownerX,
        ownerZ,
        config.stoneCellSize,
        config.stoneClusterSpacing,
        ownerMacros,
      );
      const ownerSet = new Set(
        ownerMacros
          .slice(0, ownerCount)
          .map((coord) => `${coord.gridX}:${coord.gridZ}`),
      );
      assert(
        ownerSet.has(`${descriptor.gridX}:${descriptor.gridZ}`),
        `H. Owner cell ${ownerX}:${ownerZ} for ${gridX}:${gridZ} member ${member.memberIndex} is outside the production 3x3.`,
      );
      assert(
        clusterInfluenceIntersectsAabb(
          descriptor.centerX,
          descriptor.centerZ,
          descriptor.influenceRadius,
          ownerMinX,
          ownerMinX + config.stoneCellSize,
          ownerMinZ,
          ownerMinZ + config.stoneCellSize,
        ),
        `H. Owner cell ${ownerX}:${ownerZ} for ${gridX}:${gridZ} member ${member.memberIndex} misses the influence circle.`,
      );
    }
    const byArchetype = new Map<string, number[]>();
    for (const spec of specs) {
      const used = byArchetype.get(spec.archetype) ?? [];
      used.push(spec.variantIndex);
      byArchetype.set(spec.archetype, used);
    }
    for (const [archetype, variants] of byArchetype) {
      if (variants.length <= config.stoneVariantsPerArchetype) {
        assert(
          new Set(variants).size === variants.length,
          `L. ${archetype} repeated a variant inside ${gridX}:${gridZ}.`,
        );
      }
    }
    if (
      specs.length >= 2 &&
      (specs[0].archetype === "boulder" || specs[0].archetype === "block")
    ) {
      const expectedSplit = StoneRandom.fromSeed(descriptor.seed)
        .fork(MEMBER_LABELS[specs[1].index])
        .fork("split")
        .chance(config.stoneFormationChance);
      assert(
        specs[1].splitEligible === expectedSplit,
        `K. Split ownership drifted at ${gridX}:${gridZ}.`,
      );
      if (expectedSplit) {
        assert(
          specs.length <= descriptor.budget,
          "K. Split raised candidate count.",
        );
        splitChecked = true;
      }
    }
    if (resolved.splitSucceeded) {
      splitChecked = true;
      // Detail level is decided per chunk, so two halves of one body must sit
      // in the same chunk or they can be built at different levels of detail --
      // one with chips and the near shader, one without. They are under a metre
      // apart against a 64 m chunk, so this holds by a wide margin; the check
      // exists because the day it stops holding, the answer is a formation-aware
      // detail decision rather than a shrug, and nothing else would report it.
      const anchor = resolved.members[0].instance;
      const half = resolved.members.find((member) => member.isSplitHalf);
      assert(
        half !== undefined,
        `K. Split reported without a half at ${gridX}:${gridZ}.`,
      );
      assert(
        Math.floor(anchor.x / config.chunkSize) ===
          Math.floor(half.instance.x / config.chunkSize) &&
          Math.floor(anchor.z / config.chunkSize) ===
            Math.floor(half.instance.z / config.chunkSize),
        `K. Mated halves straddle a chunk seam at ${gridX}:${gridZ} and can build at different detail.`,
      );
      assert(
        anchor.weatheringBias === half.instance.weatheringBias,
        `K. Mated halves disagree about their formation's weathering at ${gridX}:${gridZ}.`,
      );
    }
  });
  for (const process of PROCESSES) {
    assert(
      processSeen.has(process),
      `Missing process ${process} in the primary domain.`,
    );
  }
  assert(activeCount > 0, "Primary domain produced no active formations.");
  assert(
    quietMacros > 0,
    "Primary domain produced no quiet macros for the geology early-out.",
  );
  assert(
    first.stones.getCellCacheLimit() >=
      stoneSourceCellCacheLimit(
        config.stoneRadiusDesktop,
        config.chunkSize,
        config.stoneCellSize,
        STONE_CELL_SOURCE_MARGIN,
      ),
    "Cell cache is smaller than the desktop source-cell ring.",
  );
  assert(
    packLatticeKey(2, -5) !== packLatticeKey(-5, 2),
    "Packed lattice keys collided for swapped coordinates.",
  );
  if (!splitChecked) {
    let sample: StoneClusterDescriptor | undefined;
    visitDomain(PRIMARY_MIN, PRIMARY_MAX, (gridX, gridZ) => {
      if (sample) {
        return;
      }
      const descriptor = first.clusters.getDescriptor(gridX, gridZ);
      if (descriptor.active) {
        sample = descriptor;
      }
    });
    assert(
      sample !== undefined,
      "K. No active descriptor for synthetic split.",
    );
    for (let seed = 1; seed < 8000; seed += 1) {
      const specs = first.composition.compose({
        ...sample,
        seed,
        active: true,
        suitability: 1,
        process: "compact",
        biomeIndex: 0,
        budget: sample.budget,
      });
      if (
        specs.length >= 2 &&
        (specs[0].archetype === "boulder" || specs[0].archetype === "block") &&
        specs[1].splitEligible
      ) {
        assert(
          specs.length <= sample.budget,
          "K. Split raised candidate count.",
        );
        splitChecked = true;
        break;
      }
    }
  }
  assert(splitChecked, "K. No split-eligible formation found.");

  const seenChunkRoots = new Map<string, string>();
  const includeSmall: StoneInstance[] = [];
  const far: StoneInstance[] = [];
  for (let chunkZ = CHUNK_MIN; chunkZ <= CHUNK_MAX; chunkZ += 1) {
    for (let chunkX = CHUNK_MIN; chunkX <= CHUNK_MAX; chunkX += 1) {
      first.stones.collectChunkInstances(chunkX, chunkZ, true, includeSmall);
      first.stones.collectChunkInstances(chunkX, chunkZ, false, far);
      const includeKeys = new Set(includeSmall.map(canonicalInstance));
      for (const instance of far) {
        assert(
          includeKeys.has(canonicalInstance(instance)),
          "T. Far roots must be a subset.",
        );
        assert(
          instance.scale >= 0.5,
          "T. Far collection retained a small stone.",
        );
      }
      for (const instance of includeSmall) {
        const key = canonicalInstance(instance);
        assert(
          !seenChunkRoots.has(key),
          `M. Neighboring chunks duplicated ${key}.`,
        );
        seenChunkRoots.set(key, `${chunkX}:${chunkZ}`);
      }
    }
  }

  const macroUnion = new Set<string>();
  const chunkCells: StoneMacroCoord[] = [];
  let uniqueMacros = 0;
  for (const chunkX of [0, 1, -1]) {
    for (const chunkZ of [0, 1, -1]) {
      macroUnion.clear();
      const minX = chunkX * config.chunkSize;
      const minZ = chunkZ * config.chunkSize;
      const maxX = minX + config.chunkSize;
      const maxZ = minZ + config.chunkSize;
      const firstCellX = Math.floor(minX / config.stoneCellSize) - 1;
      const firstCellZ = Math.floor(minZ / config.stoneCellSize) - 1;
      const lastCellX = Math.floor((maxX - 1e-3) / config.stoneCellSize) + 1;
      const lastCellZ = Math.floor((maxZ - 1e-3) / config.stoneCellSize) + 1;
      for (let cellZ = firstCellZ; cellZ <= lastCellZ; cellZ += 1) {
        for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
          const count = fillStoneCellMacroCoordinates(
            cellX,
            cellZ,
            config.stoneCellSize,
            config.stoneClusterSpacing,
            chunkCells,
          );
          for (let index = 0; index < count; index += 1) {
            macroUnion.add(
              `${chunkCells[index].gridX}:${chunkCells[index].gridZ}`,
            );
          }
        }
      }
      uniqueMacros = Math.max(uniqueMacros, macroUnion.size);
    }
  }
  assert(
    uniqueMacros <= 25,
    `O. Cold chunk touched ${uniqueMacros} macro descriptors.`,
  );

  const pushed = resolveOverlapPush(0, 0, 0.1, 0, 1, 1, 1, 0, 1, 0);
  assert(
    pushed !== undefined,
    "P. Overlap correction must move a colliding root.",
  );
  const secondPush = resolveOverlapPush(
    pushed.x,
    pushed.z,
    0.1,
    0,
    1,
    1,
    1,
    0,
    1,
    0,
  );
  assert(
    secondPush === undefined ||
      Math.hypot(secondPush.x - pushed.x, secondPush.z - pushed.z) < 1e-9,
    "P. Overlap correction must be one pass.",
  );
  const clampedFan = clampClusterLocalToInfluence(1.4, 0.68 * 1.4, 10, 10, 14);
  assert(
    maxNormalizedReach(1.4) > 1.4,
    "H. Unclamped fan debris exceeds a circular halo.",
  );
  assert(
    Math.hypot(clampedFan.u * 10, clampedFan.v * 10) <= 14,
    "H. Fan debris must clamp into the circular influence.",
  );

  const halfWorld = config.worldSize * 0.5;
  let rootCount = 0;
  let quantized16 = 0;
  let jittered = false;
  const firstCenter = first.clusters.getDescriptor(0, 0).centerX;
  visitDomain(PRIMARY_MIN, PRIMARY_MAX, (gridX, gridZ) => {
    const descriptor = first.clusters.getDescriptor(gridX, gridZ);
    if (Math.abs(descriptor.centerX - firstCenter) > 1e-6) {
      jittered = true;
    }
    if (!descriptor.active) {
      return;
    }
    for (const member of first.stones.getResolvedCluster(gridX, gridZ)
      .members) {
      assert(
        Math.abs(member.instance.x) <= halfWorld - 2 + 1e-6,
        "R. Root left world.",
      );
      assert(
        Math.abs(member.instance.z) <= halfWorld - 2 + 1e-6,
        "R. Root left world.",
      );
      rootCount += 1;
      if (
        Math.abs(member.instance.x / 16 - Math.round(member.instance.x / 16)) <
        1e-4
      ) {
        quantized16 += 1;
      }
    }
  });
  assert(jittered, "S. Cluster centers are lattice-locked.");
  const placedRoots = Math.max(rootCount, seenChunkRoots.size);
  assert(placedRoots > 0, "S. No stones in the probe domain.");
  if (rootCount > 4) {
    assert(quantized16 < rootCount, "S. Roots snapped to 16 m.");
  }

  return `clusters ${activeCount}/${PRIMARY_COUNT} · processes ${processSeen.size}`;
}
