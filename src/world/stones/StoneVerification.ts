import { WorldConfigLoader } from "../WorldConfigLoader";
import { TerrainField } from "../TerrainField";
import { buildStonePolyhedron } from "./StoneClipper";
import { generateStoneMesh, type StoneMeshData } from "./StoneGeometry";
import { resolveStoneRecipe, STONE_ARCHETYPE_IDS } from "./StoneRecipe";
import { StoneField } from "./StoneField";

/**
 * Build-gate checks for the procedural stones, executed against the real
 * modules through vite SSR (see scripts/verify-stones.mjs). Geometry checks
 * run the actual clipper rather than a re-derivation: a convex-clipping bug is
 * exactly the kind of regression a hand-copied formula would hide.
 */

interface StoneVerificationSummary {
  meshesChecked: number;
  uniqueFingerprints: number;
  maxVertices: number;
  maxTriangles: number;
  chunksChecked: number;
  instancesChecked: number;
  chippedTriangles: number;
}

/**
 * Watertightness failures are rare and seed-specific — the near-concurrent
 * plane cases that caused them showed up at roughly one seed in a thousand, so
 * a twenty-seed sample would have missed every one. This is cheap enough to
 * run wide.
 */
const GEOMETRY_SEEDS_PER_ARCHETYPE = 250;
const VERTEX_BUDGET = 1500;
const TRIANGLE_BUDGET = 1000;
/** Positions are quantized to half a millimetre for edge identity. */
const EDGE_QUANTIZE = 5e-4;

function renderEdgeKey(
  positions: Float32Array,
  a: number,
  b: number,
): string {
  // Render vertices copied from the same welded source point have identical
  // Float32 coordinates. Keep that exact identity here: quantizing after the
  // recipe's non-uniform scale can collapse two legitimately distinct points
  // on a thin stone and make a manifold edge appear four times.
  const keyA = `${positions[a * 3]}:${positions[a * 3 + 1]}:${positions[a * 3 + 2]}`;
  const keyB = `${positions[b * 3]}:${positions[b * 3 + 1]}:${positions[b * 3 + 2]}`;
  return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

function renderedSurfaceArea(mesh: StoneMeshData): number {
  const { positions, indices } = mesh;
  let area = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    area +=
      Math.hypot(
        aby * acz - abz * acy,
        abz * acx - abx * acz,
        abx * acy - aby * acx,
      ) * 0.5;
  }
  return area;
}

