import * as THREE from "three";
import type { RuntimeCloudConfig, RuntimeProfile } from "../runtime/RuntimeConfig";
import type { WorldLightingState } from "../render/WorldLightingState";
import {
  resolveCloudWeatherRegime,
  sampleCloudPointDirectTransmittance,
  sampleCloudWeatherAmount,
  type CloudWeatherRegime,
} from "../world/sky/WorldCloudWeather";
import {
  WORLD_DEFAULT_EXPOSURE,
  WORLD_DEFAULT_FOG,
  WORLD_DEFAULT_HEMISPHERE_GROUND,
  WORLD_DEFAULT_HEMISPHERE_INTENSITY,
  WORLD_DEFAULT_HEMISPHERE_SKY,
  WORLD_DEFAULT_SUN,
  WORLD_DEFAULT_SUN_INTENSITY,
  WORLD_OVERCAST_EXPOSURE_SCALE,
  WORLD_OVERCAST_FOG,
  WORLD_OVERCAST_FOG_DENSITY_SCALE,
  WORLD_OVERCAST_HEMISPHERE_GROUND,
  WORLD_OVERCAST_HEMISPHERE_SKY,
  WORLD_OVERCAST_SUN,
} from "./WorldEnvironmentTuning";

const DEFAULT_SUN_COLOR = new THREE.Color(WORLD_DEFAULT_SUN);
const DEFAULT_HEMISPHERE_SKY = new THREE.Color(WORLD_DEFAULT_HEMISPHERE_SKY);
const DEFAULT_HEMISPHERE_GROUND = new THREE.Color(
  WORLD_DEFAULT_HEMISPHERE_GROUND,
);
const DEFAULT_FOG_COLOR = new THREE.Color(WORLD_DEFAULT_FOG);
const OVERCAST_SUN_COLOR = new THREE.Color(WORLD_OVERCAST_SUN);
const OVERCAST_HEMISPHERE_SKY = new THREE.Color(
  WORLD_OVERCAST_HEMISPHERE_SKY,
);
const OVERCAST_HEMISPHERE_GROUND = new THREE.Color(
  WORLD_OVERCAST_HEMISPHERE_GROUND,
);
const OVERCAST_FOG_COLOR = new THREE.Color(WORLD_OVERCAST_FOG);

export interface WorldCloudWeatherState {
  amount: number;
  directTransmittance: number;
  regime: CloudWeatherRegime;
}

