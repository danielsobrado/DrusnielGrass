import { createHydrologySample } from "../world/hydrology/HydrologyField";
import { sampleStoneGrassClearance } from "../world/stones/StoneClearance";
import type { TerrainField } from "../world/TerrainField";
import type { WorldFootstepSurface } from "./WorldAudioCatalog";
import {
  WORLD_AUDIO_LITTER_SHADE_THRESHOLD,
  WORLD_AUDIO_MUD_WETNESS_THRESHOLD,
  WORLD_AUDIO_PATH_MASK_THRESHOLD,
  WORLD_AUDIO_SHALLOW_WATER_DEPTH_METERS,
  WORLD_AUDIO_SHALLOW_WATER_MIN_DEPTH_METERS,
  WORLD_AUDIO_STONE_CLEARANCE_THRESHOLD,
  WORLD_AUDIO_WATER_COVERAGE_THRESHOLD,
} from "./WorldAudioTuning";

/**
 * Deterministic surface class for a world-space foot plant.
 *
 * Priority: shallow water → stone/gravel → path/bare/mud → canopy litter →
 * grass → soil. Hydrology and ecology, not source terrain-blend pixels.
 */
export class WorldSurfaceClassifier {
  private readonly hydrology = createHydrologySample();

  constructor(
    private readonly terrain: TerrainField,
    private readonly stoneClearance: (x: number, z: number) => number = sampleStoneGrassClearance,
  ) {}

  classify(x: number, z: number, wetness: number): WorldFootstepSurface {
    const height = this.terrain.sampleHeight(x, z);
    this.terrain.sampleHydrology(x, z, height, this.hydrology);
    const depth = this.hydrology.waterLevel - height;
    if (
      this.hydrology.waterCoverage >= WORLD_AUDIO_WATER_COVERAGE_THRESHOLD &&
      depth >= WORLD_AUDIO_SHALLOW_WATER_MIN_DEPTH_METERS &&
      depth <= WORLD_AUDIO_SHALLOW_WATER_DEPTH_METERS
    ) {
      return "water";
    }
    if (this.stoneClearance(x, z) < WORLD_AUDIO_STONE_CLEARANCE_THRESHOLD) {
      return "stone";
    }
    const pathMask = this.terrain.samplePathGrassMask(x, z, height);
    if (pathMask < WORLD_AUDIO_PATH_MASK_THRESHOLD) {
      return wetness >= WORLD_AUDIO_MUD_WETNESS_THRESHOLD ? "mud" : "path";
    }
    const ecology = this.terrain.sampleEcologyAt(x, z, height);
    if (
      ecology.shade >= WORLD_AUDIO_LITTER_SHADE_THRESHOLD &&
      wetness < WORLD_AUDIO_MUD_WETNESS_THRESHOLD
    ) {
      return "litter";
    }
    if (pathMask >= 0.72 && ecology.rockiness < 0.55) return "grass";
    return "soil";
  }
}
