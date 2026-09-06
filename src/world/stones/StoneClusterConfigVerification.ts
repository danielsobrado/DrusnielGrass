import { validateStoneClusterGeometry } from "../WorldConfigStoneCluster";
import { WorldConfigLoader } from "../WorldConfigLoader";
import type { WorldConfig } from "../WorldConfig";

function fail(message: string): never {
  throw new Error(`[stone-cluster-config] ${message}`);
}

function expectReject(
  config: WorldConfig,
  pattern: RegExp,
  label: string,
): void {
  try {
    validateStoneClusterGeometry(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      fail(`${label}: unexpected rejection: ${message}`);
    }
    return;
  }
  fail(`${label}: expected configuration to be rejected.`);
}

export function verifyStoneClusterConfig(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);
  validateStoneClusterGeometry(config);

  expectReject(
    {
      ...config,
      stoneClusterSpacing: 40,
      stoneClusterCenterJitter: 0.35,
      stoneCellSize: 64,
      stoneClusterRadiusMin: 4,
      stoneClusterRadiusMax: 10,
      stoneClusterHaloRatio: 1.25,
    },
    /fixed 3x3 macro query/,
    "fan reach",
  );

  expectReject(
    { ...config, stoneCellSize: 24 },
    /chunkSize must be divisible by stoneCellSize/,
    "stone-cell divisibility",
  );

  expectReject(
    {
      ...config,
      stoneCellSize: 64,
      stoneClusterSpacing: 96,
      stoneClusterCenterJitter: 0,
      stoneClusterRadiusMin: 4,
      stoneClusterRadiusMax: 8,
      stoneClusterHaloRatio: 0.9,
    },
    /path-distance plateau/,
    "path-distance source-cell reach",
  );

  expectReject(
    {
      ...config,
      stoneFormationGapRatioMin: 0.03,
      stoneFormationGapRatioMax: 0.01,
    },
    /stoneFormationGapRatio range is reversed/,
    "formation-gap ratio",
  );

  expectReject(
    { ...config, worldSize: 1_100_000 },
    /packed stone-lattice coordinate range/,
    "packed lattice range",
  );

  return "3x3 reach + path reach + formation gap + cell lattice + packed key bounds";
}
