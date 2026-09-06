import type * as THREE from "three";
import { ActorRigBuilder } from "./ActorRigBuilder";
import type { ActorBoneIndex } from "./ActorBoneIndex";
import type { ActorRigDefinition } from "./ActorRigDefinition";

/**
 * How an imported skeleton maps onto the actor contract.
 *
 * Everything here is supplied by the caller, because bone naming is a property
 * of whoever authored the asset, not of the actor layer. The core stays free of
 * any particular pack's conventions.
 */
export interface ImportedRigBinding {
  /** Debug name for the resulting definition. */
  readonly name: string;
  /** Semantic role for a bone, or undefined if it fills none. */
  resolveRole(boneName: string): string | undefined;
  /**
   * Bones whose subtree is dropped entirely.
   *
   * Authoring rigs commonly ship IK handles and control bones inside the skin's
   * joint list. They deform nothing and must not become part of the pose.
   */
  isExcluded?(boneName: string): boolean;
  /** Bones a secondary-motion module owns rather than the pose pipeline. */
  isSecondary?(boneName: string): boolean;
  /** Bones whose pose translation may be written. */
  allowsTranslation?(boneName: string): boolean;
}

export interface ImportedRig {
  readonly definition: ActorRigDefinition;
  /**
   * The imported bones, reordered to match the definition's indexes.
   *
   * An {@link ActorRigInstance} adopts this array, so the pose reaches the same
   * bone objects the imported skinned meshes are already bound to.
   */
  readonly bones: THREE.Bone[];
}

/**
 * A rig definition part-way through construction.
 *
 * Bones are already resolved and ordered; chains, masks, sockets, and joint
 * limits still have to be declared, because only the caller knows which of the
 * imported bones form a limb. Look bones up by name here — this runs once at
 * load time, never in a frame.
 */
export interface ImportedRigDraft {
  readonly builder: ActorRigBuilder;
  /** Ordered bones, aligned with the indexes the builder handed out. */
  readonly bones: THREE.Bone[];
  /** Index of an imported bone by its authored name. */
  indexOf(boneName: string): ActorBoneIndex | undefined;
  /** Index of a bone that must exist, throwing with context when it does not. */
  requireIndex(boneName: string): ActorBoneIndex;
  finish(): ImportedRig;
}

/**
 * Derives a rig definition from a skeleton that was authored elsewhere.
 *
 * The bind pose is read straight off the imported bones, so a pack's own
 * proportions and bone axes survive intact — including the common case where an
 * imported rig runs its limbs along +Y while this project's procedural rigs run
 * theirs along -Y. Chain descriptors record each segment's axis from the bind
 * offsets, so the shared solvers need no knowledge of either convention.
 *
 * Bones are re-sorted parents-first, which is the ordering invariant every rig
 * definition relies on.
 */
export function draftActorRigFromBones(
  bones: readonly THREE.Bone[],
  binding: ImportedRigBinding,
): ImportedRigDraft {
  const excluded = new Set<THREE.Bone>();
  if (binding.isExcluded !== undefined) {
    for (const bone of bones) {
      if (binding.isExcluded(bone.name)) {
        excluded.add(bone);
      }
    }
    // Dropping a control bone must drop whatever hangs off it too.
    let grew = true;
    while (grew) {
      grew = false;
      for (const bone of bones) {
        const parent = bone.parent;
        if (
          !excluded.has(bone) &&
          parent !== null &&
          isBone(parent) &&
          excluded.has(parent)
        ) {
          excluded.add(bone);
          grew = true;
        }
      }
    }
  }

  const kept = bones.filter((bone) => !excluded.has(bone));
  if (kept.length === 0) {
    throw new Error(`Imported rig "${binding.name}" has no usable bones.`);
  }
  const keptSet = new Set(kept);
  const ordered = sortParentsFirst(kept, keptSet, binding.name);

  const builder = new ActorRigBuilder(binding.name);
  const indexOfBone = new Map<THREE.Bone, ActorBoneIndex>();
  const indexOfName = new Map<string, ActorBoneIndex>();
  for (const bone of ordered) {
    const parent = bone.parent;
    const parentIndex =
      parent !== null && isBone(parent) && keptSet.has(parent)
        ? indexOfBone.get(parent)
        : undefined;
    const index = builder.addBone({
      name: bone.name,
      parent: parentIndex,
      x: bone.position.x,
      y: bone.position.y,
      z: bone.position.z,
      quaternion: [
        bone.quaternion.x,
        bone.quaternion.y,
        bone.quaternion.z,
        bone.quaternion.w,
      ],
      role: binding.resolveRole(bone.name),
      secondary: binding.isSecondary?.(bone.name) ?? false,
      allowTranslation: binding.allowsTranslation?.(bone.name) ?? false,
    });
    indexOfBone.set(bone, index);
    indexOfName.set(bone.name, index);
  }

  return {
    builder,
    bones: ordered,
    indexOf: (boneName) => indexOfName.get(boneName),
    requireIndex: (boneName) => {
      const index = indexOfName.get(boneName);
      if (index === undefined) {
        throw new Error(
          `Imported rig "${binding.name}" has no bone named "${boneName}".`,
        );
      }
      return index;
    },
    finish: () => ({ definition: builder.build(), bones: ordered }),
  };
}

function isBone(object: THREE.Object3D): object is THREE.Bone {
  return (object as THREE.Bone).isBone === true;
}

/**
 * Orders bones so every parent precedes its children.
 *
 * glTF usually stores joints this way already, but nothing guarantees it, and
 * the whole rig definition contract rests on the ordering.
 */
function sortParentsFirst(
  bones: readonly THREE.Bone[],
  kept: ReadonlySet<THREE.Bone>,
  rigName: string,
): THREE.Bone[] {
  const ordered: THREE.Bone[] = [];
  const placed = new Set<THREE.Bone>();
  let remaining = bones.slice();
  while (remaining.length > 0) {
    const next: THREE.Bone[] = [];
    for (const bone of remaining) {
      const parent = bone.parent;
      const parentKept = parent !== null && isBone(parent) && kept.has(parent);
      if (!parentKept || placed.has(parent as THREE.Bone)) {
        ordered.push(bone);
        placed.add(bone);
      } else {
        next.push(bone);
      }
    }
    if (next.length === remaining.length) {
      throw new Error(
        `Imported rig "${rigName}" has a cyclic or detached bone hierarchy.`,
      );
    }
    remaining = next;
  }
  return ordered;
}
