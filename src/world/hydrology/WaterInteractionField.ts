import { sampleStoneGrassClearance } from "../stones/StoneClearance";
import type { WorldConfig } from "../WorldConfig";
import type { HydrologySample } from "./HydrologyField";

const STONE_INTERACTION_EXTRA_RADIUS = 0.75;
const MIN_RIVER_WAKE_COVERAGE = 0.02;
const WAKE_SAMPLE_COUNT = 3;
const WAKE_START_STRENGTH = 0.85;
const WAKE_END_STRENGTH = 0.55;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export interface WaterInteractionSample {
  obstacle: number;
  wake: number;
}

export function createWaterInteractionSample(): WaterInteractionSample {
  return { obstacle: 0, wake: 0 };
}

/** Resolves stone-edge and downstream-wake masks from the shared stone field. */
export class WaterInteractionField {
  constructor(private readonly config: WorldConfig) {}

  sample(
    x: number,
    z: number,
    hydrology: HydrologySample,
    stoneClearance: number,
    target: WaterInteractionSample,
  ): WaterInteractionSample {
    target.wake = 0;
    if (this.config.stonesEnabled < 1) {
      target.obstacle = 0;
      return target;
    }

    const expandedClearance = sampleStoneGrassClearance(
      x,
      z,
      STONE_INTERACTION_EXTRA_RADIUS,
    );
    target.obstacle = clamp01(1 - Math.min(stoneClearance, expandedClearance));

    if (hydrology.riverCoverage <= MIN_RIVER_WAKE_COVERAGE) {
      return target;
    }

    const flowLength = Math.hypot(hydrology.flowX, hydrology.flowZ);
    if (!(flowLength > 1e-6)) {
      return target;
    }

    const flowX = hydrology.flowX / flowLength;
    const flowZ = hydrology.flowZ / flowLength;
    let wake = 0;
    for (let index = 1; index <= WAKE_SAMPLE_COUNT; index += 1) {
      const progress = index / WAKE_SAMPLE_COUNT;
      const distance = this.config.waterStoneWakeLength * progress;
      const wakeRadius =
        STONE_INTERACTION_EXTRA_RADIUS * (0.7 + progress * 0.8);
      const upstreamClearance = sampleStoneGrassClearance(
        x - flowX * distance,
        z - flowZ * distance,
        wakeRadius,
      );
      const upstreamObstacle = clamp01(1 - upstreamClearance);
      const strength = lerp(WAKE_START_STRENGTH, WAKE_END_STRENGTH, progress);
      wake = Math.max(wake, upstreamObstacle * strength);
    }

    target.wake =
      Math.max(0, wake - target.obstacle * 0.35) * hydrology.riverCoverage;
    return target;
  }
}
