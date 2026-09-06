/**
 * What contact IK needs to know about the ground under an effector.
 *
 * The actor core never imports a terrain system. Whoever owns the world injects
 * a sampler, which keeps the animation layer independent of how the ground is
 * generated and lets a test drive it with a flat plane.
 */
export interface ActorContactSample {
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

export interface ActorTerrainContactSampler {
  /** Fills `target` with the surface height and normal at a world position. */
  sampleContact(
    worldX: number,
    worldZ: number,
    target: ActorContactSample,
  ): void;
}

export function createActorContactSample(): ActorContactSample {
  return { height: 0, normalX: 0, normalY: 1, normalZ: 0 };
}
