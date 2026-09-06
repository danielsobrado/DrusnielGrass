import * as THREE from "three";
import { TerrainField } from "../TerrainField";
import { WorldConfigLoader } from "../WorldConfigLoader";
import { StoneClearanceCache } from "./StoneClearanceCache";
import { StoneField, type StoneInstance } from "./StoneField";
import {
  StoneRenderBatchBuilder,
  type StoneRenderBatchSource,
} from "./StoneRenderBatchBuilder";
import { STONE_WETNESS_DRY } from "./StoneWetness";

function fail(message: string): never {
  throw new Error(`[stones-performance] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function maximumBatchCount(radius: number, batchAxis: number): number {
  let maximum = 0;
  for (let phaseX = 0; phaseX < batchAxis; phaseX += 1) {
    for (let phaseZ = 0; phaseZ < batchAxis; phaseZ += 1) {
      const batches = new Set<string>();
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          batches.add(
            `${Math.floor((phaseX + dx) / batchAxis)}:${Math.floor(
              (phaseZ + dz) / batchAxis,
            )}`,
          );
        }
      }
      maximum = Math.max(maximum, batches.size);
    }
  }
  return maximum;
}

function buildRepresentativeBatch(
  stones: StoneField,
  builder: StoneRenderBatchBuilder,
  batchAxis: number,
): ReturnType<StoneRenderBatchBuilder["build"]> {
  const scratch: StoneInstance[] = [];
  for (let chunkZ = -6; chunkZ <= 6; chunkZ += 1) {
    for (let chunkX = -6; chunkX <= 6; chunkX += 1) {
      if (
        stones.collectChunkInstances(chunkX, chunkZ, true, scratch).length === 0
      ) {
        continue;
      }
      const batchX = Math.floor(chunkX / batchAxis) * batchAxis;
      const batchZ = Math.floor(chunkZ / batchAxis) * batchAxis;
      const sources: StoneRenderBatchSource[] = [];
      for (let dz = 0; dz < batchAxis; dz += 1) {
        for (let dx = 0; dx < batchAxis; dx += 1) {
          sources.push({
            chunkX: batchX + dx,
            chunkZ: batchZ + dz,
            detailed: true,
          });
        }
      }

      const job = builder.begin(sources);
      const expired = builder.advance(job, performance.now() - 1);
      assert(
        !expired.complete && job.sourceIndex === 0,
        "Stone batch builder ignored an exhausted frame deadline.",
      );
      const completed = builder.advance(job, Number.POSITIVE_INFINITY);
      assert(
        completed.complete,
        "Stone batch builder did not finish under an infinite verifier deadline.",
      );
      return completed.result;
    }
  }
  return undefined;
}

function attribute(
  geometry: THREE.BufferGeometry,
  name: string,
): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  return geometry.getAttribute(name);
}

function requireInterleaved(
  value: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  name: string,
): THREE.InterleavedBufferAttribute {
  assert(
    value instanceof THREE.InterleavedBufferAttribute,
    `${name} must use the packed interleaved stone stream.`,
  );
  return value;
}

function verifyClearanceAmortization(
  config: ReturnType<WorldConfigLoader["parse"]>,
): void {
  let chunkCollections = 0;
  const fakeField = {
    collectChunkInstances(
      _chunkX: number,
      _chunkZ: number,
      _includeSmall: boolean,
      out: StoneInstance[],
    ): StoneInstance[] {
      chunkCollections += 1;
      out.length = 0;
      return out;
    },
  } as unknown as StoneField;
  const cache = new StoneClearanceCache(fakeField, config);
  const origin = config.stoneCellSize * 2.25;
  for (let index = 0; index < 4096; index += 1) {
    const offset = (index % 32) * (config.stoneCellSize / 128);
    cache.sample(origin + offset, origin + offset * 0.5);
  }
  assert(
    chunkCollections <= 4,
    `Clearance cache repeated ${chunkCollections} chunk collections inside one stone cell.`,
  );
}

function verifyExpandedClearanceNeighborhood(
  config: ReturnType<WorldConfigLoader["parse"]>,
): void {
  const cellSize = config.stoneCellSize;
  const sampleX = cellSize * 3 - 0.1;
  const sampleZ = cellSize * 2.5;
  const rootX = cellSize * 4;
  const rootZ = sampleZ;
  const baseReach = cellSize - 0.2;
  const clearRadius = baseReach - config.stoneGrassClearanceFeather;
  assert(clearRadius > 0, "Stone clearance test radius must remain positive.");

  const root: StoneInstance = {
    x: rootX,
    z: rootZ,
    height: 0,
    sink: 0,
    rotationY: 0,
    scale: 1,
    archetype: "pebble",
    fragment: "whole",
    variantIndex: 0,
    paletteKey: "meadowSage",
    graniteBlend: 0,
    moss: 0,
    valueScale: 1,
    weatheringBias: 0.05,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    tiltStrength: 0,
    clearRadius,
    occlusionRadius: clearRadius + 0.5,
    wetness: STONE_WETNESS_DRY,
  };
  const rootChunkX = Math.floor(rootX / config.chunkSize);
  const rootChunkZ = Math.floor(rootZ / config.chunkSize);
  let chunkCollections = 0;
  const fakeField = {
    collectChunkInstances(
      chunkX: number,
      chunkZ: number,
      _includeSmall: boolean,
      out: StoneInstance[],
    ): StoneInstance[] {
      chunkCollections += 1;
      out.length = 0;
      if (chunkX === rootChunkX && chunkZ === rootChunkZ) out.push(root);
      return out;
    },
  } as unknown as StoneField;
  const cache = new StoneClearanceCache(fakeField, config);

  assert(
    cache.sample(sampleX, sampleZ) === 1,
    "Base stone clearance reached beyond its one-cell neighborhood contract.",
  );
  const expanded = cache.sample(sampleX, sampleZ, 0.5);
  assert(
    expanded < 1,
    "Expanded stone clearance missed a root in the next destination-cell ring.",
  );
  const collectionsAfterBuild = chunkCollections;
  for (let index = 0; index < 64; index += 1) {
    cache.sample(sampleX, sampleZ, 0.5);
  }
  assert(
    chunkCollections === collectionsAfterBuild,
    "Expanded stone clearance neighborhood was not cached.",
  );

  let rejectedInvalidRadius = false;
  try {
    cache.sample(sampleX, sampleZ, -0.1);
  } catch {
    rejectedInvalidRadius = true;
  }
  assert(
    rejectedInvalidRadius,
    "Negative stone clearance radius was accepted.",
  );

  for (const invalidCoordinate of [Number.NaN, Number.POSITIVE_INFINITY]) {
    let rejectedInvalidCoordinate = false;
    try {
      cache.sample(invalidCoordinate, sampleZ);
    } catch {
      rejectedInvalidCoordinate = true;
    }
    assert(
      rejectedInvalidCoordinate,
      "Non-finite stone clearance coordinate was accepted.",
    );
  }

  const halfChunks = config.worldSize / (config.chunkSize * 2);
  const edgeField = {
    collectChunkInstances(
      chunkX: number,
      chunkZ: number,
      _includeSmall: boolean,
      out: StoneInstance[],
    ): StoneInstance[] {
      assert(
        chunkX >= -halfChunks &&
          chunkX < halfChunks &&
          chunkZ >= -halfChunks &&
          chunkZ < halfChunks,
        `Clearance cache queried out-of-world chunk ${chunkX}:${chunkZ}.`,
      );
      out.length = 0;
      return out;
    },
  } as unknown as StoneField;
  const edgeCache = new StoneClearanceCache(edgeField, config);
  const halfWorld = config.worldSize * 0.5;
  edgeCache.sample(halfWorld - 0.1, halfWorld - 0.1, config.stoneCellSize * 4);
}

/** Production contracts for draw count, detail footprint, and vertex bandwidth. */
export function verifyStoneRenderPerformance(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);
  assert(
    config.stoneRenderBatchChunksPerAxis >= 2,
    "Production stones must batch at least 2x2 terrain chunks per draw.",
  );
  assert(
    config.stoneDetailRadiusCompact < config.stoneDetailRadius,
    "Compact stones must use a smaller close-geometry radius than desktop.",
  );
  verifyClearanceAmortization(config);
  verifyExpandedClearanceNeighborhood(config);

  const grainEnabled =
    config.stoneGrainStrength > 0 || config.stoneGrainNormalStrength > 0;
  const shaderDetailDistance = Math.max(
    config.stoneGrowthDetailStrength > 0
      ? config.stoneGrowthDetailFadeDistance
      : 0,
    grainEnabled ? config.stoneGrainFadeDistance : 0,
  );
  assert(
    config.stoneDetailRadiusCompact * config.chunkSize >= shaderDetailDistance,
    "Compact geometry detail must cover the complete detailed stone shader fade.",
  );
  assert(
    config.stoneDetailRadius * config.chunkSize >= shaderDetailDistance,
    "Desktop geometry detail must cover the complete detailed stone shader fade.",
  );

  const desktopUnbatched = (config.stoneRadiusDesktop * 2 + 1) ** 2;
  const compactUnbatched = (config.stoneRadiusCompact * 2 + 1) ** 2;
  const desktopBatches = maximumBatchCount(
    config.stoneRadiusDesktop,
    config.stoneRenderBatchChunksPerAxis,
  );
  const compactBatches = maximumBatchCount(
    config.stoneRadiusCompact,
    config.stoneRenderBatchChunksPerAxis,
  );
  assert(
    desktopBatches <= desktopUnbatched * 0.4,
    `Desktop stone batching regressed: ${desktopBatches}/${desktopUnbatched} draws.`,
  );
  assert(
    compactBatches <= compactUnbatched * 0.4,
    `Compact stone batching regressed: ${compactBatches}/${compactUnbatched} draws.`,
  );

  const desktopDetailedChunks = (config.stoneDetailRadius * 2 + 1) ** 2;
  const compactDetailedChunks = (config.stoneDetailRadiusCompact * 2 + 1) ** 2;
  assert(
    compactDetailedChunks <= desktopDetailedChunks * 0.4,
    `Compact detailed-stone footprint regressed: ${compactDetailedChunks}/${desktopDetailedChunks} chunks.`,
  );

  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);
  const azimuth = THREE.MathUtils.degToRad(
    config.stoneMossExposureAzimuthDegrees,
  );
  const elevation = THREE.MathUtils.degToRad(
    config.stoneMossExposureElevationDegrees,
  );
  const horizontal = Math.cos(elevation);
  const exposure = new THREE.Vector3(
    Math.cos(azimuth) * horizontal,
    Math.sin(elevation),
    Math.sin(azimuth) * horizontal,
  ).normalize();
  const builder = new StoneRenderBatchBuilder(stones, config, exposure);
  const result = buildRepresentativeBatch(
    stones,
    builder,
    config.stoneRenderBatchChunksPerAxis,
  );
  assert(
    result !== undefined,
    "Unable to find a representative stone render batch.",
  );

  const geometry = result.geometry;
  const position = attribute(geometry, "position");
  assert(
    position instanceof THREE.BufferAttribute &&
      position.array instanceof Float32Array,
    "Stone positions must remain a dedicated Float32 stream.",
  );

  const localPositionLimit =
    config.chunkSize * config.stoneRenderBatchChunksPerAxis;
  for (let index = 0; index < position.array.length; index += 3) {
    assert(
      Math.abs(position.array[index]) <= localPositionLimit &&
        Math.abs(position.array[index + 2]) <= localPositionLimit,
      "Stone batch positions escaped the local precision envelope.",
    );
  }

  const normal = requireInterleaved(attribute(geometry, "normal"), "normal");
  const growthPosition = requireInterleaved(
    attribute(geometry, "stoneGrowthPosition"),
    "stoneGrowthPosition",
  );
  assert(
    normal.data === growthPosition.data &&
      normal.data.array instanceof Int16Array &&
      normal.normalized &&
      growthPosition.normalized,
    "Stone normals and growth coordinates must share one normalized Int16 stream.",
  );

  const color = requireInterleaved(attribute(geometry, "color"), "color");
  const moss = requireInterleaved(
    attribute(geometry, "stoneMoss"),
    "stoneMoss",
  );
  const lichen = requireInterleaved(
    attribute(geometry, "stoneLichen"),
    "stoneLichen",
  );
  const seed = requireInterleaved(
    attribute(geometry, "stoneGrowthSeed"),
    "stoneGrowthSeed",
  );
  const mossColor = requireInterleaved(
    attribute(geometry, "stoneMossColor"),
    "stoneMossColor",
  );
  const lichenColor = requireInterleaved(
    attribute(geometry, "stoneLichenColor"),
    "stoneLichenColor",
  );
  const wet = requireInterleaved(attribute(geometry, "stoneWet"), "stoneWet");
  const weathering = requireInterleaved(
    attribute(geometry, "stoneWeathering"),
    "stoneWeathering",
  );
  const bedding = requireInterleaved(
    attribute(geometry, "stoneBedding"),
    "stoneBedding",
  );
  const byteData = color.data;
  assert(
    byteData.array instanceof Uint8Array &&
      moss.data === byteData &&
      lichen.data === byteData &&
      seed.data === byteData &&
      mossColor.data === byteData &&
      lichenColor.data === byteData &&
      wet.data === byteData &&
      weathering.data === byteData &&
      bedding.data === byteData &&
      color.normalized &&
      moss.normalized &&
      lichen.normalized &&
      seed.normalized &&
      mossColor.normalized &&
      lichenColor.normalized &&
      wet.normalized &&
      weathering.normalized &&
      bedding.normalized,
    "Stone color, growth, wetness, weathering, and bedding data must share one normalized Uint8 stream.",
  );
  assert(
    geometry.boundingBox !== null && geometry.boundingSphere !== null,
    "Stone batches must provide precomputed culling bounds.",
  );

  const bytesPerVertex =
    position.itemSize * position.array.BYTES_PER_ELEMENT +
    normal.data.stride * normal.data.array.BYTES_PER_ELEMENT +
    byteData.stride * byteData.array.BYTES_PER_ELEMENT;
  // Raised from 36 for the wet channel. Stones needed one byte per vertex to
  // carry the baked waterline, and an interleaved byte stream must stay
  // four-byte aligned, so the smallest step available was 12 bytes to 16. The
  // three spare bytes are alignment, not headroom to spend casually. Wetness,
  // weathering, and bedding now use those bytes; the next per-vertex byte is
  // still free, and the one after that costs another four.
  assert(
    bytesPerVertex <= 40,
    `Stone vertex payload regressed to ${bytesPerVertex} bytes.`,
  );
  geometry.dispose();

  return `${desktopBatches}/${desktopUnbatched} desktop draws · ${compactBatches}/${compactUnbatched} compact draws · ${compactDetailedChunks}/${desktopDetailedChunks} compact detail · ${bytesPerVertex} B/vertex · 3 vertex streams`;
}
