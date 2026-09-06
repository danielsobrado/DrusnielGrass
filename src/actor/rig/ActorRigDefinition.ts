import type { ActorBoneIndex } from "./ActorBoneIndex";
import type {
  ActorEffectorDefinition,
  ActorTwoBoneChain,
} from "./ActorRigChains";
import type { ActorJointLimit } from "./ActorJointLimits";
import type { ActorSocketDefinition } from "./ActorSockets";

export interface ActorBoneDefinition {
  /** Debug/authoring name. Never looked up in a frame. */
  readonly name: string;
  /** Parent index, always lower than this bone's own index, or -1 for root. */
  readonly parent: number;
  /** Semantic role, if this bone fills one for its family. */
  readonly role: string | undefined;
  /** Whether pose translation may be written for this bone. */
  readonly allowTranslation: boolean;
  /** Whether the bone drives secondary motion rather than primary articulation. */
  readonly secondary: boolean;
}

/**
 * Immutable structural data shared by every actor instance of one topology.
 *
 * A definition holds no live Three.js object and no mutable transform state, so
 * a hundred deer can share one `QuadrupedRigDefinition` while each owns its own
 * rig instance and pose buffers.
 */
export interface ActorRigDefinition {
  readonly name: string;
  readonly boneCount: number;
  readonly bones: readonly ActorBoneDefinition[];
  /** Parent index per bone, packed for single-pass hierarchy walks. */
  readonly parents: Int32Array;
  /** Bind translation, 3 elements per bone. */
  readonly bindPositions: Float32Array;
  /** Bind rotation quaternion, 4 elements per bone. */
  readonly bindRotations: Float32Array;
  /** 1 where pose translation may be written. Packed for hot-path reads. */
  readonly translatableFlags: Uint8Array;
  /** 1 where a secondary-motion module owns the bone instead of the pose. */
  readonly secondaryFlags: Uint8Array;
  readonly roles: ReadonlyMap<string, ActorBoneIndex>;
  readonly chains: ReadonlyMap<string, ActorTwoBoneChain>;
  readonly effectors: ReadonlyMap<string, ActorEffectorDefinition>;
  /** Per-bone weight buffers, each `boneCount` long, resolved at build time. */
  readonly masks: ReadonlyMap<string, Float32Array>;
  readonly sockets: ReadonlyMap<string, ActorSocketDefinition>;
  readonly jointLimits: readonly ActorJointLimit[];
}

/**
 * Resolves a semantic role to a bone index, throwing when the rig cannot fill
 * it. Profiles call this during initialization so a structurally wrong rig
 * fails loudly instead of animating a missing joint.
 */
export function requireActorRole(
  definition: ActorRigDefinition,
  role: string,
): ActorBoneIndex {
  const bone = definition.roles.get(role);
  if (bone === undefined) {
    throw new Error(
      `Actor rig "${definition.name}" does not define the required role "${role}".`,
    );
  }
  return bone;
}

/** Resolves an optional role. Absence is a valid answer. */
export function findActorRole(
  definition: ActorRigDefinition,
  role: string,
): ActorBoneIndex | undefined {
  return definition.roles.get(role);
}

export function requireActorChain(
  definition: ActorRigDefinition,
  name: string,
): ActorTwoBoneChain {
  const chain = definition.chains.get(name);
  if (chain === undefined) {
    throw new Error(
      `Actor rig "${definition.name}" does not define the required chain "${name}".`,
    );
  }
  return chain;
}

export function requireActorMask(
  definition: ActorRigDefinition,
  name: string,
): Float32Array {
  const mask = definition.masks.get(name);
  if (mask === undefined) {
    throw new Error(
      `Actor rig "${definition.name}" does not define the required mask "${name}".`,
    );
  }
  return mask;
}

export function requireActorSocket(
  definition: ActorRigDefinition,
  key: string,
): ActorSocketDefinition {
  const socket = definition.sockets.get(key);
  if (socket === undefined) {
    throw new Error(
      `Actor rig "${definition.name}" does not define the required socket "${key}".`,
    );
  }
  return socket;
}

/** True when `ancestor` is on the parent path of `bone`. */
export function isActorBoneDescendant(
  definition: ActorRigDefinition,
  bone: number,
  ancestor: number,
): boolean {
  let current = definition.parents[bone];
  while (current >= 0) {
    if (current === ancestor) {
      return true;
    }
    current = definition.parents[current];
  }
  return false;
}