export class WorldCloudEnvironmentLighting {
  private readonly weatherState: WorldCloudWeatherState = {
    amount: 0,
    directTransmittance: 1,
    regime: "clear",
  };
  private readonly cloud: RuntimeCloudConfig;
  private directTransmittance = 1;
  private weatherAmount = 0;
  private directAttenuationEnabled = true;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: { toneMappingExposure: number },
    private readonly profile: RuntimeProfile,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemisphere: THREE.HemisphereLight,
    private readonly ambient: THREE.AmbientLight,
    private readonly lighting: WorldLightingState,
  ) {
    this.cloud = { ...profile.cloud, coverage: lighting.cloudThreshold };
  }

  applyLightingState(): void {
    this.cloud.coverage = this.lighting.cloudThreshold;
    this.apply();
  }

  update(
    deltaSeconds: number,
    focus: THREE.Vector3,
    elapsedSeconds: number,
  ): void {
    const cloud = this.cloud;
    const sunDirection = this.lighting.sunDirection;
    const targetTransmittance = sampleCloudPointDirectTransmittance(
      cloud,
      this.profile.compact,
      focus.x,
      focus.y,
      focus.z,
      elapsedSeconds,
      sunDirection,
    );
    const heightToCloud = Math.max(cloud.baseHeight - focus.y, 0);
    const cloudHeightAlongSun =
      heightToCloud / Math.max(sunDirection.y, 0.01);
    const sampleX = focus.x + sunDirection.x * cloudHeightAlongSun;
    const sampleZ = focus.z + sunDirection.z * cloudHeightAlongSun;
    const targetWeather = sampleCloudWeatherAmount(
      cloud,
      sampleX,
      sampleZ,
      elapsedSeconds,
    );
    const blend = 1 - Math.exp(-cloud.lightResponseRate * deltaSeconds);
    this.directTransmittance = THREE.MathUtils.lerp(
      this.directTransmittance,
      targetTransmittance,
      blend,
    );
    this.weatherAmount = THREE.MathUtils.lerp(
      this.weatherAmount,
      targetWeather,
      blend,
    );
    this.weatherState.amount = this.weatherAmount;
    this.weatherState.directTransmittance = this.directTransmittance;
    this.weatherState.regime = resolveCloudWeatherRegime(this.weatherAmount);
    this.scene.userData.worldCloudWeather = this.weatherState;
    this.apply();
  }

  getDirectTransmittance(): number {
    return this.directTransmittance;
  }

  getAppliedDirectTransmittance(): number {
    return this.directAttenuationEnabled ? this.directTransmittance : 1;
  }

  getWeatherState(): Readonly<WorldCloudWeatherState> {
    return this.weatherState;
  }

  setDirectAttenuationEnabled(enabled: boolean): void {
    this.directAttenuationEnabled = enabled;
    this.apply();
  }

  apply(): void {
    if (!this.lighting.baseline) {
      // Source-style presets already carry their own illumination ratios. Cloud
      // cover attenuates only the direct key; it must not recolor the preset or
      // overwrite its hemisphere/ambient response on the next frame.
      this.sun.color.copy(this.lighting.sunColor);
      this.sun.intensity =
        this.lighting.sunIntensity * this.getAppliedDirectTransmittance();
      this.hemisphere.color.copy(this.lighting.hemisphereSkyColor);
      this.hemisphere.groundColor.copy(this.lighting.hemisphereGroundColor);
      this.hemisphere.intensity = this.lighting.hemisphereIntensity;
      this.ambient.color.copy(this.lighting.ambientColor);
      this.ambient.intensity = this.lighting.ambientIntensity;
      const fog = this.scene.fog;
      if (fog instanceof THREE.FogExp2) {
        fog.color.copy(this.lighting.fogColor);
        fog.density = this.lighting.fogDensity;
      }
      this.renderer.toneMappingExposure = WORLD_DEFAULT_EXPOSURE;
      return;
    }

    // Drusniel is an exact compatibility baseline: retain the destination's
    // existing dynamic overcast grade rather than approximating it as a preset.
    const cloud = this.cloud;
    const grade = THREE.MathUtils.clamp(
      this.weatherAmount * cloud.weatherGradeStrength,
      0,
      1,
    );
    this.sun.intensity =
      WORLD_DEFAULT_SUN_INTENSITY * this.getAppliedDirectTransmittance();
    this.sun.color.copy(DEFAULT_SUN_COLOR).lerp(OVERCAST_SUN_COLOR, grade);
    this.hemisphere.color
      .copy(DEFAULT_HEMISPHERE_SKY)
      .lerp(OVERCAST_HEMISPHERE_SKY, grade);
    this.hemisphere.groundColor
      .copy(DEFAULT_HEMISPHERE_GROUND)
      .lerp(OVERCAST_HEMISPHERE_GROUND, grade);
    this.hemisphere.intensity = WORLD_DEFAULT_HEMISPHERE_INTENSITY;
    this.ambient.intensity = 0;

    const fog = this.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.color.copy(DEFAULT_FOG_COLOR).lerp(OVERCAST_FOG_COLOR, grade);
      fog.density =
        this.lighting.fogDensity *
        THREE.MathUtils.lerp(
          1,
          WORLD_OVERCAST_FOG_DENSITY_SCALE,
          grade,
        );
    }
    this.renderer.toneMappingExposure =
      WORLD_DEFAULT_EXPOSURE *
      THREE.MathUtils.lerp(1, WORLD_OVERCAST_EXPOSURE_SCALE, grade);
  }

  dispose(): void {
    if (this.scene.userData.worldCloudWeather === this.weatherState) {
      delete this.scene.userData.worldCloudWeather;
    }
  }
}
