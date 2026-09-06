import type { QuadrupedMotionFacts } from "../quadruped/QuadrupedMotionFacts";
import {
  createDeerHabitatSample,
  type DeerHabitat,
  type DeerHabitatSample,
} from "./DeerHabitat";

/** What the animal wants to do, handed to the actor to physically carry out. */
export interface DeerSteering {
  targetX: number;
  targetZ: number;
  desiredSpeed: number;
}

export interface DeerBehaviorOptions {
  readonly habitat: DeerHabitat;
  readonly facts: QuadrupedMotionFacts;
  readonly walkSpeed: number;
  readonly seed: number;
  /** Seconds between decisions. Movement stays smooth between them. */
  readonly decisionIntervalSeconds: number;
  /** Stagger, so a herd never decides on the same frame. */
  readonly decisionPhaseSeconds: number;
  readonly alertRadius: number;
  readonly fleeRadius: number;
}

const STATE_GRAZE = 0;
const STATE_BROWSE = 1;
const STATE_TRAVEL = 2;
const STATE_ALERT = 3;
const STATE_FLEE = 4;

const GRAZE_SECONDS = [6, 14] as const;
const BROWSE_DISTANCE = [1.5, 4] as const;
const TRAVEL_DISTANCE = [12, 30] as const;
const TRAVEL_CHANCE = 0.18;
const FLEE_SECONDS = [3, 5] as const;
const FLEE_SPEED_SCALE = 1.8;
const BROWSE_SPEED_SCALE = 0.45;
const CANDIDATE_COUNT = 8;
const MIN_FORAGE = 0.25;
const MAX_WATER = 0.03;
const MIN_SLOPE_UP = 0.72;
/** How strongly the animal is drawn back toward its herd's anchor. */
const HERD_PULL = 0.45;
const ATTENTION_HEIGHT = 1.1;
const FACT_EASE_RATE = 4.5;

/**
 * What a deer does with its day.
 *
 * The previous animals walked a perfect circle at constant speed forever, which
 * is the single most artificial thing about them — more than the geometry, since
 * a viewer forgives a rough shape long before they forgive a path no animal
 * would ever take. This replaces it with the loop deer actually run: eat, take a
 * few steps to better grass, occasionally move somewhere else entirely, look up
 * when something approaches, and leave when it gets too close.
 *
 * Decisions are throttled and staggered per animal; movement between them stays
 * per-frame and smooth. The cadence is deliberately independent of the animation
 * cadence, so an animal too far away to be animated is still living its life and
 * is somewhere sensible when it comes back into view.
 */
export class DeerBehavior {
  private readonly candidate: DeerHabitatSample = createDeerHabitatSample();
  private state = STATE_GRAZE;
  private stateSeconds = 0;
  private stateDuration = 0;
  private decisionClock: number;
  private random: number;
  private anchorX = 0;
  private anchorZ = 0;
  private targetX = 0;
  private targetZ = 0;
  private desiredSpeed = 0;

  constructor(private readonly options: DeerBehaviorOptions) {
    this.random = normalizeSeed(options.seed);
    this.decisionClock = options.decisionPhaseSeconds;
    this.stateDuration = this.spanPick(GRAZE_SECONDS);
  }

  /** Re-homes the animal, for a recycled actor arriving somewhere new. */
  reset(
    anchorX: number,
    anchorZ: number,
    positionX: number,
    positionZ: number,
    seed = this.options.seed,
  ): void {
    this.random = normalizeSeed(seed);
    this.decisionClock = this.options.decisionPhaseSeconds;
    this.anchorX = anchorX;
    this.anchorZ = anchorZ;
    this.targetX = positionX;
    this.targetZ = positionZ;
    this.desiredSpeed = 0;
    this.state = STATE_GRAZE;
    this.stateSeconds = 0;
    this.stateDuration = this.spanPick(GRAZE_SECONDS);
    this.options.facts.alert = 0;
    this.options.facts.grazing = 1;
  }

  update(
    deltaSeconds: number,
    positionX: number,
    positionZ: number,
    focusX: number,
    focusY: number,
    focusZ: number,
    steering: DeerSteering,
  ): void {
    const delta = clamp(deltaSeconds, 0, 0.25);
    this.stateSeconds += delta;
    this.decisionClock -= delta;

    const toFocus = Math.hypot(focusX - positionX, focusZ - positionZ);
    this.reactToFocus(toFocus, positionX, positionZ, focusX, focusZ);

    if (this.decisionClock <= 0) {
      this.decisionClock += this.options.decisionIntervalSeconds;
      this.decide(positionX, positionZ, focusX, focusZ);
    }

    // Attention is always the thing that alarmed it, held at roughly eye height
    // so the head aims level rather than at the player's boots.
    const facts = this.options.facts;
    facts.attentionX = focusX;
    facts.attentionY = focusY + ATTENTION_HEIGHT;
    facts.attentionZ = focusZ;
    const wantAlert = this.state === STATE_ALERT || this.state === STATE_FLEE ? 1 : 0;
    const wantGraze = this.state === STATE_GRAZE ? 1 : 0;
    const ease = 1 - Math.exp(-FACT_EASE_RATE * delta);
    facts.alert += (wantAlert - facts.alert) * ease;
    facts.grazing += (wantGraze - facts.grazing) * ease;

    steering.targetX = this.targetX;
    steering.targetZ = this.targetZ;
    steering.desiredSpeed = this.desiredSpeed;
  }

