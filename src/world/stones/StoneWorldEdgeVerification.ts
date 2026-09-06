import { TerrainField } from "../TerrainField";
import { WorldConfigLoader } from "../WorldConfigLoader";
import { StoneField, type StoneInstance } from "./StoneField";

const WORLD_MARGIN = 2;
const EPSILON = 1e-6;

function fail(message: string): never {
  throw new Error(`[stone-world-edge] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function rootKey(instance: StoneInstance): string {
  return [
    instance.x.toFixed(6),
    instance.z.toFixed(6),
    instance.archetype,
    instance.variantIndex,
    instance.scale.toFixed(6),
  ].join("|");
}

/** Exercises both signs of every world boundary and the four clipped corners. */
export function verifyStoneWorldEdges(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);
  const chunksPerAxis = config.worldSize / config.chunkSize;
  assert(
    Number.isInteger(chunksPerAxis) && chunksPerAxis % 2 === 0,
    "World chunk layout must be an even integer grid.",
  );

  const halfChunks = chunksPerAxis * 0.5;
  const negative = [-halfChunks, -halfChunks + 1];
  const positive = [halfChunks - 2, halfChunks - 1];
  const cornerBands = [negative, positive] as const;
  const halfWorld = config.worldSize * 0.5;
  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);
  const seenRoots = new Map<string, string>();
  const scratch: StoneInstance[] = [];
  let chunksChecked = 0;
  let rootsChecked = 0;

  for (const xBand of cornerBands) {
    for (const zBand of cornerBands) {
      for (const chunkZ of zBand) {
        for (const chunkX of xBand) {
          stones.collectChunkInstances(chunkX, chunkZ, true, scratch);
          for (const instance of scratch) {
            assert(
              Math.abs(instance.x) <= halfWorld - WORLD_MARGIN + EPSILON &&
                Math.abs(instance.z) <= halfWorld - WORLD_MARGIN + EPSILON,
              `Root ${instance.x},${instance.z} escaped the world margin.`,
            );
            const key = rootKey(instance);
            const previousChunk = seenRoots.get(key);
            assert(
              previousChunk === undefined,
              `Root ${key} appeared in both ${previousChunk} and ${chunkX}:${chunkZ}.`,
            );
            seenRoots.set(key, `${chunkX}:${chunkZ}`);
            rootsChecked += 1;
          }
          chunksChecked += 1;
        }
      }
    }
  }

  return `${chunksChecked} edge chunks · ${rootsChecked} roots`;
}
