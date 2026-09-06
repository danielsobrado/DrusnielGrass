import * as THREE from "three";
import { disposeResources } from "../../render/ResourceDisposal";
import type { WorldConfig } from "../WorldConfig";
import { createWaterBedTexture } from "./WaterBedTexture";
import {
  WATER_ABSORPTION_COLOR,
  WATER_ALGAE_COLOR,
  WATER_BED_EXTINCTION_SCALE,
  WATER_BED_MATERIAL_CACHE_KEY,
  WATER_BED_NOISE_SEED_SALT,
  WATER_BED_PATH_LENGTH_SCALE,
  WATER_COMPACT_DETAIL_SCALE,
  WATER_PEBBLE_DARK_COLOR,
  WATER_PEBBLE_LIGHT_COLOR,
  WATER_SAND_COLOR,
} from "./WaterMaterialTuning";
import {
  WATER_BED_COLOR_FRAGMENT,
  WATER_BED_FRAGMENT_DECLARATIONS,
  WATER_BED_VERTEX_DECLARATIONS,
  WATER_BED_VERTEX_POSITION,
} from "./WaterBedMaterialShader";

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
  readonly material: THREE.MeshLambertMaterial;
  private readonly bedTexture: THREE.DataTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly detailScale: number;
  private disposed = false;

  constructor(config: WorldConfig, compact = false) {
    const bedTexture = createWaterBedTexture(
      (config.seed ^ WATER_BED_NOISE_SEED_SALT) >>> 0,
    );
    let material: THREE.MeshLambertMaterial | undefined;
    try {
      material = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: false,
        opacity: 1,
        alphaTest: 0.01,
        depthTest: true,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.bedTexture = bedTexture;
      this.material = material;
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
      this.configureMaterial();
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

  private configureMaterial(): void {
    this.material.name = "world-hydrology-water-bed-material";
    this.material.dithering = true;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>${WATER_BED_VERTEX_DECLARATIONS}`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>${WATER_BED_VERTEX_POSITION}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>${WATER_BED_FRAGMENT_DECLARATIONS}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>${WATER_BED_COLOR_FRAGMENT}`,
        );
    };
    this.material.customProgramCacheKey = () => WATER_BED_MATERIAL_CACHE_KEY;
    this.material.needsUpdate = true;
    this.material.transparent = false;
    this.material.depthWrite = true;
    this.material.depthTest = true;
    this.material.polygonOffset = true;
  }
}
