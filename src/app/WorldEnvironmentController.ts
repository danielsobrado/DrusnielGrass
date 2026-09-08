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
import {
  configureWorldSunShadow,
  createWorldEnvironmentLights,
  disposeSafely,
  isFiniteVector,
  rebuildWorldShadowBasis,
} from "./WorldEnvironmentLights";

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
    const lights = createWorldEnvironmentLights(lighting);
    this.hemisphere = lights.hemisphere;
    this.ambient = lights.ambient;
    this.sun = lights.sun;
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

  applyArtDirection(_direction?: GrassArtDirection): void {
    if (!this.disposed) this.cloudLighting.apply();
  }

  /** Apply the already-resolved lighting state to every environment consumer. */
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

  /** Context/device recovery rebuilds the selected preset, including its IBL. */
  handleContextRestore(): void {
    if (!this.disposed) this.applyWeatherPreset();
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
    rebuildWorldShadowBasis(
      this.lighting.sunDirection,
      this.shadowAxisX,
      this.shadowAxisY,
    );
  }

  private invalidateShadowFocus(): void {
    this.shadowFocusX = Number.NaN;
    this.shadowFocusY = Number.NaN;
    this.shadowFocusZ = Number.NaN;
  }

  private configureShadow(): void {
    configureWorldSunShadow(this.sun.shadow);
    this.sun.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
  }
}
