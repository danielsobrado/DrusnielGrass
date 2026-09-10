import { createHydrologySample } from "../world/hydrology/HydrologyField";
import type { TerrainField } from "../world/TerrainField";
import type { WorldHabitatWeights } from "./WorldAmbientMixer";

export const EMPTY_AUDIO_HABITAT: WorldHabitatWeights = Object.freeze({
  meadow: 1,
  forest: 0,
  wetland: 0,
  water: 0,
});

export function sampleWorldAudioHabitat(
  terrain: TerrainField,
  x: number,
  z: number,
): WorldHabitatWeights {
  const hydrology = createHydrologySample();
  const height = terrain.sampleHeight(x, z);
  terrain.sampleHydrology(x, z, height, hydrology);
  const ecology = terrain.sampleEcologyAt(x, z, height);
  const water = clamp01(Math.max(hydrology.waterCoverage, hydrology.waterProximity * 0.65));
  const forest = clamp01(ecology.shade);
  const wetland = clamp01(
    ecology.moisture * (1 - forest * 0.35) * (0.25 + water),
  );
  const meadow = clamp01(
    hydrology.grassMask * (1 - water) * (1 - forest) * (1 - ecology.rockiness * 0.5),
  );
  return { meadow, forest, wetland, water };
}

export function lerpHabitat(
  from: WorldHabitatWeights,
  to: WorldHabitatWeights,
  t: number,
): WorldHabitatWeights {
  const a = clamp01(t);
  return {
    meadow: from.meadow + (to.meadow - from.meadow) * a,
    forest: from.forest + (to.forest - from.forest) * a,
    wetland: from.wetland + (to.wetland - from.wetland) * a,
    water: from.water + (to.water - from.water) * a,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
