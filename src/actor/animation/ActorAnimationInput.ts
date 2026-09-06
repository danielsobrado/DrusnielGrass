import type * as THREE from "three";

/**
 * The movement facts an actor's animation is driven by.
 *
 * This is deliberately small and universal. Player input, NPC steering,
 * scripted movement, and animal behaviour all converge here, and the shared
 * runtime cannot tell which produced it. Family-specific facts — stance, gait
 * mode, cast progress — live in typed profile state owned outside this object
 * rather than growing one snapshot that knows every future ability.
 */
export interface ActorAnimationInput {
  readonly worldPosition: THREE.Vector3;
  readonly worldVelocity: THREE.Vector3;
  readonly groundNormal: THREE.Vector3;
  /** Heading in radians about +Y. */
  facing: number;
  grounded: boolean;
  /** Horizontal speed in metres per second. */
  speed: number;
  /** `speed` divided by the actor's own top speed, clamped to 0..1. */
  normalizedSpeed: number;
  /** Reference top speed, so profiles can scale gait without a config lookup. */
  referenceSpeed: number;
  acceleration: number;
  verticalVelocity: number;
  /** Ground distance travelled, which drives gait phase. */
  distanceTravelled: number;
  /** Set for the single frame after a teleport, spawn, or reset. */
  teleported: boolean;
}

export function createActorAnimationInput(
  worldPosition: THREE.Vector3,
  worldVelocity: THREE.Vector3,
  groundNormal: THREE.Vector3,
): ActorAnimationInput {
  return {
    worldPosition,
    worldVelocity,
    groundNormal,
    facing: 0,
    grounded: true,
    speed: 0,
    normalizedSpeed: 0,
    referenceSpeed: 1,
    acceleration: 0,
    verticalVelocity: 0,
    distanceTravelled: 0,
    teleported: false,
  };
}
