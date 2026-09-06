import type { WorldConfig } from "../WorldConfig";
import {
  WATERFALL_CELL_LENGTH,
  WATERFALL_CELL_MARGIN,
  WATERFALL_FACE_LENGTH,
  WATERFALL_MAJOR_CHANCE,
  WATERFALL_MAX_DROP,
  WATERFALL_MIN_DROP,
  WATERFALL_PLUNGE_LENGTH,
  WATERFALL_RECOVERY_LENGTH,
  WATERFALL_STREAM_CHANCE,
  resolveWaterfallDischargeDrop,
} from "./WaterfallTuning";

/**
 * Deterministic knickpoints along a river lane.
 *
 * Rivers here follow the rolling terrain, so nothing in the world produces a
 * cliff on its own — a fall has to be placed. Each lane is divided into cells
 * along its flow axis and at most one knickpoint is drawn per cell, which keeps
 * falls rare, evenly spread, and resolvable from position alone with no state.
 *
 * Small rivers break far more often than large ones. A major river dropping
 * over a ledge every few hundred metres reads as a water slide, not a river.
 */
export interface WaterfallSample {
  /** Metres the channel floor has already dropped by this point. */
  step: number;
  /** This knickpoint's full drop, or 0 where no fall is in range. */
  drop: number;
  /** 1 across the near-vertical face itself, 0 elsewhere. */
  face: number;
  /** Downstream distance from the lip; negative upstream of it. */
  lipOffset: number;
  /** World x of the governing lip. */
  lipX: number;
}

export function createWaterfallSample(): WaterfallSample {
  return { step: 0, drop: 0, face: 0, lipOffset: 0, lipX: 0 };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

function hash(lane: number, cell: number, seed: number): number {
  let value = Math.imul(lane, 374761393) ^ Math.imul(cell, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** One knickpoint, fully described by its lane and cell. */
export interface WaterfallKnickpoint {
  lane: number;
  cell: number;
  lipX: number;
  drop: number;
}

export class WaterfallField {
  constructor(private readonly config: WorldConfig) {}

  /**
   * Resolves the cell's knickpoint, or undefined when that cell drew none.
   * Pure in (lane, cell) so any consumer — carving, the water surface, or the
   * cascade mesh builder — agrees without sharing state.
   */
  resolveKnickpoint(
    lane: number,
    cell: number,
    discharge: number,
  ): WaterfallKnickpoint | undefined {
    if (this.config.waterfallEnabled < 1) return undefined;
    const chance =
      WATERFALL_STREAM_CHANCE +
      (WATERFALL_MAJOR_CHANCE - WATERFALL_STREAM_CHANCE) * clamp01(discharge);
    if (hash(lane, cell, this.config.seed + 2411) >= chance) return undefined;

    const span = WATERFALL_CELL_LENGTH - WATERFALL_CELL_MARGIN * 2;
    const lipX =
      cell * WATERFALL_CELL_LENGTH +
      WATERFALL_CELL_MARGIN +
      hash(lane, cell, this.config.seed + 2423) * span;
    const magnitude = hash(lane, cell, this.config.seed + 2437);
    const drop =
      (WATERFALL_MIN_DROP +
        (WATERFALL_MAX_DROP - WATERFALL_MIN_DROP) * magnitude) *
      resolveWaterfallDischargeDrop(discharge) *
      this.config.waterfallScale;
    return { lane, cell, lipX, drop };
  }

  /**
   * The long-profile step at one point on a lane.
   *
   * `flowSign` orients the profile so the channel always drops downstream. The
   * shape is a short face, a level plunge reach, then a long recovery back to
   * the natural terrain — the recovery has to outlast the drop by an order of
   * magnitude or the gorge below a fall closes into a pit.
   */
  sample(
    lane: number,
    x: number,
    flowSign: number,
    discharge: number,
    target: WaterfallSample,
  ): WaterfallSample {
    target.step = 0;
    target.drop = 0;
    target.face = 0;
    target.lipOffset = 0;
    target.lipX = 0;
    if (this.config.waterfallEnabled < 1) return target;

    const centerCell = Math.floor(x / WATERFALL_CELL_LENGTH);
    for (let offset = -1; offset <= 1; offset += 1) {
      const knickpoint = this.resolveKnickpoint(
        lane,
        centerCell + offset,
        discharge,
      );
      if (!knickpoint) continue;
      const downstream = (x - knickpoint.lipX) * flowSign;
      if (downstream <= 0) continue;

      const face = smoothstep(downstream, 0, WATERFALL_FACE_LENGTH);
      const plungeEnd = WATERFALL_FACE_LENGTH + WATERFALL_PLUNGE_LENGTH;
      const recovery =
        1 -
        smoothstep(downstream, plungeEnd, plungeEnd + WATERFALL_RECOVERY_LENGTH);
      const step = knickpoint.drop * face * recovery;
      if (step <= target.step) continue;

      target.step = step;
      target.drop = knickpoint.drop;
      target.face =
        smoothstep(downstream, 0, WATERFALL_FACE_LENGTH * 0.5) *
        (1 - smoothstep(downstream, WATERFALL_FACE_LENGTH, WATERFALL_FACE_LENGTH * 1.6));
      target.lipOffset = downstream;
      target.lipX = knickpoint.lipX;
    }
    return target;
  }
}
