export const ACTOR_QUALITY_FULL = 0;
export const ACTOR_QUALITY_REDUCED = 1;
export const ACTOR_QUALITY_MINIMAL = 2;
export const ACTOR_QUALITY_CULLED = 3;

/**
 * Where the levels change and how often each one updates.
 *
 * Every number is injected. This class holds no distance and no rate of its
 * own: what counts as far away is a property of a world and a device, not of an
 * animation system, and burying it here is how it stops being tunable.
 */
export interface ActorAnimationQualityPolicy {
  /** Below this distance the actor animates every frame. */
  readonly fullDistance: number;
  readonly reducedDistance: number;
  readonly minimalDistance: number;
  /** Beyond this the actor does no animation work at all. */
  readonly cullDistance: number;
  readonly reducedIntervalSeconds: number;
  readonly minimalIntervalSeconds: number;
  /**
   * Dead band around every threshold.
   *
   * An actor sitting exactly on a boundary would otherwise change level every
   * frame as the camera breathes, and each change costs a visibility swap.
   */
  readonly hysteresisDistance: number;
}

/**
 * How much animation one non-player actor is currently worth.
 *
 * The player is never given one of these; it is pinned to full fidelity by
 * simply not having a policy. For everything else the cost of an actor should
 * fall off with distance long before anyone considers making the player cheaper.
 *
 * Lowering the update rate is safe here in a way it would not be in a
 * time-driven animation system, because the gait phase is driven by distance
 * travelled: a pose generated at 6 Hz still lands at the geometrically correct
 * point in the stride, so a slow actor loses temporal smoothness and never loses
 * foot placement. The accumulated delta is handed back so springs, breathing and
 * IK smoothing still integrate real elapsed time rather than a frame's worth.
 */
export class ActorAnimationQuality {
  private level = ACTOR_QUALITY_FULL;
  private accumulated = 0;

  constructor(private readonly policy: ActorAnimationQualityPolicy) {
    if (
      !(policy.fullDistance < policy.reducedDistance) ||
      !(policy.reducedDistance < policy.minimalDistance) ||
      !(policy.minimalDistance < policy.cullDistance)
    ) {
      throw new Error(
        "Actor animation quality distances must increase from full to culled.",
      );
    }
    if (
      !(policy.reducedIntervalSeconds > 0) ||
      !(policy.minimalIntervalSeconds >= policy.reducedIntervalSeconds)
    ) {
      throw new Error(
        "Actor animation quality intervals must be positive and coarsen with distance.",
      );
    }
  }

  getLevel(): number {
    return this.level;
  }

  /** Re-resolves the level. Returns true when it changed. */
  setDistance(distanceMeters: number): boolean {
    const distance = Number.isFinite(distanceMeters) ? distanceMeters : 0;
    const band = this.policy.hysteresisDistance;
    // A level is only left once the actor is clear of the boundary by the whole
    // dead band, in whichever direction it is travelling.
    const resolved = this.resolve(distance, band);
    if (resolved === this.level) {
      return false;
    }
    this.level = resolved;
    return true;
  }

  /**
   * Accumulates elapsed time and reports whether this actor animates now.
   *
   * Culled actors never animate; their behaviour keeps running on its own clock
   * elsewhere, which is what lets them be somewhere sensible when they return.
   */
  shouldUpdate(deltaSeconds: number): boolean {
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.accumulated += delta;
    if (this.level === ACTOR_QUALITY_CULLED) {
      this.accumulated = 0;
      return false;
    }
    if (this.level === ACTOR_QUALITY_FULL) {
      return true;
    }
    const interval =
      this.level === ACTOR_QUALITY_REDUCED
        ? this.policy.reducedIntervalSeconds
        : this.policy.minimalIntervalSeconds;
    return this.accumulated >= interval;
  }

  /** The elapsed time to animate over. Clears the accumulator. */
  takeAccumulatedSeconds(): number {
    const elapsed = this.accumulated;
    this.accumulated = 0;
    return elapsed;
  }

  /** Whether this level solves contact and pre-IK stages. */
  runsIk(): boolean {
    return this.level <= ACTOR_QUALITY_REDUCED;
  }

  /** Whether this level runs springs and other secondary motion. */
  runsSecondaryMotion(): boolean {
    return this.level <= ACTOR_QUALITY_REDUCED;
  }

  reset(): void {
    this.level = ACTOR_QUALITY_FULL;
    this.accumulated = 0;
  }

  private resolve(distance: number, band: number): number {
    const outward = this.level;
    const thresholds = [
      this.policy.fullDistance,
      this.policy.reducedDistance,
      this.policy.minimalDistance,
      this.policy.cullDistance,
    ];
    let resolved = ACTOR_QUALITY_CULLED;
    for (let index = 0; index < thresholds.length; index += 1) {
      // Widen the threshold the actor is currently inside, so leaving a level
      // costs more distance than staying in it.
      const edge = index >= outward ? thresholds[index] + band : thresholds[index];
      if (distance < edge) {
        resolved = index;
        break;
      }
    }
    return resolved;
  }
}