function fail(message: string): never {
  throw new Error(`[stones] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function verifyGeometry(summary: StoneVerificationSummary): void {
  const fingerprints = new Set<number>();
  let chippedDiffering = 0;
  let chippedTriangles = 0;
  for (const archetype of STONE_ARCHETYPE_IDS) {
    for (let seed = 0; seed < GEOMETRY_SEEDS_PER_ARCHETYPE; seed += 1) {
      const recipe = resolveStoneRecipe(archetype, seed);

      // Watertightness on the source polyhedron: every undirected edge must
      // belong to exactly two faces.
      const polygons = buildStonePolyhedron(recipe);
      assert(
        polygons.length >= 5,
        `${archetype}:${seed} produced only ${polygons.length} faces.`,
      );
      const edgeCounts = new Map<string, number>();
      for (const polygon of polygons) {
        const count = polygon.points.length;
        assert(count >= 3, `${archetype}:${seed} has a degenerate polygon.`);
        for (let index = 0; index < count; index += 1) {
          const a = polygon.points[index];
          const b = polygon.points[(index + 1) % count];
          const keyA = `${Math.round(a.x / EDGE_QUANTIZE)}:${Math.round(a.y / EDGE_QUANTIZE)}:${Math.round(a.z / EDGE_QUANTIZE)}`;
          const keyB = `${Math.round(b.x / EDGE_QUANTIZE)}:${Math.round(b.y / EDGE_QUANTIZE)}:${Math.round(b.z / EDGE_QUANTIZE)}`;
          const edgeKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
          edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
        }
      }
      for (const [edge, count] of edgeCounts) {
        assert(
          count === 2,
          `${archetype}:${seed} edge ${edge} borders ${count} faces; the body leaks.`,
        );
      }

      const mesh = generateStoneMesh(recipe);

      // Watertightness of the *rendered* triangles, not just the source
      // polyhedron. These are different surfaces: the render mesh duplicates
      // vertices per face for flat shading and fans each polygon, so a face
      // dropped between the two stages would leave a visible hole that a
      // polyhedron-only check cannot see. Edges are keyed by quantized
      // position because indices are not shared across faces. Fan and
      // rim/ring/centroid triangulations are both closed discs, so interior
      // diagonals appear exactly twice and the two-incidence rule still holds.
      const triangleEdges = new Map<string, number>();
      for (let index = 0; index < mesh.indices.length; index += 3) {
        for (let corner = 0; corner < 3; corner += 1) {
          const a = mesh.indices[index + corner];
          const b = mesh.indices[index + ((corner + 1) % 3)];
          const key = renderEdgeKey(mesh.positions, a, b);
          triangleEdges.set(key, (triangleEdges.get(key) ?? 0) + 1);
        }
      }
      for (const [edge, count] of triangleEdges) {
        assert(
          count === 2,
          `${archetype}:${seed} rendered edge ${edge} borders ${count} triangles; the render mesh leaks.`,
        );
      }

      // The chipped close-range form is a second surface with its own faces,
      // so it needs the same guarantees. A chip list that silently did nothing
      // would satisfy every other check in this file.
      const chipped = generateStoneMesh(recipe, true);
      const chippedEdges = new Map<string, number>();
      for (let index = 0; index < chipped.indices.length; index += 3) {
        for (let corner = 0; corner < 3; corner += 1) {
          const a = chipped.indices[index + corner];
          const b = chipped.indices[index + ((corner + 1) % 3)];
          const key = renderEdgeKey(chipped.positions, a, b);
          chippedEdges.set(key, (chippedEdges.get(key) ?? 0) + 1);
        }
      }
      for (const [edge, count] of chippedEdges) {
        assert(
          count === 2,
          `${archetype}:${seed} chipped edge ${edge} borders ${count} triangles.`,
        );
      }
      // Rendered surface area, not triangle count. A chip that clips a corner
      // also trims its neighbours to fewer corners, and faces are triangulated
      // around a centre only above a corner threshold, so a nick that removes
      // 2% of the body can drop 18% of its triangles as faces fall below that
      // threshold. Area answers the question the check is actually asking —
      // whether the chip planes are eating the body rather than nicking it —
      // and answers it independently of how the surface is tessellated.
      const baseArea = renderedSurfaceArea(mesh);
      const chippedArea = renderedSurfaceArea(chipped);
      assert(
        chippedArea >= baseArea * 0.9,
        `${archetype}:${seed} chipping collapsed the body (${baseArea.toFixed(3)} -> ${chippedArea.toFixed(3)} surface area).`,
      );
      assert(
        chipped.metrics.vertexCount <= VERTEX_BUDGET &&
          chipped.metrics.triangleCount <= TRIANGLE_BUDGET,
        `${archetype}:${seed} chipped form exceeds budgets (${chipped.metrics.vertexCount} verts, ${chipped.metrics.triangleCount} tris).`,
      );
      chippedTriangles = Math.max(chippedTriangles, chipped.metrics.triangleCount);
      if (chipped.metrics.fingerprint !== mesh.metrics.fingerprint) {
        chippedDiffering += 1;
      }

      const meshAgain = generateStoneMesh(recipe);
      assert(
        mesh.metrics.fingerprint === meshAgain.metrics.fingerprint,
        `${archetype}:${seed} is not deterministic.`,
      );
      fingerprints.add(mesh.metrics.fingerprint);

      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < mesh.positions.length; index += 1) {
        const value = mesh.positions[index];
        assert(
          Number.isFinite(value),
          `${archetype}:${seed} has a non-finite position.`,
        );
        const axis = index % 3;
        if (axis === 0) {
          minX = Math.min(minX, value);
          maxX = Math.max(maxX, value);
        } else if (axis === 1) {
          minY = Math.min(minY, value);
          maxY = Math.max(maxY, value);
        } else {
          minZ = Math.min(minZ, value);
          maxZ = Math.max(maxZ, value);
        }
      }

      // The recipe's metre dimensions must actually survive into the mesh.
      // The clipper welds shared corners, so a corner is one object referenced
      // by every adjacent face; an in-place transform that walks polygon
      // corners instead of unique points applies the scale once per face and
      // silently raises each dimension to the power of its face count. Width
      // is the tell — it is normalized to 1, and 1^n is 1, so only height and
      // depth visibly collapse. Bounds are compared against the normalized
      // body's own extent, which the profile keeps near 1.1.
      const boundsScale = 1.35;
      assert(
        maxY - minY <= recipe.height * boundsScale &&
          maxY - minY >= recipe.height * 0.55,
        `${archetype}:${seed} height ${(maxY - minY).toFixed(3)} does not match recipe height ${recipe.height.toFixed(3)}; check for repeated transforms on welded corners.`,
      );
      // Lean and top slope can extend a narrow shard across its short axis;
      // 2.35 still rejects runaway clipping while covering the documented
      // 1.5x silhouette lobe plus the maximum shear.
      const footprintScale = recipe.archetype === "shard" ? 2.35 : 1.9;
      assert(
        maxX - minX <= recipe.width * footprintScale &&
          maxZ - minZ <= recipe.depth * footprintScale,
        `${archetype}:${seed} footprint ${(maxX - minX).toFixed(2)}x${(maxZ - minZ).toFixed(2)} exceeds recipe ${recipe.width.toFixed(2)}x${recipe.depth.toFixed(2)}.`,
      );
      assert(
        Math.abs(minY) <= 2e-3,
        `${archetype}:${seed} does not sit on the ground (minY ${minY}).`,
      );
      for (let index = 0; index < mesh.tones.length; index += 1) {
        assert(
          mesh.tones[index] >= 0 && mesh.tones[index] <= 1,
          `${archetype}:${seed} tone out of range.`,
        );
        assert(
          mesh.wears[index] >= 0 && mesh.wears[index] <= 1,
          `${archetype}:${seed} wear out of range.`,
        );
        assert(
          mesh.mosses[index] >= 0 && mesh.mosses[index] <= 1,
          `${archetype}:${seed} moss out of range.`,
        );
      }
      assert(
        mesh.metrics.vertexCount <= VERTEX_BUDGET &&
          mesh.metrics.triangleCount <= TRIANGLE_BUDGET,
        `${archetype}:${seed} exceeds budgets (${mesh.metrics.vertexCount} verts, ${mesh.metrics.triangleCount} tris).`,
      );
      assert(
        mesh.metrics.triangleCount >= 12,
        `${archetype}:${seed} is degenerate (${mesh.metrics.triangleCount} tris).`,
      );
      assert(
        mesh.metrics.contactRadius > 0.08,
        `${archetype}:${seed} has no usable ground contact.`,
      );

      summary.meshesChecked += 1;
      summary.maxVertices = Math.max(
        summary.maxVertices,
        mesh.metrics.vertexCount,
      );
      summary.maxTriangles = Math.max(
        summary.maxTriangles,
        mesh.metrics.triangleCount,
      );
    }
  }
  const total = STONE_ARCHETYPE_IDS.length * GEOMETRY_SEEDS_PER_ARCHETYPE;
  assert(
    fingerprints.size >= total * 0.95,
    `Only ${fingerprints.size} of ${total} stones are unique.`,
  );
  summary.uniqueFingerprints = fingerprints.size;
  // Most stones should actually gain chips. A few archetypes roll zero, and a
  // chip can land too shallow to survive its minimum depth, so this is a floor
  // rather than a requirement on every seed.
  assert(
    chippedDiffering >= total * 0.7,
    `Only ${chippedDiffering} of ${total} stones changed when chipped; the chip planes are not taking effect.`,
  );
  summary.chippedTriangles = chippedTriangles;
}

function verifyPlacement(
  configSource: string,
  summary: StoneVerificationSummary,
): void {
  const config = new WorldConfigLoader().parse(configSource);
  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);
  const stonesAgain = new StoneField(terrain, config);
  const scratch: never[] = [];
  const scratchAgain: never[] = [];

  const halfWorldChunks = Math.floor(
    config.worldSize / config.chunkSize / 2,
  );
  const step = Math.max(2, Math.floor(halfWorldChunks / 4));
  let totalInstances = 0;

  for (
    let chunkZ = -halfWorldChunks;
    chunkZ < halfWorldChunks;
    chunkZ += step
  ) {
    for (
      let chunkX = -halfWorldChunks;
      chunkX < halfWorldChunks;
      chunkX += step
    ) {
      const instances = stones.collectChunkInstances(
        chunkX,
        chunkZ,
        true,
        scratch,
      );
      const instancesAgain = stonesAgain.collectChunkInstances(
        chunkX,
        chunkZ,
        true,
        scratchAgain,
      );
      assert(
        JSON.stringify(instances) === JSON.stringify(instancesAgain),
        `Chunk ${chunkX}:${chunkZ} is not deterministic across field instances.`,
      );
      assert(
        instances.length <= 220,
        `Chunk ${chunkX}:${chunkZ} holds ${instances.length} stones; density is runaway.`,
      );

      for (const instance of instances) {
        assert(
          Number.isFinite(instance.x) &&
            Number.isFinite(instance.z) &&
            Number.isFinite(instance.height) &&
            Number.isFinite(instance.sink),
          "Instance carries non-finite values.",
        );
        assert(
          instance.scale >= 0.15 && instance.scale <= 6,
          `Instance scale ${instance.scale} out of range.`,
        );
        assert(
          instance.normalY >= 0.55,
          `Instance sits on a rejected slope (normalY ${instance.normalY}).`,
        );

        // Stones that clear grass must never stand on a walking way. Verge
        // pebbles are exempt by construction (clearRadius 0).
        if (instance.clearRadius > 0) {
          const treadMask = terrain.samplePathGrassMask(
            instance.x,
            instance.z,
            instance.height,
            0,
          );
          assert(
            treadMask > 0.35,
            `Stone at ${instance.x.toFixed(1)},${instance.z.toFixed(1)} blocks a walking way (mask ${treadMask.toFixed(2)}).`,
          );
          const clearance = stones.sampleGrassClearance(
            instance.x,
            instance.z,
          );
          assert(
            clearance <= 0.05,
            `Grass clearance under a stone is ${clearance.toFixed(2)}; blades would pierce it.`,
          );
        }
      }
      totalInstances += instances.length;
      summary.chunksChecked += 1;
    }
  }
  assert(totalInstances > 0, "The scanned world contains no stones at all.");
  summary.instancesChecked = totalInstances;

  // Far from any stone the clearance mask must be exactly 1. Hunt for an
  // empty cell rather than assuming one.
  let foundClearPoint = false;
  for (let attempt = 0; attempt < 400 && !foundClearPoint; attempt += 1) {
    const x = -config.worldSize * 0.5 + 7 + attempt * 11.3;
    const z = -config.worldSize * 0.5 + 9 + ((attempt * 29.7) % config.worldSize);
    if (Math.abs(x) > config.worldSize * 0.5 - 4) {
      continue;
    }
    const chunkX = Math.floor(x / config.chunkSize);
    const chunkZ = Math.floor(z / config.chunkSize);
    const nearby = stones.collectChunkInstances(chunkX, chunkZ, true, scratch);
    const clear = nearby.every(
      (instance) =>
        (instance.x - x) * (instance.x - x) +
          (instance.z - z) * (instance.z - z) >
        36,
    );
    if (clear) {
      const mask = stones.sampleGrassClearance(x, z);
      assert(
        mask === 1,
        `Clearance far from stones is ${mask}; grass would thin for no reason.`,
      );
      foundClearPoint = true;
    }
  }
  assert(foundClearPoint, "Could not find any stone-free point to test.");

  // The rollback flag must remove everything.
  const disabledConfig = new WorldConfigLoader().parse(
    configSource.replace(/^stonesEnabled:\s*1$/m, "stonesEnabled: 0"),
  );
  const disabledField = new StoneField(terrain, disabledConfig);
  const disabledInstances = disabledField.collectChunkInstances(
    0,
    0,
    true,
    scratch,
  );
  assert(
    disabledInstances.length === 0 &&
      disabledField.sampleGrassClearance(3, 3) === 1,
    "stonesEnabled: 0 must disable placement and clearance entirely.",
  );
}

export async function verifyStones(configSource: string): Promise<string> {
  const summary: StoneVerificationSummary = {
    meshesChecked: 0,
    uniqueFingerprints: 0,
    maxVertices: 0,
    maxTriangles: 0,
    chunksChecked: 0,
    instancesChecked: 0,
    chippedTriangles: 0,
  };
  verifyGeometry(summary);
  verifyPlacement(configSource, summary);
  return (
    `${summary.meshesChecked} meshes (${summary.uniqueFingerprints} unique, ` +
    `≤${summary.maxVertices} verts, ≤${summary.maxTriangles} tris) · ` +
    `${summary.instancesChecked} instances across ${summary.chunksChecked} chunks · chipped <=${summary.chippedTriangles} tris`
  );
}
