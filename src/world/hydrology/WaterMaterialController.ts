import * as THREE from "three";
import { disposeResources } from "../../render/ResourceDisposal";
import type { WorldConfig } from "../WorldConfig";
import { WaterRefractionPass, type WaterRefractionArgs } from "./WaterRefractionPass";
import { createWaterFlowNoiseTexture } from "./WaterFlowNoiseTexture";
import {
  WATER_ABSORPTION_COLOR,
  WATER_COMPACT_DETAIL_SCALE,
  WATER_DEEP_COLOR,
  WATER_F0,
  WATER_FLOW_NOISE_SEED_SALT,
  WATER_FOAM_COLOR,
  WATER_IOR,
  WATER_MATERIAL_CACHE_KEY,
  WATER_REFLECTION_COLOR,
  WATER_SHALLOW_COLOR,
  WATER_SPECULAR_COLOR,
  WATER_SUN_DIRECTION,
} from "./WaterMaterialTuning";
import {
  WATER_FRAGMENT_DECLARATIONS,
  WATER_SURFACE_FRAGMENT,
  WATER_VERTEX_DECLARATIONS,
  WATER_VERTEX_POSITION,
} from "./WaterShader";
export type WaterSurfaceLiveVisuals = Pick<
  WorldConfig,
  | "waterOpacity"
  | "waterQuality"
  | "waterRippleStrength"
  | "waterRippleScale"
  | "waterFlowSpeed"
  | "waterRiverPoolFlowScale"
  | "waterRiverRiffleFlowScale"
  | "waterFoamStrength"
  | "waterShoreFoamWeight"
  | "waterRiffleFoamWeight"
  | "waterStoneFoamWeight"
  | "waterFresnelStrength"
  | "waterDepthFade"
  | "waterFlowNoiseStrength"
  | "waterGlintStrength"
  | "waterStoneWakeStrength"
  | "waterRoughness"
