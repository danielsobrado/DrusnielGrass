import * as THREE from "three";
import { WaterBedNodeMaterial } from "./WaterBedNodeMaterial";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { disposeResources } from "../../render/ResourceDisposal";
import type { WorldConfig } from "../WorldConfig";
import { createWaterBedTexture } from "./WaterBedTexture";
import {
  WATER_ABSORPTION_COLOR,
  WATER_ALGAE_COLOR,
  WATER_BED_EXTINCTION_SCALE,
  WATER_BED_NOISE_SEED_SALT,
  WATER_BED_PATH_LENGTH_SCALE,
  WATER_COMPACT_DETAIL_SCALE,
  WATER_PEBBLE_DARK_COLOR,
  WATER_PEBBLE_LIGHT_COLOR,
  WATER_SAND_COLOR,
} from "./WaterMaterialTuning";

export type WaterBedLiveVisuals = Pick<
  WorldConfig,
  | "waterBedStrength"
  | "waterBedScale"
  | "waterBedRefraction"
  | "waterAlgaeStrength"
  | "waterCausticStrength"
>;

/**
 * Per-metre extinction applied to the bed, built from the same absorption hue
 * and depth fade the surface uses so the two layers cannot disagree about how
 * far light travels. Red is absorbed hardest, so a deepening channel loses its
 * warm gravel first and settles towards the water's own colour.
 */
function bedExtinction(config: WorldConfig): THREE.Vector3 {
  const fade = Math.max(0.01, config.waterDepthFade);
  const gain =
    (WATER_BED_PATH_LENGTH_SCALE * WATER_BED_EXTINCTION_SCALE) / fade;
  return new THREE.Vector3(
    (1 - WATER_ABSORPTION_COLOR.r) * gain,
    (1 - WATER_ABSORPTION_COLOR.g) * gain,
    (1 - WATER_ABSORPTION_COLOR.b) * gain,
  );
}

export class WaterBedMaterialController {
  readonly material: WaterBedNodeMaterial;
  private readonly bedTexture: THREE.DataTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;
  /**
   * The uniform table, for the node material built over the same state.
   *
   * One owner for the bed's live visuals: the portable material reads these
   * very objects, so a quality change or a config reload cannot reach one
   * implementation and not the other while both are alive.
   */
  get shaderUniforms(): Record<string, THREE.IUniform> {
    return this.uniforms;
  }
  private readonly detailScale: number;
  private disposed = false;

  constructor(config: WorldConfig, compact = false,
    context?: WorldNodeMaterialContext) {
    const bedTexture = createWaterBedTexture(
      (config.seed ^ WATER_BED_NOISE_SEED_SALT) >>> 0,
    );
    let material: WaterBedNodeMaterial | undefined;
    try {
      this.bedTexture = bedTexture;
      const detailScale = compact ? WATER_COMPACT_DETAIL_SCALE : 1;
      this.detailScale = detailScale;
      this.uniforms = {
        uWaterTime: { value: 0 },
        uWaterBedNoise: { value: this.bedTexture },
        uWaterBedScale: { value: config.waterBedScale },
        uWaterBedStrength: { value: config.waterBedStrength },
        uWaterBedRefraction: { value: config.waterBedRefraction },
        uWaterAlgaeStrength: { value: config.waterAlgaeStrength },
        uWaterCausticStrength: {
          value: config.waterCausticStrength * detailScale,
        },
        uWaterRiverReferenceDepth: {
          value: config.riverDepth + config.waterSurfaceOffset,
        },
        uWaterBedExtinction: { value: bedExtinction(config) },
        uWaterPebbleDark: { value: WATER_PEBBLE_DARK_COLOR },
        uWaterPebbleLight: { value: WATER_PEBBLE_LIGHT_COLOR },
        uWaterSand: { value: WATER_SAND_COLOR },
        uWaterAlgae: { value: WATER_ALGAE_COLOR },
      };
      material = new WaterBedNodeMaterial(this.uniforms, context);
      this.material = material;
    } catch (error) {
      try {
        disposeResources([material, bedTexture]);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Water bed material construction cleanup failed.",
          cleanupError,
        );
      }
      throw error;
    }
  }

  update(elapsedSeconds: number): void {
    if (!this.disposed) {
      this.uniforms.uWaterTime.value = elapsedSeconds;
    }
  }

  setLiveVisuals(visuals: WaterBedLiveVisuals): void {
    if (this.disposed) {
      return;
    }
    this.uniforms.uWaterBedScale.value = visuals.waterBedScale;
    this.uniforms.uWaterBedStrength.value = visuals.waterBedStrength;
    this.uniforms.uWaterBedRefraction.value = visuals.waterBedRefraction;
    this.uniforms.uWaterAlgaeStrength.value = visuals.waterAlgaeStrength;
    this.uniforms.uWaterCausticStrength.value =
      visuals.waterCausticStrength * this.detailScale;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeResources([this.bedTexture, this.material]);
  }

}
