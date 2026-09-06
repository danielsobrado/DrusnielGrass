import { WorldConfigLoader } from "../WorldConfigLoader";
import { TerrainField } from "../TerrainField";
import { StoneField, type StoneInstance } from "./StoneField";
import type { StoneMeshData } from "./StoneGeometry";
import { STONE_ARCHETYPE_IDS } from "./StoneRecipe";

const NORMAL_LENGTH_TOLERANCE = 0.025;
const EDGE_QUANTIZE = 5e-4;
const VERTEX_BUDGET = 1500;
const TRIANGLE_BUDGET = 1000;
const COLLECTION_MARGIN_CELLS = 1;
const DISPLACEMENT_SAMPLE_RADIUS_CELLS = 16;
const MATERIAL_FRAME_EPSILON = 1e-6;
const CONTACT_OFFSET_EPSILON = 2e-3;

interface StoneFieldVerificationAccess {
  getCellInstances(cellX: number, cellZ: number): StoneInstance[];
}

function fail(message: string): never {
  throw new Error(`[stones-runtime] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function edgeKey(
  positions: Float32Array,
  first: number,
  second: number,
): string {
  const pointKey = (index: number): string => {
    const offset = index * 3;
    return `${Math.round(positions[offset] / EDGE_QUANTIZE)}:${Math.round(
      positions[offset + 1] / EDGE_QUANTIZE,
    )}:${Math.round(positions[offset + 2] / EDGE_QUANTIZE)}`;
  };
  const firstKey = pointKey(first);
  const secondKey = pointKey(second);
  return firstKey < secondKey
    ? `${firstKey}|${secondKey}`
    : `${secondKey}|${firstKey}`;
}

function stoneIdentity(instance: StoneInstance): string {
  return [
    instance.x.toPrecision(17),
    instance.z.toPrecision(17),
    instance.height.toPrecision(17),
    instance.rotationY.toPrecision(17),
    instance.scale.toPrecision(17),
    instance.archetype,
    instance.variantIndex,
  ].join("|");
}

function verifyClosedMesh(mesh: StoneMeshData, label: string): void {
  const edgeCounts = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const first = mesh.indices[index + corner];
      const second = mesh.indices[index + ((corner + 1) % 3)];
      const key = edgeKey(mesh.positions, first, second);
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [edge, count] of edgeCounts) {
    assert(
      count === 2,
      `${label} edge ${edge} borders ${count} triangles.`,
    );
  }
}

function verifyMesh(mesh: StoneMeshData, label: string): void {
  const vertices = mesh.metrics.vertexCount;
  const triangles = mesh.metrics.triangleCount;
  assert(
    mesh.positions.length === vertices * 3,
    `${label} position count does not match metrics.`,
  );
  assert(
    mesh.normals.length === vertices * 3,
    `${label} normal count does not match metrics.`,
  );
  assert(
    mesh.tones.length === vertices &&
      mesh.wears.length === vertices &&
      mesh.bounces.length === vertices &&
      mesh.mosses.length === vertices &&
      mesh.minerals.length === vertices &&
      mesh.weatherings.length === vertices &&
      mesh.cavities.length === vertices,
    `${label} scalar attribute count does not match metrics.`,
  );
  assert(
    mesh.indices.length === triangles * 3,
    `${label} index count does not match metrics.`,
  );
  assert(
    vertices <= VERTEX_BUDGET && triangles <= TRIANGLE_BUDGET,
    `${label} exceeds its mesh budget (${vertices} verts, ${triangles} tris).`,
  );
  assert(
    Number.isFinite(mesh.metrics.materialHeight) &&
      mesh.metrics.materialHeight > 0 &&
      Number.isFinite(mesh.metrics.materialFootprintRadius) &&
      mesh.metrics.materialFootprintRadius > 0,
    `${label} has an invalid material frame.`,
  );

  for (let index = 0; index < mesh.positions.length; index += 1) {
    assert(
      Number.isFinite(mesh.positions[index]),
      `${label} has a non-finite position at ${index}.`,
    );
  }
  for (let index = 0; index < mesh.normals.length; index += 3) {
    const x = mesh.normals[index];
    const y = mesh.normals[index + 1];
    const z = mesh.normals[index + 2];
    const length = Math.hypot(x, y, z);
    assert(
      Number.isFinite(length) &&
        Math.abs(length - 1) <= NORMAL_LENGTH_TOLERANCE,
      `${label} has an invalid normal at vertex ${index / 3} (length ${length}).`,
    );
  }
  for (let index = 0; index < vertices; index += 1) {
    assert(
      mesh.tones[index] >= 0 && mesh.tones[index] <= 1,
      `${label} tone ${index} is out of range.`,
    );
    assert(
      mesh.wears[index] >= 0 && mesh.wears[index] <= 1,
      `${label} wear ${index} is out of range.`,
    );
    assert(
      mesh.bounces[index] >= 0 && mesh.bounces[index] <= 1,
      `${label} bounce ${index} is out of range.`,
    );
    assert(
      mesh.mosses[index] >= 0 && mesh.mosses[index] <= 1,
      `${label} moss ${index} is out of range.`,
    );
    assert(
      mesh.minerals[index] >= 0 && mesh.minerals[index] <= 1,
      `${label} mineral ${index} is out of range.`,
    );
    assert(
      mesh.weatherings[index] >= 0 && mesh.weatherings[index] <= 1,
      `${label} weathering ${index} is out of range.`,
    );
    assert(
      mesh.cavities[index] >= 0 && mesh.cavities[index] <= 1,
      `${label} cavity ${index} is out of range.`,
    );
  }
  for (let index = 0; index < mesh.indices.length; index += 1) {
    assert(
      mesh.indices[index] < vertices,
      `${label} index ${index} points outside the vertex buffer.`,
    );
  }
  assert(vertices > 0 && triangles > 0, `${label} is empty.`);
  assert(
    mesh.metrics.contactRadius > 0,
    `${label} has no usable contact radius.`,
  );
  assert(
    mesh.metrics.footprintRadius >= mesh.metrics.contactRadius,
    `${label} contact radius exceeds its footprint.`,
  );
  verifyClosedMesh(mesh, label);
}

function verifyDisplacedStoneCollection(
  stones: StoneField,
  cellSize: number,
  chunkSize: number,
): number {
  const runtime = stones as unknown as StoneFieldVerificationAccess;
  const destinationChunks = new Map<string, Set<string>>();
  let displaced = 0;

  for (
    let cellZ = -DISPLACEMENT_SAMPLE_RADIUS_CELLS;
    cellZ <= DISPLACEMENT_SAMPLE_RADIUS_CELLS;
    cellZ += 1
  ) {
    for (
      let cellX = -DISPLACEMENT_SAMPLE_RADIUS_CELLS;
      cellX <= DISPLACEMENT_SAMPLE_RADIUS_CELLS;
      cellX += 1
    ) {
      const sourceMinX = cellX * cellSize;
      const sourceMinZ = cellZ * cellSize;
      const sourceMaxX = sourceMinX + cellSize;
      const sourceMaxZ = sourceMinZ + cellSize;
      const allowedMinX = sourceMinX - cellSize * COLLECTION_MARGIN_CELLS;
      const allowedMinZ = sourceMinZ - cellSize * COLLECTION_MARGIN_CELLS;
      const allowedMaxX = sourceMaxX + cellSize * COLLECTION_MARGIN_CELLS;
      const allowedMaxZ = sourceMaxZ + cellSize * COLLECTION_MARGIN_CELLS;

      for (const instance of runtime.getCellInstances(cellX, cellZ)) {
        assert(
          instance.x >= allowedMinX &&
            instance.x < allowedMaxX &&
            instance.z >= allowedMinZ &&
            instance.z < allowedMaxZ,
          `Stone from cell ${cellX}:${cellZ} escaped the one-cell collection margin at ${instance.x.toFixed(2)}:${instance.z.toFixed(2)}.`,
        );

        if (
          instance.x >= sourceMinX &&
          instance.x < sourceMaxX &&
          instance.z >= sourceMinZ &&
          instance.z < sourceMaxZ
        ) {
          continue;
        }
        displaced += 1;
        const chunkX = Math.floor(instance.x / chunkSize);
        const chunkZ = Math.floor(instance.z / chunkSize);
        const key = `${chunkX}:${chunkZ}`;
        const identities = destinationChunks.get(key) ?? new Set<string>();
        identities.add(stoneIdentity(instance));
        destinationChunks.set(key, identities);
      }
    }
  }

  for (const [key, expected] of destinationChunks) {
    const [chunkX, chunkZ] = key.split(":").map(Number);
    const collected = stones.collectChunkInstances(chunkX, chunkZ, true, []);
    const collectedIdentities = new Set(collected.map(stoneIdentity));
    for (const identity of expected) {
      assert(
        collectedIdentities.has(identity),
        `A displaced stone was not collected by destination chunk ${key}.`,
      );
    }
  }

  return displaced;
}

/** Exercises the exact variant path used by StoneField, including quality selection. */
export function verifyRuntimeStoneVariants(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);
  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);

  let variantsChecked = 0;
  let maximumVertices = 0;
  let maximumTriangles = 0;

  for (const archetype of STONE_ARCHETYPE_IDS) {
    for (
      let variantIndex = 0;
      variantIndex < config.stoneVariantsPerArchetype;
      variantIndex += 1
    ) {
      const far = stones.getVariant(archetype, variantIndex, false);
      const farAgain = stones.getVariant(archetype, variantIndex, false);
      assert(
        far === farAgain,
        `${archetype}:${variantIndex}:far was regenerated instead of cached.`,
      );
      verifyMesh(far, `${archetype}:${variantIndex}:far`);

      const near = stones.getVariant(archetype, variantIndex, true);
      const nearAgain = stones.getVariant(archetype, variantIndex, true);
      assert(
        near === nearAgain,
        `${archetype}:${variantIndex}:near was regenerated instead of cached.`,
      );
      verifyMesh(near, `${archetype}:${variantIndex}:near`);

      assert(
        Math.abs(near.metrics.contactRadius - far.metrics.contactRadius) <= 2e-3,
        `${archetype}:${variantIndex} chips changed the ground contact footprint.`,
      );
      assert(
        Math.abs(near.metrics.materialHeight - far.metrics.materialHeight) <=
          MATERIAL_FRAME_EPSILON &&
          Math.abs(
            near.metrics.materialFootprintRadius -
              far.metrics.materialFootprintRadius,
          ) <= MATERIAL_FRAME_EPSILON &&
          Math.abs(near.metrics.contactOffsetX - far.metrics.contactOffsetX) <=
            CONTACT_OFFSET_EPSILON &&
          Math.abs(near.metrics.contactOffsetZ - far.metrics.contactOffsetZ) <=
            CONTACT_OFFSET_EPSILON,
        `${archetype}:${variantIndex} material frame moves across the near/far LOD boundary.`,
      );
      assert(
        Math.abs(far.metrics.materialHeight - far.metrics.height) <=
          MATERIAL_FRAME_EPSILON &&
          Math.abs(
            far.metrics.materialFootprintRadius - far.metrics.footprintRadius,
          ) <= MATERIAL_FRAME_EPSILON,
        `${archetype}:${variantIndex} far whole stone no longer uses its legacy centred material frame.`,
      );
      assert(
        near.metrics.triangleCount >= far.metrics.triangleCount * 0.8,
        `${archetype}:${variantIndex} detailed geometry collapsed the macro body.`,
      );

      variantsChecked += 2;
      maximumVertices = Math.max(
        maximumVertices,
        far.metrics.vertexCount,
        near.metrics.vertexCount,
      );
      maximumTriangles = Math.max(
        maximumTriangles,
        far.metrics.triangleCount,
        near.metrics.triangleCount,
      );
    }
  }

  const displaced = verifyDisplacedStoneCollection(
    stones,
    config.stoneCellSize,
    config.chunkSize,
  );

  return `${variantsChecked} runtime variants · max ${maximumVertices} verts / ${maximumTriangles} tris · ${displaced} displaced roots checked`;
}
