import type { ActorBoneIndex } from "./ActorBoneIndex";

/**
 * A named attachment point on a rig.
 *
 * Sockets are rig-definition data so that effect and gameplay systems can ask
 * an actor for a documented attachment ("mouth", "hand.R") instead of reaching
 * into bone geometry. A socket an actor family does not have is simply absent —
 * consumers that require one must fail at initialization.
 */
export interface ActorSocketDefinition {
  readonly key: string;
  readonly parent: ActorBoneIndex;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
}

/** Socket keys the shared runtime understands across every actor family. */
export const ACTOR_COMMON_SOCKET_KEYS = [
  "head",
  "mouth",
  "chest",
  "effect.primary",
] as const;

export type ActorCommonSocketKey = (typeof ACTOR_COMMON_SOCKET_KEYS)[number];
