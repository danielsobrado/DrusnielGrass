import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { WeatherPresetId } from "../world/experience/WorldExperienceCatalog";
import type { ResolvedWorldEnvironmentPreset } from "../world/weather/WorldEnvironmentPresetResolver";
import {
  WORLD_DEFAULT_COMPACT_FOG_DENSITY,
  WORLD_DEFAULT_DESKTOP_FOG_DENSITY,
  WORLD_DEFAULT_FOG,
  WORLD_DEFAULT_HEMISPHERE_GROUND,
  WORLD_DEFAULT_HEMISPHERE_INTENSITY,
  WORLD_DEFAULT_HEMISPHERE_SKY,
  WORLD_DEFAULT_SUN,
  WORLD_DEFAULT_SUN_INTENSITY,
  WORLD_SKY_HAZE,
  WORLD_SKY_HORIZON,
  WORLD_SKY_SUN,
  WORLD_SKY_ZENITH,
  WORLD_SUN_DIRECTION,
} from "../app/WorldEnvironmentTuning";

/**
 * Mutable render-only lighting state shared by every weather-aware consumer.
 * Ecology deliberately does not read this object; its long-term reference sun
 * remains the fixed WORLD_SUN_DIRECTION imported by the ecology fields.
 */
export class WorldLightingState {
  readonly sunDirection = new THREE.Vector3();
  readonly sunColor = new THREE.Color();
  readonly hemisphereSkyColor = new THREE.Color();
  readonly hemisphereGroundColor = new THREE.Color();
  readonly ambientColor = new THREE.Color("#ffffff");
  readonly fogColor = new THREE.Color();
  readonly skyZenithColor = new THREE.Color();
  readonly skyHorizonColor = new THREE.Color();
  readonly skyHazeColor = new THREE.Color();
  readonly skySunHaloColor = new THREE.Color();
  readonly skySunDiskColor = new THREE.Color();

  presetId: WeatherPresetId = "drusniel";
  label = "Drusniel";
  baseline = true;
  sunIntensity = WORLD_DEFAULT_SUN_INTENSITY;
  hemisphereIntensity = WORLD_DEFAULT_HEMISPHERE_INTENSITY;
  ambientIntensity = 0;
  fogDensity = 0;
  environmentIntensity = 1;
  cloudThreshold = 0;
  skyHaloPower = 28;
  skyDiskPower = 10000;
  revision = 0;

  constructor(private readonly profile: RuntimeProfile) {
    this.applyBaseline();
  }

  apply(preset: ResolvedWorldEnvironmentPreset): void {
    if (preset.baseline) {
      this.applyBaseline();
      return;
    }
    this.presetId = preset.id;
    this.label = preset.label;
    this.baseline = false;
    this.sunDirection.set(...(preset.sunDirection ?? WORLD_SUN_DIRECTION)).normalize();
    this.sunColor.set(preset.sunColor ?? WORLD_DEFAULT_SUN);
    this.sunIntensity = WORLD_DEFAULT_SUN_INTENSITY * preset.sunIntensityScale;
    this.hemisphereSkyColor.set(
      preset.hemisphereSkyColor ?? WORLD_DEFAULT_HEMISPHERE_SKY,
    );
    this.hemisphereGroundColor.set(
      preset.hemisphereGroundColor ?? WORLD_DEFAULT_HEMISPHERE_GROUND,
    );
    // Source light ratios are scaled by the same factor that maps Highfield's
    // directional intensity 5 to the destination's direct-light baseline.
    this.hemisphereIntensity =
      WORLD_DEFAULT_SUN_INTENSITY * preset.hemisphereIntensityScale;
    this.ambientColor.set(preset.ambientColor ?? "#ffffff");
    this.ambientIntensity =
      WORLD_DEFAULT_SUN_INTENSITY * preset.ambientIntensityScale;
    this.fogColor.set(preset.fogColor ?? WORLD_DEFAULT_FOG);
    this.fogDensity = this.resolveBaselineFogDensity() * preset.fogDensityScale;
    this.environmentIntensity = preset.environmentIntensity;
    this.cloudThreshold = preset.cloudThreshold ?? this.profile.cloud.coverage;
    this.skyZenithColor.set(preset.skyZenithColor ?? WORLD_SKY_ZENITH);
    this.skyHorizonColor.set(preset.skyHorizonColor ?? WORLD_SKY_HORIZON);
    this.skyHazeColor.copy(this.fogColor);
    this.skySunHaloColor.set(preset.skySunHaloColor ?? WORLD_SKY_SUN);
    this.skySunDiskColor.set(preset.skySunDiskColor ?? WORLD_SKY_SUN);
    this.skyHaloPower = preset.skyHaloPower ?? 28;
    this.skyDiskPower = preset.skyDiskPower ?? 10000;
    this.revision += 1;
  }

  private applyBaseline(): void {
    this.presetId = "drusniel";
    this.label = "Drusniel";
    this.baseline = true;
    this.sunDirection.set(...WORLD_SUN_DIRECTION).normalize();
    this.sunColor.set(WORLD_DEFAULT_SUN);
    this.sunIntensity = WORLD_DEFAULT_SUN_INTENSITY;
    this.hemisphereSkyColor.set(WORLD_DEFAULT_HEMISPHERE_SKY);
    this.hemisphereGroundColor.set(WORLD_DEFAULT_HEMISPHERE_GROUND);
    this.hemisphereIntensity = WORLD_DEFAULT_HEMISPHERE_INTENSITY;
    this.ambientColor.set("#ffffff");
    this.ambientIntensity = 0;
    this.fogColor.set(WORLD_DEFAULT_FOG);
    this.fogDensity = this.resolveBaselineFogDensity();
    this.environmentIntensity = 1;
    this.cloudThreshold = this.profile.cloud.coverage;
    this.skyZenithColor.set(WORLD_SKY_ZENITH);
    this.skyHorizonColor.set(WORLD_SKY_HORIZON);
    this.skyHazeColor.set(WORLD_SKY_HAZE);
    this.skySunHaloColor.set(WORLD_SKY_SUN);
    this.skySunDiskColor.set(WORLD_SKY_SUN);
    this.skyHaloPower = 28;
    this.skyDiskPower = 10000;
    this.revision += 1;
  }

  private resolveBaselineFogDensity(): number {
    return this.profile.compact
      ? WORLD_DEFAULT_COMPACT_FOG_DENSITY
      : WORLD_DEFAULT_DESKTOP_FOG_DENSITY;
  }
}
