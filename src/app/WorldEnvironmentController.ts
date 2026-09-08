import * as THREE from "three";
import type { GrassArtDirection } from "../grass/GrassArtDirection";
import { grassGroundShadow } from "../grass/interaction/GrassGroundShadow";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { WORLD_CLOUD_TIME_WRAP_SECONDS } from "../world/sky/WorldCloudWeather";
import { WorldSkyNode } from "../world/sky/WorldSkyNode";
import type { RendererCapabilities } from "../render/RendererCapabilities";
import type { WorldLightingState } from "../render/WorldLightingState";
import type { WebGPURenderer } from "three/webgpu";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { WorldCloudEnvironmentLighting } from "./WorldCloudEnvironmentLighting";
import { WorldCloudShadowController } from "./WorldCloudShadowController";
import {
  WORLD_SUN_SHADOW_DISTANCE,
  WORLD_SUN_SHADOW_HALF_EXTENT,
} from "./WorldEnvironmentTuning";

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const FALLBACK_SHADOW_AXIS = new THREE.Vector3(1, 0, 0);
const MAX_ENVIRONMENT_DELTA_SECONDS = 0.25;

export class WorldEnvironmentController {
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly sky: WorldSkyNode;
  private readonly cloudLighting: WorldCloudEnvironmentLighting;
  private readonly cloudShadow: WorldCloudShadowController;
  private readonly shadowMapSize: number;
  private readonly shadowTexelSize: number;
  private readonly shadowAxisX = new THREE.Vector3();
  private readonly shadowAxisY = new THREE.Vector3();
  private shadowFocusX = Number.NaN;
  private shadowFocusY = Number.NaN;
  private shadowFocusZ = Number.NaN;
  private elapsedSeconds = 0;
  private context?: WorldNodeMaterialContext;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: WebGPURenderer,
    private readonly profile: RuntimeProfile,
    shadowsEnabled: boolean,
    private readonly capabilities: RendererCapabilities,
    private readonly lighting: WorldLightingState,
  ) {
    this.hemisphere = new THREE.HemisphereLight(
      lighting.hemisphereSkyColor,
      lighting.hemisphereGroundColor,
      lighting.hemisphereIntensity,
    );
    this.ambient = new THREE.AmbientLight(
      lighting.ambientColor,
      lighting.ambientIntensity,
    );
    this.sun = new THREE.DirectionalLight(
      lighting.sunColor,
      lighting.sunIntensity,
    );
    this.cloudLighting = new WorldCloudEnvironmentLighting(
      this.scene,
      this.renderer,
      this.profile,
      this.sun,
      this.hemisphere,
      this.ambient,
      this.lighting,
    );
    this.cloudShadow = new WorldCloudShadowController(
      this.scene,
      this.renderer,
      this.profile,
      this.sun,
      this.cloudLighting,
      shadowsEnabled,
      this.capabilities,
      this.lighting,
    );
    this.shadowMapSize = Math.max(
      1,
      Math.min(
        this.profile.shadowMapSize,
        this.capabilities.maxTextureSize,
      ),
    );
    this.shadowTexelSize =
      (2 * WORLD_SUN_SHADOW_HALF_EXTENT) / this.shadowMapSize;
    this.sun.castShadow = shadowsEnabled;
    this.configureShadow();
    this.rebuildShadowBasis();

    let sky: WorldSkyNode | undefined;
    try {
      this.scene.fog = new THREE.FogExp2(
        this.lighting.fogColor,
        this.lighting.fogDensity,
      );
      sky = new WorldSkyNode(
        this.scene,
        this.renderer,
        this.profile,
        this.capabilities,
        this.lighting,
      );
      this.sky = sky;
      this.scene.add(this.hemisphere, this.ambient, this.sun, this.sun.target);
      this.cloudLighting.applyLightingState();
      grassGroundShadow.setSunDirection(this.lighting.sunDirection);
    } catch (error) {
      disposeSafely(sky, "Sky");
      disposeSafely(this.cloudShadow, "Cloud shadow system");
      disposeSafely(this.cloudLighting, "Cloud lighting");
      disposeSafely(this.sun.shadow, "Sun shadow");
      this.scene.remove(this.hemisphere, this.ambient, this.sun, this.sun.target);
      throw error;
    }
  }

  /**
   * Weather owns lighting; art direction is allowed to re-apply it but never
   * reset fog or sun to hard-coded baseline values.
   */
  applyArtDirection(_direction?: GrassArtDirection): void {
    if (!this.disposed) this.cloudLighting.apply();
  }

  /** Apply one already-resolved preset atomically to every environment consumer. */
  applyWeatherPreset(): void {
    if (this.disposed) return;
    if (!(this.scene.fog instanceof THREE.FogExp2)) {
      this.scene.fog = new THREE.FogExp2(
        this.lighting.fogColor,
        this.lighting.fogDensity,
      );
    }
    this.rebuildShadowBasis();
    this.invalidateShadowFocus();
    this.cloudLighting.applyLightingState();
    this.cloudShadow.applyLightingState(this.lighting);
    this.sky.applyLightingState();
    grassGroundShadow.setSunDirection(this.lighting.sunDirection);
    this.sun.shadow.needsUpdate = true;
  }

  update(deltaSeconds: number, focus: THREE.Vector3): void {
    if (this.disposed || !isFiniteVector(focus)) {
      return;
    }
    const safeDelta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      MAX_ENVIRONMENT_DELTA_SECONDS,
    );
    this.elapsedSeconds =
      (this.elapsedSeconds + safeDelta) % WORLD_CLOUD_TIME_WRAP_SECONDS;
    this.cloudLighting.update(safeDelta, focus, this.elapsedSeconds);
    this.cloudShadow.update(safeDelta, focus, this.elapsedSeconds);
    this.sky.update(this.elapsedSeconds, focus);
    this.updateShadow(focus);
  }

  updateShadow(focus: THREE.Vector3): void {
    if (
      this.disposed ||
      !this.sun.castShadow ||
      !Number.isFinite(focus.x) ||
      !Number.isFinite(focus.y) ||
      !Number.isFinite(focus.z)
    ) {
      return;
    }
    if (
      focus.x === this.shadowFocusX &&
      focus.y === this.shadowFocusY &&
      focus.z === this.shadowFocusZ
    ) {
      return;
    }
    this.shadowFocusX = focus.x;
    this.shadowFocusY = focus.y;
    this.shadowFocusZ = focus.z;

    const sunDirection = this.lighting.sunDirection;
    const snappedX =
      Math.round(focus.dot(this.shadowAxisX) / this.shadowTexelSize) *
      this.shadowTexelSize;
    const snappedY =
      Math.round(focus.dot(this.shadowAxisY) / this.shadowTexelSize) *
      this.shadowTexelSize;
    const alongLight = focus.dot(sunDirection);

    this.sun.target.position
      .copy(this.shadowAxisX)
      .multiplyScalar(snappedX)
      .addScaledVector(this.shadowAxisY, snappedY)
      .addScaledVector(sunDirection, alongLight);
    this.sun.position
      .copy(this.sun.target.position)
      .addScaledVector(sunDirection, WORLD_SUN_SHADOW_DISTANCE);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  get materialContext(): WorldNodeMaterialContext {
    this.context ??= new WorldNodeMaterialContext(
      this.sun,
      [this.hemisphere, this.ambient],
      this.cloudShadow.nodes,
      this.lighting,
    );
    return this.context;
  }

  prepareFrame(camera: THREE.PerspectiveCamera): void {
    if (!this.disposed) this.sky.prepareFrame(camera);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeSafely(this.sky, "Sky");
    disposeSafely(this.cloudShadow, "Cloud shadow system");
    disposeSafely(this.cloudLighting, "Cloud lighting");
    disposeSafely(this.sun.shadow, "Sun shadow");
    this.scene.remove(this.hemisphere, this.ambient, this.sun, this.sun.target);
  }

  private rebuildShadowBasis(): void {
    this.shadowAxisX.crossVectors(UP_AXIS, this.lighting.sunDirection);
    if (this.shadowAxisX.lengthSq() < 1e-8) {
      this.shadowAxisX.copy(FALLBACK_SHADOW_AXIS);
    } else {
      this.shadowAxisX.normalize();
    }
    this.shadowAxisY
      .crossVectors(this.lighting.sunDirection, this.shadowAxisX)
      .normalize();
  }

  private invalidateShadowFocus(): void {
    this.shadowFocusX = Number.NaN;
    this.shadowFocusY = Number.NaN;
    this.shadowFocusZ = Number.NaN;
  }

  private configureShadow(): void {
    this.sun.shadow.camera.left = -WORLD_SUN_SHADOW_HALF_EXTENT;
    this.sun.shadow.camera.right = WORLD_SUN_SHADOW_HALF_EXTENT;
    this.sun.shadow.camera.top = WORLD_SUN_SHADOW_HALF_EXTENT;
    this.sun.shadow.camera.bottom = -WORLD_SUN_SHADOW_HALF_EXTENT;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = WORLD_SUN_SHADOW_DISTANCE * 2;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
  }
}

function isFiniteVector(value: THREE.Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function disposeSafely(resource: { dispose(): void } | undefined, label: string): void {
  if (!resource) {
    return;
  }
  try {
    resource.dispose();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}
