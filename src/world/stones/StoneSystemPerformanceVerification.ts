import * as THREE from "three";
import { TerrainField } from "../TerrainField";
import { WorldConfigLoader } from "../WorldConfigLoader";
import { StoneField, type StoneInstance } from "./StoneField";
import { WorldStoneSystem } from "./WorldStoneSystem";
import { STONE_WETNESS_DRY } from "./StoneWetness";

function fail(message: string): never {
  throw new Error(`[stones-system-performance] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function createInstance(
  chunkX: number,
  chunkZ: number,
  chunkSize: number,
): StoneInstance {
  return {
    x: (chunkX + 0.5) * chunkSize,
    z: (chunkZ + 0.5) * chunkSize,
    height: 0,
    sink: 0,
    rotationY: 0,
    scale: 1,
    archetype: "pebble",
    fragment: "whole",
    variantIndex: 0,
    paletteKey: "meadowSage",
    graniteBlend: 0,
    moss: 0.3,
    valueScale: 1,
    weatheringBias: 0.05,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    tiltStrength: 0,
    clearRadius: 0.4,
    occlusionRadius: 0.9,
    wetness: STONE_WETNESS_DRY,
  };
}

/** Exercises production batching/material selection without requiring WebGL. */
export function verifyStoneSystemPerformance(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);
  const terrain = new TerrainField(config);
  const variants = new StoneField(terrain, config);
  const field = {
    collectChunkInstances(
      chunkX: number,
      chunkZ: number,
      _includeSmall: boolean,
      out: StoneInstance[],
    ): StoneInstance[] {
      out.length = 0;
      out.push(createInstance(chunkX, chunkZ, config.chunkSize));
      return out;
    },
    getVariant: variants.getVariant.bind(variants),
    getInstanceVariant: variants.getInstanceVariant.bind(variants),
  } as unknown as StoneField;

  const scene = new THREE.Scene();
  const system = new WorldStoneSystem(scene, field, config, false, false);
  const focus = new THREE.Vector3(0, 0, 0);
  const expectedBatches = 49;
  for (let pass = 0; pass < expectedBatches + 4; pass += 1) {
    system.update(focus, Number.POSITIVE_INFINITY);
  }

  const diagnostics = system.getDiagnostics();
  assert(
    diagnostics.queuedChunks === 0,
    `Production batch queue did not drain (${diagnostics.queuedChunks} left).`,
  );
  assert(
    diagnostics.drawCalls === expectedBatches,
    `Desktop production batching changed to ${diagnostics.drawCalls} draws.`,
  );

  system.update(focus, Number.POSITIVE_INFINITY);
  const idleDiagnostics = system.getDiagnostics();
  assert(
    idleDiagnostics.lastBuildMs === 0,
    `Idle stone diagnostics retained ${idleDiagnostics.lastBuildMs} ms of stale build time.`,
  );

  let detailedDraws = 0;
  let coarseDraws = 0;
  for (const child of scene.children) {
    if (
      !(child instanceof THREE.Mesh) ||
      !child.name.startsWith("world-stones-")
    ) {
      continue;
    }
    const material = child.material;
    if (!(material instanceof THREE.MeshLambertMaterial)) continue;
    if (material.name === "world-stone-detail-material") detailedDraws += 1;
    if (material.name === "world-stone-coarse-material") coarseDraws += 1;
  }
  assert(
    detailedDraws === 9 && coarseDraws === 40,
    `Expected 9 detail and 40 coarse draws, got ${detailedDraws}/${coarseDraws}.`,
  );

  system.dispose();
  assert(
    scene.children.every((child) => !child.name.startsWith("world-stones-")),
    "Stone system disposal left render batches attached to the scene.",
  );

  return `${detailedDraws} detail + ${coarseDraws} coarse production draws`;
}
