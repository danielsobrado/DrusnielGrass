import { Vector2 } from "three/webgpu";
import { uniform } from "three/tsl";
import {
  WORLD_RAIN_AREA_METERS,
  WORLD_RAIN_WIND_DRIFT_METERS_PER_SECOND,
} from "./WorldRainTuning";

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Shared precipitation frame state for rain, wet materials, and water ripples. */
export class WorldRainUniforms {
  readonly time = uniform(0);
  readonly intensity = uniform(0);
  readonly windDirectionDegrees = uniform(0);
  readonly windIntensity = uniform(0);
  readonly driftOffset = uniform(new Vector2());

  setTime(seconds: number): void {
    this.time.value = Number.isFinite(seconds) ? seconds : 0;
  }

  setIntensity(value: number): void {
    this.intensity.value = clamp01(value);
  }

  setWind(directionDegrees: number, intensity: number): void {
    this.windDirectionDegrees.value = Number.isFinite(directionDegrees) ? directionDegrees : 0;
    this.windIntensity.value = Math.max(0, Number.isFinite(intensity) ? intensity : 0);
  }

  /** Integrates horizontal travel so later wind changes never rewrite prior motion. */
  advanceDrift(deltaSeconds: number): void {
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    if (delta === 0) return;
    const radians = this.windDirectionDegrees.value * DEGREES_TO_RADIANS;
    const distance = this.windIntensity.value * WORLD_RAIN_WIND_DRIFT_METERS_PER_SECOND * delta;
    const drift = this.driftOffset.value;
    drift.set(
      wrapDistance(drift.x + Math.cos(radians) * distance),
      wrapDistance(drift.y + Math.sin(radians) * distance),
    );
  }
}

function clamp01(value: number): number {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}

function wrapDistance(value: number): number {
  const period = WORLD_RAIN_AREA_METERS;
  return ((value % period) + period) % period;
}
