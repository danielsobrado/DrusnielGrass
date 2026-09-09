import { uniform } from "three/tsl";
import {
  WORLD_WETNESS_DRYING_SECONDS,
  WORLD_WETNESS_WETTING_SECONDS,
} from "./WorldRainTuning";

export function approachWetness(
  current: number,
  target: number,
  deltaSeconds: number,
): number {
  const resolvedCurrent = Math.max(0, Math.min(1, current));
  const resolvedTarget = Math.max(0, Math.min(1, target));
  const delta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const timeConstant = resolvedTarget > resolvedCurrent
    ? WORLD_WETNESS_WETTING_SECONDS
    : WORLD_WETNESS_DRYING_SECONDS;
  const amount = 1 - Math.exp(-delta / timeConstant);
  return resolvedCurrent + (resolvedTarget - resolvedCurrent) * amount;
}

/** Frame-rate-independent rain wetness shared by all opted-in opaque materials. */
export class WorldWetness {
  readonly uniform = uniform(0);
  private target = 0;

  get value(): number {
    return this.uniform.value;
  }

  setRainIntensity(value: number): void {
    this.target = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }

  update(deltaSeconds: number): void {
    this.uniform.value = approachWetness(this.uniform.value, this.target, deltaSeconds);
  }

  reset(): void {
    this.target = 0;
    this.uniform.value = 0;
  }
}
