import { uniform } from "three/tsl";

/** Shared precipitation frame state for rain, wet materials, and water ripples. */
export class WorldRainUniforms {
  readonly time = uniform(0);
  readonly intensity = uniform(0);
  readonly windDirectionDegrees = uniform(0);
  readonly windIntensity = uniform(0);

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
}

function clamp01(value: number): number {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}
