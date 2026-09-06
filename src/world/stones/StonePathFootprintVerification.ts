import * as THREE from "three";
import { TerrainField } from "../TerrainField";
import { WorldConfigLoader } from "../WorldConfigLoader";
import { StoneField, type StoneInstance } from "./StoneField";

const MIN_PATH_MARGIN = 0.045;
const NEAR_PATH_MARGIN = 2.5;

function fail(message: string): never {
  throw new Error(`[stone-path-footprints] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

/** Verifies real generated roots keep their physical footprint off both path treads. */
export function verifyStonePathFootprints(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);
  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);
  const distances = new THREE.Vector2();
  const scratch: StoneInstance[] = [];
  const mainClearance =
    config.pathWidth * 0.5 +
    config.pathEdgeRoughness +
    config.pathGrassClearance;
  const branchClearance =
    config.pathBranchWidth * 0.5 +
    config.pathEdgeRoughness +
    config.pathGrassClearance;
  let checked = 0;
  let nearPath = 0;

  for (let chunkZ = -6; chunkZ <= 6; chunkZ += 1) {
    for (let chunkX = -6; chunkX <= 6; chunkX += 1) {
      stones.collectChunkInstances(chunkX, chunkZ, true, scratch);
      for (const instance of scratch) {
        if (terrain.samplePathVisibility(instance.height) <= 0.05) {
          continue;
        }
        terrain.samplePathDistances(instance.x, instance.z, distances);
        const footprint =
          stones.getInstanceVariant(instance).metrics.footprintRadius *
          instance.scale;
        const mainMargin =
          Math.abs(distances.x) - mainClearance - footprint;
        const branchMargin =
          Math.abs(distances.y) - branchClearance - footprint;
        const margin = Math.min(mainMargin, branchMargin);
        assert(
          margin >= MIN_PATH_MARGIN,
          `Stone at ${instance.x.toFixed(2)},${instance.z.toFixed(2)} intrudes into a walking way by ${(-margin).toFixed(3)} m.`,
        );
        checked += 1;
        if (margin < NEAR_PATH_MARGIN) {
          nearPath += 1;
        }
      }
    }
  }

  assert(checked > 0, "No path-visible stones were available for verification.");
  assert(
    nearPath > 0,
    "No stones exercised the near-path footprint contract; verge placement may be inactive.",
  );
  return `${checked} physical path clearances · ${nearPath} near path`;
}