  /**
   * Something approaching outranks whatever the animal was doing.
   *
   * Checked every frame rather than on the decision tick, because a deer that
   * keeps eating for another fifth of a second while somebody walks into it is
   * the exact moment the illusion breaks.
   */
  private reactToFocus(
    distance: number,
    positionX: number,
    positionZ: number,
    focusX: number,
    focusZ: number,
  ): void {
    if (distance < this.options.fleeRadius && this.state !== STATE_FLEE) {
      this.state = STATE_FLEE;
      this.stateSeconds = 0;
      this.stateDuration = this.spanPick(FLEE_SECONDS);
      const awayX = positionX - focusX;
      const awayZ = positionZ - focusZ;
      const length = Math.hypot(awayX, awayZ) || 1;
      const run = 10 + this.unitPick() * 8;
      this.targetX = positionX + (awayX / length) * run;
      this.targetZ = positionZ + (awayZ / length) * run;
      this.desiredSpeed = this.options.walkSpeed * FLEE_SPEED_SCALE;
      return;
    }
    if (
      distance < this.options.alertRadius &&
      this.state !== STATE_FLEE &&
      this.state !== STATE_ALERT &&
      this.state !== STATE_TRAVEL
    ) {
      this.state = STATE_ALERT;
      this.stateSeconds = 0;
      this.stateDuration = 2.5 + this.unitPick() * 2.5;
      this.desiredSpeed = 0;
    }
  }

  private decide(
    positionX: number,
    positionZ: number,
    focusX: number,
    focusZ: number,
  ): void {
    const arrived =
      Math.hypot(this.targetX - positionX, this.targetZ - positionZ) < 0.5;
    switch (this.state) {
      case STATE_FLEE:
        if (this.stateSeconds >= this.stateDuration || arrived) {
          this.enterAlert();
        }
        return;
      case STATE_ALERT:
        if (
          this.stateSeconds >= this.stateDuration &&
          Math.hypot(focusX - positionX, focusZ - positionZ) >
            this.options.alertRadius
        ) {
          this.enterGraze();
        }
        return;
      case STATE_BROWSE:
      case STATE_TRAVEL:
        if (arrived || this.stateSeconds >= this.stateDuration) {
          this.enterGraze();
        }
        return;
      default:
        if (this.stateSeconds >= this.stateDuration) {
          this.enterMove(positionX, positionZ);
        }
    }
  }

  private enterGraze(): void {
    this.state = STATE_GRAZE;
    this.stateSeconds = 0;
    this.stateDuration = this.spanPick(GRAZE_SECONDS);
    this.desiredSpeed = 0;
  }

  private enterAlert(): void {
    this.state = STATE_ALERT;
    this.stateSeconds = 0;
    this.stateDuration = 2 + this.unitPick() * 2;
    this.desiredSpeed = 0;
  }

  /**
   * Picks somewhere to walk, biased toward better grass.
   *
   * Candidates are scored rather than accepted first-fit, so an animal drifts
   * uphill in forage over time instead of wandering at random — which is what
   * makes a herd gather on the good ground by itself, with no herding rule.
   */
  private enterMove(positionX: number, positionZ: number): void {
    const travelling = this.unitPick() < TRAVEL_CHANCE;
    const span = travelling ? TRAVEL_DISTANCE : BROWSE_DISTANCE;
    let bestX = positionX;
    let bestZ = positionZ;
    let bestScore = -1;
    for (let attempt = 0; attempt < CANDIDATE_COUNT; attempt += 1) {
      const angle = this.unitPick() * Math.PI * 2;
      const reach = this.spanPick(span);
      const x = positionX + Math.cos(angle) * reach;
      const z = positionZ + Math.sin(angle) * reach;
      this.options.habitat.sample(x, z, this.candidate);
      if (
        this.candidate.water > MAX_WATER ||
        this.candidate.slopeUp < MIN_SLOPE_UP ||
        this.candidate.forage < MIN_FORAGE
      ) {
        continue;
      }
      // Forage pulls the animal toward food; the anchor term keeps the herd
      // loosely together without any animal steering at another animal.
      const anchorDistance = Math.hypot(x - this.anchorX, z - this.anchorZ);
      const score =
        this.candidate.forage - anchorDistance * HERD_PULL * 0.02;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestZ = z;
      }
    }
    if (bestScore < 0) {
      // Nowhere good nearby: head back to the anchor rather than stand still.
      bestX = this.anchorX;
      bestZ = this.anchorZ;
    }
    this.state = travelling ? STATE_TRAVEL : STATE_BROWSE;
    this.stateSeconds = 0;
    this.stateDuration = travelling ? 26 : 9;
    this.targetX = bestX;
    this.targetZ = bestZ;
    this.desiredSpeed =
      this.options.walkSpeed * (travelling ? 1 : BROWSE_SPEED_SCALE);
  }

  /** Deterministic per-animal noise. Not shared, so herds stay uncorrelated. */
  private unitPick(): number {
    this.random = (this.random * 1664525 + 1013904223) >>> 0;
    return this.random / 4294967296;
  }

  private spanPick(span: readonly [number, number]): number {
    return span[0] + this.unitPick() * (span[1] - span[0]);
  }
}

function normalizeSeed(seed: number): number {
  return (seed >>> 0) || 1;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(Math.max(value, minimum), maximum);
}
