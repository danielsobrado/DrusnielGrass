import { uniform } from "three/tsl";

/** Shared precipitation frame state for rain, wet materials, and water ripples. */
export class WorldRainUniforms {
  readonly time = uniform(0);
  readonly intensity = uniform(0);

  setTime(seconds: number): void {
    this.time.value = Number.isFinite(seconds) ? seconds : 0;
  }

  setIntensity(value: number): void {
    this.intensity.value = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }
}
