import * as THREE from "three";
import type { WorldConfig } from "../WorldConfig";
import { WaterCascadeNodeMaterial } from "./WaterCascadeNodeMaterial";
import { createWaterFlowNoiseTexture } from "./WaterFlowNoiseTexture";
import {
  WATER_CASCADE_FOAM_COLOR,
  WATER_CASCADE_MIST_COLOR,
  WATER_CASCADE_NOISE_SEED_SALT,
  WATER_CASCADE_WATER_COLOR,
  WATER_COMPACT_DETAIL_SCALE,
} from "./WaterMaterialTuning";

/**
 * A curtain is lit by its own aeration far more than by the sun, and it is
 * seen from both sides, so this stays a cheap unlit double-sided transparent
 * material rather than joining the physical water surface's BRDF.
 */
export class WaterCascadeMaterialController {
  readonly material: WaterCascadeNodeMaterial;
  private readonly noiseTexture: THREE.DataTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;

  /**
   * The uniform table, for the node material built over the same state. One
   * owner for the curtain's clock and strengths, so the two paths cannot
   * advect the strands from two different times while both are alive.
   */
  get shaderUniforms(): Record<string, THREE.IUniform> {
    return this.uniforms;
  }

  constructor(config: WorldConfig, compact = false) {
    this.noiseTexture = createWaterFlowNoiseTexture(
      (config.seed ^ WATER_CASCADE_NOISE_SEED_SALT) >>> 0,
    );
    const detailScale = compact ? WATER_COMPACT_DETAIL_SCALE : 1;
    this.uniforms = {
      uCascadeTime: { value: 0 },
      uCascadeFoamStrength: { value: config.waterfallFoamStrength },
      uCascadeMistStrength: { value: config.waterfallMistStrength * detailScale },
      uCascadeDetailDistance: { value: config.waterDetailDistance * detailScale },
      uCascadeNoise: { value: this.noiseTexture },
      uCascadeNoiseScale: { value: 0.11 },
      uCascadeWater: { value: WATER_CASCADE_WATER_COLOR },
      uCascadeFoam: { value: WATER_CASCADE_FOAM_COLOR },
      uCascadeMist: { value: WATER_CASCADE_MIST_COLOR },
    };
    this.material = new WaterCascadeNodeMaterial(this.uniforms);
  }

  update(elapsedSeconds: number): void {
    this.uniforms.uCascadeTime.value = elapsedSeconds;
  }

  dispose(): void {
    this.noiseTexture.dispose();
    this.material.dispose();
  }

}
