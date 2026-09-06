/**
 * Closed-loop quality control for the grass field.
 *
 * Fixed budgets cannot hold a frame rate across the device spread a streamed
 * world targets, so the governor trades the least visible quality first. Every
 * knob it owns already exists and already rides the dither/coverage machinery
 * the LOD fades use, which is why a tier change cannot pop: lowering the
 * density scale raises the same threshold the distance fades raise, and the
 * survivors are widened and colour-compensated by the same sub-pixel clamp.
 *
 * This is the safety net, not the product. The static wins (the mid draw
 * truncation, the distance density falloff, the far draw consolidation) are
 * what the budget is actually built on; the governor only absorbs the
 * worst-case frames those leave behind.
 */

export interface GrassQualityTier {
  /** Multiplies the LOD keep threshold's density on every grass layer. */
  densityScale: number;
  /** Multiplies the mid layer's distance density floor. */
  midFloorScale: number;
  /** Extra thinning for the doubled ultra-near layer. */
  ultraDensityScale: number;
  /** Close-range waxy highlight. */
  sheen: boolean;
  /** Impostor four-view stochastic blend. */
  blendViews: boolean;
  /** Near-band distance multiplier; the lowest tier streams less dense detail. */
  nearDistanceScale: number;
  /**
   * Detail-foliage coverage. Zero disables the accent layer outright: it is the
   * most decorative layer in the frame and therefore the first whole feature
   * worth spending, but only after the cheaper density knobs above.
   */
  accentDensityScale: number;
}

/**
 * Tiers must be monotonically non-increasing in every scalar and may never
 * exceed the preset budget (scale 1). `verify-grass-performance` re-checks
 * both, so a tier can never be edited into a quality *increase*.
 */
export const GRASS_QUALITY_TIERS: readonly GrassQualityTier[] = Object.freeze([
  {
    densityScale: 1,
    midFloorScale: 1,
    ultraDensityScale: 1,
    sheen: true,
    blendViews: true,
    nearDistanceScale: 1,
    accentDensityScale: 1,
  },
  {
    densityScale: 0.8,
    midFloorScale: 0.72,
    ultraDensityScale: 0.9,
    sheen: true,
    blendViews: true,
    nearDistanceScale: 1,
    accentDensityScale: 0.85,
  },
  {
    densityScale: 0.66,
    midFloorScale: 0.58,
    ultraDensityScale: 0.7,
    sheen: false,
    blendViews: true,
    nearDistanceScale: 1,
    accentDensityScale: 0.4,
  },
  {
    densityScale: 0.5,
    midFloorScale: 0.42,
    ultraDensityScale: 0.5,
    sheen: false,
    blendViews: false,
    nearDistanceScale: 1,
    accentDensityScale: 0,
  },
]);

const EVALUATION_WINDOW_SECONDS = 1.5;
const DROP_AFTER_SECONDS = 1;
const RAISE_AFTER_SECONDS = 6;
const DROP_FRACTION = 0.9;
const RAISE_FRACTION = 1.05;
const MAX_SAMPLE_DELTA_SECONDS = 0.25;
/**
 * Maximum scalar ramp rate. A full-scale change would take this many seconds;
 * ordinary adjacent tier changes are smaller and therefore complete sooner.
 */
const RAMP_SECONDS = 0.75;
/**
 * Seconds the closed loop stays silent after construction. Spawn floods the
 * frame with terrain and grass builds whose cost density cannot fix, so
 * reacting to it started every session with a quality dip that then took the
 * full raise hysteresis — six seconds per tier — to climb back out of.
 */
const STARTUP_GRACE_SECONDS = 2.5;

export class GrassQualityGovernor {
  private tier = 0;
  private pinnedTier?: number;
  private graceRemaining = STARTUP_GRACE_SECONDS;
  private densityScale = 1;
  private midFloorScale = 1;
  private ultraDensityScale = 1;
  private nearDistanceScale = 1;
  private accentDensityScale = 1;
  private windowElapsed = 0;
  private windowFrames = 0;
  private windowSeconds = 0;
  private belowSeconds = 0;
  private aboveSeconds = 0;
  private tierElapsedSeconds = 0;

  constructor(private readonly targetFps: number) {
    if (!Number.isFinite(targetFps) || targetFps <= 0) {
      throw new Error("Grass quality target FPS must be a positive number.");
    }
  }

  /**
   * Pins a tier for reproducible captures. QA fixtures need the same tier every
   * run or before/after numbers mean nothing.
   */
  pinTier(tier: number | undefined): void {
    this.pinnedTier =
      tier === undefined
        ? undefined
        : Math.min(
            GRASS_QUALITY_TIERS.length - 1,
            Math.max(0, Math.round(Number.isFinite(tier) ? tier : 0)),
          );
    if (this.pinnedTier !== undefined) {
      if (this.tier !== this.pinnedTier) {
        this.tierElapsedSeconds = 0;
      }
      this.tier = this.pinnedTier;
      const pinned = GRASS_QUALITY_TIERS[this.tier];
      this.densityScale = pinned.densityScale;
      this.midFloorScale = pinned.midFloorScale;
      this.ultraDensityScale = pinned.ultraDensityScale;
      this.nearDistanceScale = pinned.nearDistanceScale;
      this.accentDensityScale = pinned.accentDensityScale;
      this.resetSamplingWindow();
    }
  }

