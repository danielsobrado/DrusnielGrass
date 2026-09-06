import { TerrainField } from "../TerrainField";
import { WorldConfigLoader } from "../WorldConfigLoader";
import type { WorldConfig } from "../WorldConfig";
import { StoneField } from "./StoneField";
import {
  STONE_CELL_SOURCE_MARGIN,
  stoneSourceCellCacheLimit,
} from "./StoneClusterTuning";

export interface StonePerformanceBaseline {
  readonly seed: number;
  readonly chunkMin: number;
  readonly chunkMax: number;
  readonly includeSmallRoots: number;
  readonly farRoots: number;
  readonly maxRootsInChunk: number;
  readonly detailedTrianglePotential: number;
  readonly coarseTrianglePotential: number;
}

function fail(message: string): never {
  throw new Error(`[stone-cluster-performance] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function collectMetrics(
  stones: StoneField,
  config: WorldConfig,
  chunkMin: number,
  chunkMax: number,
): Omit<StonePerformanceBaseline, "seed"> {
  let includeSmallRoots = 0;
  let farRoots = 0;
  let maxRootsInChunk = 0;
  let detailedTrianglePotential = 0;
  let coarseTrianglePotential = 0;
  for (let chunkZ = chunkMin; chunkZ <= chunkMax; chunkZ += 1) {
    for (let chunkX = chunkMin; chunkX <= chunkMax; chunkX += 1) {
      const includeSmall: ReturnType<StoneField["collectChunkInstances"]> = [];
      stones.collectChunkInstances(chunkX, chunkZ, true, includeSmall);
      includeSmallRoots += includeSmall.length;
      maxRootsInChunk = Math.max(maxRootsInChunk, includeSmall.length);
      for (const instance of includeSmall) {
        assert(
          instance.clearRadius + config.stoneGrassClearanceFeather <
            config.stoneCellSize,
          `Stone clearance reach ${(
            instance.clearRadius + config.stoneGrassClearanceFeather
          ).toFixed(3)} exceeds its ${config.stoneCellSize} m cache cell.`,
        );
        detailedTrianglePotential +=
          stones.getInstanceVariant(instance, true).indices.length / 3;
      }
      const far: ReturnType<StoneField["collectChunkInstances"]> = [];
      stones.collectChunkInstances(chunkX, chunkZ, false, far);
      farRoots += far.length;
      for (const instance of far) {
        coarseTrianglePotential +=
          stones.getInstanceVariant(instance, false).indices.length / 3;
      }
    }
  }
  return {
    chunkMin,
    chunkMax,
    includeSmallRoots,
    farRoots,
    maxRootsInChunk,
    detailedTrianglePotential,
    coarseTrianglePotential,
  };
}

function maximumColdRawCandidates(config: WorldConfig): number {
  const sourceCellsAxis =
    config.chunkSize / config.stoneCellSize + 2 * STONE_CELL_SOURCE_MARGIN;
  const sourceCenterSpan = (sourceCellsAxis - 1) * config.stoneCellSize;
  const baseMacroAxis =
    Math.ceil(sourceCenterSpan / config.stoneClusterSpacing) + 1;
  const descriptorAndConflictMargin = 4;
  const rawAxis = baseMacroAxis + descriptorAndConflictMargin;
  return rawAxis * rawAxis;
}

function verifyColdSampling(config: WorldConfig): number {
  const maximum = maximumColdRawCandidates(config);
  let observed = 0;
  const scratch: ReturnType<StoneField["collectChunkInstances"]> = [];
  for (const [chunkX, chunkZ] of [
    [0, 0],
    [1, 0],
    [-1, 1],
  ] as const) {
    const terrain = new TerrainField(config);
    const stones = new StoneField(terrain, config);
    stones.collectChunkInstances(chunkX, chunkZ, true, scratch);
    const samples = stones.getClusterField().getFullTerrainSampleCount();
    observed = Math.max(observed, samples);
    assert(
      samples <= maximum,
      `Cold chunk ${chunkX}:${chunkZ} sampled ${samples} full macro candidates; ceiling ${maximum}.`,
    );
  }
  return observed;
}

function verifyDisabledClusterSampling(config: WorldConfig): void {
  for (const disabled of [
    { stoneDensity: 0 },
    { stoneClusterChance: 0 },
  ] as const) {
    const disabledConfig = { ...config, ...disabled };
    const terrain = new TerrainField(disabledConfig);
    const stones = new StoneField(terrain, disabledConfig);
    const clusterField = stones.getClusterField();
    for (let gridZ = -2; gridZ <= 2; gridZ += 1) {
      for (let gridX = -2; gridX <= 2; gridX += 1) {
        assert(
          !clusterField.getDescriptor(gridX, gridZ).active,
          "Disabled cluster controls produced an active descriptor.",
        );
      }
    }
    assert(
      clusterField.getFullTerrainSampleCount() === 0,
      "Disabled cluster controls performed full terrain/ecology sampling.",
    );
  }
}

export function verifyStoneClusterPerformance(
  configSource: string,
  baseline: StonePerformanceBaseline,
): string {
  const config = new WorldConfigLoader().parse(configSource);
  assert(
    config.seed === baseline.seed,
    `Baseline seed ${baseline.seed} does not match shipped config seed ${config.seed}.`,
  );
  verifyDisabledClusterSampling(config);
  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);
  assert(
    stones.getCellCacheLimit() >=
      stoneSourceCellCacheLimit(
        config.stoneRadiusDesktop,
        config.chunkSize,
        config.stoneCellSize,
      ),
    "Cell cache is smaller than the desktop source-cell ring.",
  );
  const coldSamples = verifyColdSampling(config);
  const metrics = collectMetrics(
    stones,
    config,
    baseline.chunkMin,
    baseline.chunkMax,
  );
  assert(
    metrics.includeSmallRoots <= baseline.includeSmallRoots,
    `includeSmallRoots rose from ${baseline.includeSmallRoots} to ${metrics.includeSmallRoots}.`,
  );
  assert(
    metrics.farRoots <= baseline.farRoots,
    `farRoots rose from ${baseline.farRoots} to ${metrics.farRoots}.`,
  );
  assert(
    metrics.detailedTrianglePotential <= baseline.detailedTrianglePotential,
    `detailedTrianglePotential rose from ${baseline.detailedTrianglePotential} to ${metrics.detailedTrianglePotential}.`,
  );
  assert(
    metrics.coarseTrianglePotential <= baseline.coarseTrianglePotential,
    `coarseTrianglePotential rose from ${baseline.coarseTrianglePotential} to ${metrics.coarseTrianglePotential}.`,
  );
  assert(
    metrics.maxRootsInChunk <= baseline.maxRootsInChunk,
    `maxRootsInChunk ${metrics.maxRootsInChunk} exceeded ${baseline.maxRootsInChunk}.`,
  );
  return (
    `roots ${metrics.includeSmallRoots}/${metrics.farRoots} · ` +
    `tris ${metrics.detailedTrianglePotential}/${metrics.coarseTrianglePotential} · ` +
    `peak ${metrics.maxRootsInChunk} · cold macro samples ${coldSamples}`
  );
}
