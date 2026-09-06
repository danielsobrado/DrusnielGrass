import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import {
  resolveCloudWeatherRegime,
  sampleCloudPointDirectTransmittance,
  sampleCloudWeatherAmount,
  type CloudWeatherRegime,
} from "../world/sky/WorldCloudWeather";
import {
  WORLD_DEFAULT_COMPACT_FOG_DENSITY,
  WORLD_DEFAULT_DESKTOP_FOG_DENSITY,
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
  WORLD_SUN_DIRECTION,
} from "./WorldEnvironmentTuning";

const SUN_DIRECTION = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();
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
  private directTransmittance = 1;
  private weatherAmount = 0;
  private directAttenuationEnabled = true;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly profile: RuntimeProfile,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemisphere: THREE.HemisphereLight,
  ) {}

  update(
    deltaSeconds: number,
    focus: THREE.Vector3,
    elapsedSeconds: number,
  ): void {
    const cloud = this.profile.cloud;
    const targetTransmittance = sampleCloudPointDirectTransmittance(
      cloud,
      this.profile.compact,
      focus.x,
      focus.y,
      focus.z,
      elapsedSeconds,
      SUN_DIRECTION,
    );
    const heightToCloud = Math.max(cloud.baseHeight - focus.y, 0);
    const cloudHeightAlongSun =
      heightToCloud / Math.max(SUN_DIRECTION.y, 0.01);
    const sampleX = focus.x + SUN_DIRECTION.x * cloudHeightAlongSun;
    const sampleZ = focus.z + SUN_DIRECTION.z * cloudHeightAlongSun;
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
    const cloud = this.profile.cloud;
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

    const fog = this.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.color.copy(DEFAULT_FOG_COLOR).lerp(OVERCAST_FOG_COLOR, grade);
      fog.density =
        this.resolveDefaultFogDensity() *
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

  private resolveDefaultFogDensity(): number {
    return this.profile.compact
      ? WORLD_DEFAULT_COMPACT_FOG_DENSITY
      : WORLD_DEFAULT_DESKTOP_FOG_DENSITY;
  }
}