  /** Returns true when any applied value changed and needs pushing out. */
  update(deltaSeconds: number): boolean {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return false;
    }
    if (deltaSeconds > MAX_SAMPLE_DELTA_SECONDS) {
      this.resetSamplingWindow();
      return false;
    }

    this.tierElapsedSeconds += deltaSeconds;
    if (this.graceRemaining > 0) {
      // Startup grace: let spawn-time build spikes pass without reacting, and
      // keep the sampling window empty so they cannot poison the first real
      // evaluation either.
      this.graceRemaining = Math.max(0, this.graceRemaining - deltaSeconds);
      return this.advanceRamp(deltaSeconds);
    }
    if (this.pinnedTier === undefined) {
      this.advanceTierDecision(deltaSeconds);
    }
    return this.advanceRamp(deltaSeconds);
  }

  private advanceTierDecision(deltaSeconds: number): void {
    this.windowFrames += 1;
    this.windowSeconds += deltaSeconds;
    this.windowElapsed += deltaSeconds;
    if (this.windowElapsed < EVALUATION_WINDOW_SECONDS) {
      return;
    }
    const fps =
      this.windowSeconds > 0 ? this.windowFrames / this.windowSeconds : 0;
    this.resetSamplingWindow(false);

    if (fps < this.targetFps * DROP_FRACTION) {
      this.belowSeconds += EVALUATION_WINDOW_SECONDS;
      this.aboveSeconds = 0;
    } else if (fps > this.targetFps * RAISE_FRACTION) {
      this.aboveSeconds += EVALUATION_WINDOW_SECONDS;
      this.belowSeconds = 0;
    } else {
      this.belowSeconds = 0;
      this.aboveSeconds = 0;
    }

    if (
      this.belowSeconds >= DROP_AFTER_SECONDS &&
      this.tier < GRASS_QUALITY_TIERS.length - 1
    ) {
      this.tier += 1;
      this.tierElapsedSeconds = 0;
      this.belowSeconds = 0;
    } else if (this.aboveSeconds >= RAISE_AFTER_SECONDS && this.tier > 0) {
      this.tier -= 1;
      this.tierElapsedSeconds = 0;
      this.aboveSeconds = 0;
    }
  }

  private advanceRamp(deltaSeconds: number): boolean {
    const target = GRASS_QUALITY_TIERS[this.tier];
    const step = deltaSeconds / RAMP_SECONDS;
    const density = approach(this.densityScale, target.densityScale, step);
    const midFloor = approach(this.midFloorScale, target.midFloorScale, step);
    const ultra = approach(
      this.ultraDensityScale,
      target.ultraDensityScale,
      step,
    );
    const nearDistance = approach(
      this.nearDistanceScale,
      target.nearDistanceScale,
      step,
    );
    const accent = approach(
      this.accentDensityScale,
      target.accentDensityScale,
      step,
    );
    const changed =
      density !== this.densityScale ||
      midFloor !== this.midFloorScale ||
      ultra !== this.ultraDensityScale ||
      nearDistance !== this.nearDistanceScale ||
      accent !== this.accentDensityScale;
    this.densityScale = density;
    this.midFloorScale = midFloor;
    this.ultraDensityScale = ultra;
    this.nearDistanceScale = nearDistance;
    this.accentDensityScale = accent;
    return changed;
  }

  private resetSamplingWindow(resetDecisionTimers = true): void {
    this.windowElapsed = 0;
    this.windowFrames = 0;
    this.windowSeconds = 0;
    if (resetDecisionTimers) {
      this.belowSeconds = 0;
      this.aboveSeconds = 0;
    }
  }

  getTier(): number {
    return this.tier;
  }

  getDensityScale(): number {
    return this.densityScale;
  }

  getSecondsInTier(): number {
    return this.tierElapsedSeconds;
  }

  getMidFloorScale(): number {
    return this.midFloorScale;
  }

  getUltraDensityScale(): number {
    return this.ultraDensityScale;
  }

  getAccentDensityScale(): number {
    return this.accentDensityScale;
  }

  getSheenEnabled(): boolean {
    return GRASS_QUALITY_TIERS[this.tier].sheen;
  }

  getBlendViews(): boolean {
    return GRASS_QUALITY_TIERS[this.tier].blendViews;
  }

  getNearDistanceScale(): number {
    return this.nearDistanceScale;
  }
}

function approach(current: number, target: number, step: number): number {
  if (current === target) {
    return target;
  }
  const delta = target - current;
  const move = Math.sign(delta) * Math.min(Math.abs(delta), step);
  const next = current + move;
  return Math.abs(target - next) < 1e-4 ? target : next;
}
