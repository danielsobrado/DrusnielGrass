/**
 * Bone identity for the shared actor runtime.
 *
 * There is deliberately no global bone enum. A rig definition owns a contiguous
 * `0..boneCount-1` index range that is stable for that definition, and profiles
 * resolve the indexes they care about once at initialization. Hot-path code
 * stores the resolved numbers, never a name.
 */
export type ActorBoneIndex = number & {
  readonly __actorBoneIndex: unique symbol;
};

/** Sentinel for an absent optional bone. Never a valid index. */
export const ACTOR_NO_BONE = -1;

/** Upper bound on rig size, so pose buffers stay small and bounded. */
export const ACTOR_MAX_BONE_COUNT = 256;

export function asActorBoneIndex(value: number): ActorBoneIndex {
  if (!Number.isInteger(value) || value < 0 || value >= ACTOR_MAX_BONE_COUNT) {
    throw new Error(`Actor bone index ${value} is out of range.`);
  }
  return value as ActorBoneIndex;
}

export function isActorBoneIndex(
  value: number,
  boneCount: number,
): value is ActorBoneIndex {
  return Number.isInteger(value) && value >= 0 && value < boneCount;
}
