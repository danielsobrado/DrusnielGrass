import * as THREE from "three";
import type { WorldConfig } from "../WorldConfig";
import { createWaterFlowNoiseTexture } from "./WaterFlowNoiseTexture";
import {
  WATER_CASCADE_CACHE_KEY,
  WATER_CASCADE_FOAM_COLOR,
  WATER_CASCADE_MIST_COLOR,
  WATER_CASCADE_NOISE_SEED_SALT,
  WATER_CASCADE_WATER_COLOR,
  WATER_COMPACT_DETAIL_SCALE,
} from "./WaterMaterialTuning";
import {
  WATER_CASCADE_FRAGMENT,
  WATER_CASCADE_FRAGMENT_DECLARATIONS,
  WATER_CASCADE_VERTEX_DECLARATIONS,
  WATER_CASCADE_VERTEX_POSITION,
} from "./WaterCascadeShader";

/**
 * A curtain is lit by its own aeration far more than by the sun, and it is
 * seen from both sides, so this stays a cheap unlit double-sided transparent
 * material rather than joining the physical water surface's BRDF.
 */
export class WaterCascadeMaterialController {
  readonly material: THREE.MeshBasicMaterial;
  private readonly noiseTexture: THREE.DataTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(config: WorldConfig, compact = false) {
    this.noiseTexture = createWaterFlowNoiseTexture(
      (config.seed ^ WATER_CASCADE_NOISE_SEED_SALT) >>> 0,
    );
    const detailScale = compact ? WATER_COMPACT_DETAIL_SCALE : 1;
    this.material = new THREE.MeshBasicMaterial({
      color: WATER_CASCADE_WATER_COLOR,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
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
    this.configureMaterial();
  }

  update(elapsedSeconds: number): void {
    this.uniforms.uCascadeTime.value = elapsedSeconds;
  }

  dispose(): void {
    this.noiseTexture.dispose();
    this.material.dispose();
  }

  private configureMaterial(): void {
    this.material.name = "world-water-cascade-material";
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>${WATER_CASCADE_VERTEX_DECLARATIONS}`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>${WATER_CASCADE_VERTEX_POSITION}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>${WATER_CASCADE_FRAGMENT_DECLARATIONS}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>${WATER_CASCADE_FRAGMENT}`,
        );
    };
    this.material.customProgramCacheKey = () => WATER_CASCADE_CACHE_KEY;
    this.material.needsUpdate = true;
  }
}
