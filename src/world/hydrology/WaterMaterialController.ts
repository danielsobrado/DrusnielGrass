import * as THREE from "three";
import { disposeResources } from "../../render/ResourceDisposal";
import type { WorldConfig } from "../WorldConfig";
import { WaterRefractionNodePass } from "./WaterRefractionNodePass";
import type { WaterRefractionArgs } from "./WaterRefractionPass";
import { WaterSurfaceNodeMaterial } from "./WaterSurfaceNodeMaterial";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { createWaterFlowNoiseTexture } from "./WaterFlowNoiseTexture";
import {
  WATER_ABSORPTION_COLOR,
  WATER_COMPACT_DETAIL_SCALE,
  WATER_DEEP_COLOR,
  WATER_F0,
  WATER_FLOW_NOISE_SEED_SALT,
  WATER_FOAM_COLOR,
  WATER_REFLECTION_COLOR,
  WATER_SHALLOW_COLOR,
  WATER_SUN_DIRECTION,
} from "./WaterMaterialTuning";
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
  private readonly refraction = new WaterRefractionNodePass(0.5);
  readonly material: WaterSurfaceNodeMaterial;
  private readonly flowNoiseTexture: THREE.DataTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;
  /**
   * The uniform table, for the node material built over the same state.
   *
   * One owner for the surface's live visuals: the portable material reads these
   * very objects, so a quality preset change, a refraction capture or a config
   * reload cannot reach one implementation and not the other while both live.
   */
  get shaderUniforms(): Record<string, THREE.IUniform> {
    return this.uniforms;
  }
  private readonly detailScale: number;
  private disposed = false;
  constructor(config: WorldConfig, compact = false, context?: WorldNodeMaterialContext) {
    const flowNoiseTexture = createWaterFlowNoiseTexture(
      (config.seed ^ WATER_FLOW_NOISE_SEED_SALT) >>> 0,
    );
    let material: WaterSurfaceNodeMaterial | undefined;
    try {
      this.flowNoiseTexture = flowNoiseTexture;
      this.detailScale = compact ? WATER_COMPACT_DETAIL_SCALE : 1;
      // The node material reads this table and owns every material property the
      // legacy construction set, so the table is built before it rather than
      // after; nothing else about this controller's ownership changes.
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
        // Borrow the shared mutable render-sun vector when available. Ecology
        // keeps its own fixed reference sun and never sees this value.
        uWaterSunDirection: {
          value: context?.worldSunDirection() ?? WATER_SUN_DIRECTION.clone(),
        },
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
        // The GLSL path reads the base roughness through the built-in material
        // uniform; the node path has no equivalent, so it is mirrored here and
        // written wherever `material.roughness` is, keeping one owner for it.
        uWaterRoughness: { value: config.waterRoughness },
      };
      material = new WaterSurfaceNodeMaterial(this.uniforms, context);
      this.material = material;
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
    this.material.syncTextures();
  }

  setLiveVisuals(visuals: WaterSurfaceLiveVisuals): void {
    if (this.disposed) {
      return;
    }
    this.material.roughness = visuals.waterRoughness;
    this.uniforms.uWaterRoughness.value = visuals.waterRoughness;
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

}
