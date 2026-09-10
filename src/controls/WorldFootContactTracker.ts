import * as THREE from "three";
import type { ActorGait } from "../actor/animation/ActorGait";

export type WorldFootId = "left" | "right";

export interface WorldFootContactEvent {
  readonly sequence: number;
  readonly foot: WorldFootId;
  readonly position: THREE.Vector3;
  readonly groundedSpeed: number;
  readonly landing: boolean;
  readonly impact: number;
}

export interface WorldFootContactSample {
  readonly gait: ActorGait;
  readonly grounded: boolean;
  readonly teleported: boolean;
  readonly speed: number;
  readonly landing: boolean;
  readonly landingImpact: number;
  readonly airborne: boolean;
  copyFootPosition(foot: WorldFootId, target: THREE.Vector3): void;
}

const FEET: readonly WorldFootId[] = ["left", "right"];
const FOOT_INDEX: Readonly<Record<WorldFootId, number>> = { left: 0, right: 1 };
const MAX_SPEED = 12;

/**
 * Discrete stance-entry events from the existing gait, not an independent
 * cadence. One event per foot when `isInStance` rises; airborne and fly
 * cameras emit nothing.
 */
export class WorldFootContactTracker {
  private readonly planted = new Uint8Array(2);
  private readonly position = new THREE.Vector3();
  private sequence = 0;
  private disposed = false;
  private synced = false;

  reset(): void {
    this.planted[0] = 0;
    this.planted[1] = 0;
    this.synced = false;
  }

  poll(sample: WorldFootContactSample | undefined): WorldFootContactEvent[] {
    if (this.disposed) return [];
    if (!sample || sample.teleported || (sample.airborne && !sample.landing)) {
      this.reset();
      return [];
    }
    if (!this.synced) {
      this.capturePlanted(sample);
      this.synced = true;
      if (!sample.landing) return [];
    }
    const events: WorldFootContactEvent[] = [];
    if (sample.landing) {
      sample.copyFootPosition("left", this.position);
      events.push(this.emit("left", sample, true, sample.landingImpact));
      this.capturePlanted(sample);
      return events;
    }
    if (!sample.grounded) {
      this.reset();
      return events;
    }
    const gait = sample.gait;
    for (const foot of FEET) {
      const index = FOOT_INDEX[foot];
      const stance = gait.isInStance(index) ? 1 : 0;
      if (stance === 1 && this.planted[index] === 0) {
        sample.copyFootPosition(foot, this.position);
        events.push(this.emit(foot, sample, false, 0));
      }
      this.planted[index] = stance;
    }
    return events;
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  private capturePlanted(sample: WorldFootContactSample): void {
    for (const foot of FEET) {
      this.planted[FOOT_INDEX[foot]] = sample.gait.isInStance(FOOT_INDEX[foot]) ? 1 : 0;
    }
  }

  private emit(
    foot: WorldFootId,
    sample: WorldFootContactSample,
    landing: boolean,
    impact: number,
  ): WorldFootContactEvent {
    this.sequence += 1;
    return {
      sequence: this.sequence,
      foot,
      position: this.position.clone(),
      groundedSpeed: Math.min(MAX_SPEED, Math.max(0, sample.speed)),
      landing,
      impact: Math.max(0, impact),
    };
  }
}
