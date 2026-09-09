import { uniform } from "three/tsl";
import {
  WORLD_WETNESS_DRYING_SECONDS,
  WORLD_WETNESS_WETTING_SECONDS,
} from "./WorldRainTuning";

export function approachWetness(
  current: number,
  target: number,
  deltaSeconds: number,
  wettingSeconds = WORLD_WETNESS_WETTING_SECONDS,
  dryingSeconds = WORLD_WETNESS_DRYING_SECONDS,
): number {
  const resolvedCurrent = clamp01(current);
  const resolvedTarget = clamp01(target);
  const delta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const timeConstant = resolvedTarget > resolvedCurrent
    ? positiveSeconds(wettingSeconds, WORLD_WETNESS_WETTING_SECONDS)
    : positiveSeconds(dryingSeconds, WORLD_WETNESS_DRYING_SECONDS);
  const amount = 1 - Math.exp(-delta / timeConstant);
  return resolvedCurrent + (resolvedTarget - resolvedCurrent) * amount;
}

/** Frame-rate-independent rain wetness shared by all opted-in opaque materials. */
export class WorldWetness {
  readonly uniform = uniform(0);
  private target = 0;

  constructor(
    private readonly wettingSeconds = WORLD_WETNESS_WETTING_SECONDS,
    private readonly dryingSeconds = WORLD_WETNESS_DRYING_SECONDS,
  ) {
    if (!(wettingSeconds > 0) || !(dryingSeconds > 0)) {
      throw new Error("Wetness response times must be positive.");
    }
  }

  get value(): number {
    return this.uniform.value;
  }

  setRainIntensity(value: number): void {
    this.target = clamp01(value);
  }

  update(deltaSeconds: number): void {
    this.uniform.value = approachWetness(
      this.uniform.value,
      this.target,
      deltaSeconds,
      this.wettingSeconds,
      this.dryingSeconds,
    );
  }

  reset(): void {
    this.target = 0;
    this.uniform.value = 0;
  }
}

function clamp01(value: number): number {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}

function positiveSeconds(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