>;
export class WaterMaterialController {
  private readonly refraction = new WaterRefractionPass(0.5);
  readonly material: THREE.MeshPhysicalMaterial;
  private readonly flowNoiseTexture: THREE.DataTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly detailScale: number;
  private disposed = false;
  constructor(config: WorldConfig, compact = false) {
    const flowNoiseTexture = createWaterFlowNoiseTexture(
      (config.seed ^ WATER_FLOW_NOISE_SEED_SALT) >>> 0,
    );
    let material: THREE.MeshPhysicalMaterial | undefined;
    try {
      material = new THREE.MeshPhysicalMaterial({
        color: WATER_SHALLOW_COLOR,
        roughness: config.waterRoughness,
        metalness: 0,
        ior: WATER_IOR,
        specularColor: WATER_SPECULAR_COLOR,
        specularIntensity: 1,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.flowNoiseTexture = flowNoiseTexture;
      this.material = material;
      this.material.forceSinglePass = true;
      this.detailScale = compact ? WATER_COMPACT_DETAIL_SCALE : 1;
      this.uniforms = {
        uWaterTime: { value: 0 },
        uWaterOpacity: { value: config.waterOpacity },
        uWaterRippleStrength: { value: config.waterRippleStrength },
        uWaterRippleScale: { value: config.waterRippleScale },
        uWaterFlowSpeed: { value: config.waterFlowSpeed },
        uWaterRiverReferenceDepth: {
          value: config.riverDepth + config.waterSurfaceOffset,
        },
        uWaterRiverPoolFlowScale: { value: config.waterRiverPoolFlowScale },
        uWaterRiverRiffleFlowScale: { value: config.waterRiverRiffleFlowScale },
        uWaterFoamStrength: { value: config.waterFoamStrength },
        uWaterShoreFoamWeight: { value: config.waterShoreFoamWeight },
        uWaterRiffleFoamWeight: { value: config.waterRiffleFoamWeight },
        uWaterStoneFoamWeight: { value: config.waterStoneFoamWeight },
        uWaterFresnelStrength: { value: config.waterFresnelStrength },
        uWaterDepthFade: { value: config.waterDepthFade },
        uWaterDetailDistance: {
          value: config.waterDetailDistance * this.detailScale,
        },
        uWaterLakeWaveStrength: { value: config.waterLakeWaveStrength },
        uWaterFlowNoise: { value: this.flowNoiseTexture },
        uWaterFlowNoiseScale: { value: config.waterFlowNoiseScale },
        uWaterFlowNoiseStrength: {
          value: config.waterFlowNoiseStrength * this.detailScale,
        },
        uWaterGlintStrength: {
          value: config.waterGlintStrength * this.detailScale,
        },
        uWaterStoneWakeStrength: {
          value: config.waterStoneWakeStrength * this.detailScale,
        },
        uWaterShallow: { value: WATER_SHALLOW_COLOR },
        uWaterDeep: { value: WATER_DEEP_COLOR },
        uWaterReflection: { value: WATER_REFLECTION_COLOR },
        uWaterFoam: { value: WATER_FOAM_COLOR },
        uWaterAbsorption: { value: WATER_ABSORPTION_COLOR },
        uWaterSunDirection: { value: WATER_SUN_DIRECTION.clone() },
        uWaterFresnelF0: { value: WATER_F0 },
        // High preset only; the standard path branches around all of these.
        uWaterOpticsQuality: { value: config.waterQuality },
        uWaterOpticsShoreFade: { value: 0.55 },
        tWaterRefraction: { value: null },
        tWaterRefractionDepth: { value: null },
        uWaterRefractionSize: { value: new THREE.Vector2() },
        uWaterRefractionStrength: { value: 0.055 },
        uWaterOpticsDeepStart: { value: 3.4 },
        uWaterOpticsReflectionGain: { value: 0.78 },
      };
      this.configureMaterial();
    } catch (error) {
      try {
        disposeResources([material, flowNoiseTexture]);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Water material construction cleanup failed.",
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

  renderRefraction(...args: WaterRefractionArgs): void {
    if (this.disposed || this.uniforms.uWaterOpticsQuality.value < 0.5) return;
    this.refraction.render(...args);
    this.uniforms.tWaterRefraction.value = this.refraction.texture ?? null;
    this.uniforms.tWaterRefractionDepth.value =
      this.refraction.depthTexture ?? null;
    args[0].getDrawingBufferSize(this.uniforms.uWaterRefractionSize.value);
  }

  setLiveVisuals(visuals: WaterSurfaceLiveVisuals): void {
    if (this.disposed) {
      return;
    }
    this.material.roughness = visuals.waterRoughness;
    // Selects the optics branch; both presets share one program because the
    // branch is on a uniform, so switching costs no recompile.
    this.uniforms.uWaterOpticsQuality.value = visuals.waterQuality >= 1 ? 1 : 0;
    this.uniforms.uWaterOpacity.value = visuals.waterOpacity;
    this.uniforms.uWaterRippleStrength.value = visuals.waterRippleStrength;
    this.uniforms.uWaterRippleScale.value = visuals.waterRippleScale;
    this.uniforms.uWaterFlowSpeed.value = visuals.waterFlowSpeed;
    this.uniforms.uWaterRiverPoolFlowScale.value =
      visuals.waterRiverPoolFlowScale;
    this.uniforms.uWaterRiverRiffleFlowScale.value =
      visuals.waterRiverRiffleFlowScale;
    this.uniforms.uWaterFoamStrength.value = visuals.waterFoamStrength;
    this.uniforms.uWaterShoreFoamWeight.value = visuals.waterShoreFoamWeight;
    this.uniforms.uWaterRiffleFoamWeight.value = visuals.waterRiffleFoamWeight;
    this.uniforms.uWaterStoneFoamWeight.value = visuals.waterStoneFoamWeight;
    this.uniforms.uWaterFresnelStrength.value = visuals.waterFresnelStrength;
    this.uniforms.uWaterDepthFade.value = visuals.waterDepthFade;
    this.uniforms.uWaterFlowNoiseStrength.value =
      visuals.waterFlowNoiseStrength * this.detailScale;
    this.uniforms.uWaterGlintStrength.value =
      visuals.waterGlintStrength * this.detailScale;
    this.uniforms.uWaterStoneWakeStrength.value =
      visuals.waterStoneWakeStrength * this.detailScale;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.refraction.dispose();
    disposeResources([this.flowNoiseTexture, this.material]);
  }

  private configureMaterial(): void {
    this.material.name = "world-hydrology-water-material";
    this.material.dithering = true;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>${WATER_VERTEX_DECLARATIONS}`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>${WATER_VERTEX_POSITION}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>${WATER_FRAGMENT_DECLARATIONS}`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>${WATER_SURFACE_FRAGMENT}`,
        );
    };
    this.material.customProgramCacheKey = () => WATER_MATERIAL_CACHE_KEY;
    this.material.needsUpdate = true;
  }
}
