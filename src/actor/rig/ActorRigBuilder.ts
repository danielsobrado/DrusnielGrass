import { setQuaternionFromEulerXyz } from "../math/ActorTransformMath";
import {
  ACTOR_MAX_BONE_COUNT,
  ACTOR_NO_BONE,
  asActorBoneIndex,
  type ActorBoneIndex,
} from "./ActorBoneIndex";
import type { ActorJointLimit } from "./ActorJointLimits";
import type {
  ActorBoneDefinition,
  ActorRigDefinition,
} from "./ActorRigDefinition";
import type {
  ActorEffectorDefinition,
  ActorEffectorKind,
  ActorTwoBoneChain,
} from "./ActorRigChains";
import { buildActorMask, type ActorMaskRequest } from "./ActorRigMasks";
import { validateActorRigDefinition } from "./ActorRigValidation";
import type { ActorSocketDefinition } from "./ActorSockets";

export interface ActorBoneRequest {
  readonly name: string;
  readonly parent?: ActorBoneIndex;
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  /** Bind rotation as XYZ Euler radians. */
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly rotationZ?: number;
  /**
   * Bind rotation as a quaternion, which wins over the Euler fields.
   *
   * Imported skeletons carry quaternions already; routing them through Euler
   * angles would lose precision and could pick a different branch near gimbal
   * lock.
   */
  readonly quaternion?: readonly [number, number, number, number];
  readonly role?: string;
  readonly allowTranslation?: boolean;
  readonly secondary?: boolean;
}

export interface ActorTwoBoneChainRequest {
  readonly name: string;
  readonly root: ActorBoneIndex;
  readonly mid: ActorBoneIndex;
  readonly end: ActorBoneIndex;
  readonly terminal?: ActorBoneIndex;
  readonly poleX?: number;
  readonly poleY?: number;
  readonly poleZ?: number;
  readonly minBendRadians?: number;
  readonly maxBendRadians?: number;
}

export interface ActorEffectorRequest {
  readonly name: string;
  readonly kind: ActorEffectorKind;
  readonly chain: string;
  readonly phaseOffset?: number;
}

export interface ActorSocketRequest {
  readonly key: string;
  readonly parent: ActorBoneIndex;
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly rotationZ?: number;
}

export interface ActorJointLimitRequest {
  readonly bone: ActorBoneIndex;
  readonly minX?: number;
  readonly maxX?: number;
  readonly minY?: number;
  readonly maxY?: number;
  readonly minZ?: number;
  readonly maxZ?: number;
}

const UNLIMITED_JOINT_ROTATION = Math.PI * 2;
const MAX_CHAIN_BEND = Math.PI;

/**
 * Authoring surface for immutable rig definitions.
 *
 * Bones are added parents-first, which is what gives every definition its
 * topological index order: a parent's index is always below its children's, so
 * hierarchy walks and mask propagation are single forward passes and cycles are
 * structurally impossible.
 */
export class ActorRigBuilder {
  private readonly bones: ActorBoneDefinition[] = [];
  private readonly positions: number[] = [];
  private readonly rotations: number[] = [];
  private readonly roles = new Map<string, ActorBoneIndex>();
  private readonly chains = new Map<string, ActorTwoBoneChain>();
  private readonly effectors = new Map<string, ActorEffectorDefinition>();
  private readonly maskRequests = new Map<string, ActorMaskRequest>();
  private readonly sockets = new Map<string, ActorSocketDefinition>();
  private readonly jointLimits: ActorJointLimit[] = [];

  constructor(private readonly name: string) {}

  addBone(request: ActorBoneRequest): ActorBoneIndex {
    if (this.bones.length >= ACTOR_MAX_BONE_COUNT) {
      throw new Error(
        `Actor rig "${this.name}" exceeded ${ACTOR_MAX_BONE_COUNT} bones.`,
      );
    }
    const parent = request.parent ?? (ACTOR_NO_BONE as number);
    if (parent !== ACTOR_NO_BONE && parent >= this.bones.length) {
      throw new Error(
        `Actor bone "${request.name}" names a parent that has not been added yet.`,
      );
    }
    const index = asActorBoneIndex(this.bones.length);
    this.bones.push({
      name: request.name,
      parent,
      role: request.role,
      allowTranslation: request.allowTranslation === true,
      secondary: request.secondary === true,
    });
    this.positions.push(request.x ?? 0, request.y ?? 0, request.z ?? 0);
    const rotation = new Float32Array(4);
    if (request.quaternion !== undefined) {
      rotation.set(request.quaternion);
    } else {
      setQuaternionFromEulerXyz(
        rotation,
        0,
        request.rotationX ?? 0,
        request.rotationY ?? 0,
        request.rotationZ ?? 0,
      );
    }
    this.rotations.push(rotation[0], rotation[1], rotation[2], rotation[3]);
    if (request.role !== undefined) {
      if (this.roles.has(request.role)) {
        throw new Error(
          `Actor rig "${this.name}" resolves role "${request.role}" more than once.`,
        );
      }
      this.roles.set(request.role, index);
    }
    return index;
  }

  addTwoBoneChain(request: ActorTwoBoneChainRequest): void {
    if (this.chains.has(request.name)) {
      throw new Error(`Actor chain "${request.name}" is declared twice.`);
    }
    const upperLength = this.restDistance(request.root, request.mid);
    const lowerLength = this.restDistance(request.mid, request.end);
    this.chains.set(request.name, {
      name: request.name,
      root: request.root,
      mid: request.mid,
      end: request.end,
      terminal: request.terminal ?? ACTOR_NO_BONE,
      upperLength,
      lowerLength,
      upperAxisX: this.positions[request.mid * 3] / upperLength,
      upperAxisY: this.positions[request.mid * 3 + 1] / upperLength,
      upperAxisZ: this.positions[request.mid * 3 + 2] / upperLength,
      lowerAxisX: this.positions[request.end * 3] / lowerLength,
      lowerAxisY: this.positions[request.end * 3 + 1] / lowerLength,
      lowerAxisZ: this.positions[request.end * 3 + 2] / lowerLength,
      poleX: request.poleX ?? 0,
      poleY: request.poleY ?? 0,
      poleZ: request.poleZ ?? 1,
      minBendRadians: request.minBendRadians ?? 0,
      maxBendRadians: request.maxBendRadians ?? MAX_CHAIN_BEND,
    });
  }

  addEffector(request: ActorEffectorRequest): void {
    if (this.effectors.has(request.name)) {
      throw new Error(`Actor effector "${request.name}" is declared twice.`);
    }
    this.effectors.set(request.name, {
      name: request.name,
      kind: request.kind,
      chain: request.chain,
      phaseOffset: request.phaseOffset ?? 0,
    });
  }

  addMask(name: string, request: ActorMaskRequest): void {
    if (this.maskRequests.has(name)) {
      throw new Error(`Actor mask "${name}" is declared twice.`);
    }
    this.maskRequests.set(name, request);
  }

  addSocket(request: ActorSocketRequest): void {
    if (this.sockets.has(request.key)) {
      throw new Error(`Actor socket "${request.key}" is declared twice.`);
    }
    this.sockets.set(request.key, {
      key: request.key,
      parent: request.parent,
      positionX: request.x ?? 0,
      positionY: request.y ?? 0,
      positionZ: request.z ?? 0,
      rotationX: request.rotationX ?? 0,
      rotationY: request.rotationY ?? 0,
      rotationZ: request.rotationZ ?? 0,
    });
  }

  addJointLimit(request: ActorJointLimitRequest): void {
    this.jointLimits.push({
      bone: request.bone,
      minX: request.minX ?? -UNLIMITED_JOINT_ROTATION,
      maxX: request.maxX ?? UNLIMITED_JOINT_ROTATION,
      minY: request.minY ?? -UNLIMITED_JOINT_ROTATION,
      maxY: request.maxY ?? UNLIMITED_JOINT_ROTATION,
      minZ: request.minZ ?? -UNLIMITED_JOINT_ROTATION,
      maxZ: request.maxZ ?? UNLIMITED_JOINT_ROTATION,
    });
  }

  build(): ActorRigDefinition {
    const boneCount = this.bones.length;
    const parents = new Int32Array(boneCount);
    const translatableFlags = new Uint8Array(boneCount);
    const secondaryFlags = new Uint8Array(boneCount);
    for (let bone = 0; bone < boneCount; bone += 1) {
      parents[bone] = this.bones[bone].parent;
      translatableFlags[bone] = this.bones[bone].allowTranslation ? 1 : 0;
      secondaryFlags[bone] = this.bones[bone].secondary ? 1 : 0;
    }
    const masks = new Map<string, Float32Array>();
    for (const [maskName, request] of this.maskRequests) {
      masks.set(maskName, buildActorMask(parents, request));
    }
    // Snapshot the builder's mutable collections so later authoring cannot
    // mutate a definition whose packed buffers were already finalized.
    const definition: ActorRigDefinition = {
      name: this.name,
      boneCount,
      bones: this.bones.slice(),
      parents,
      bindPositions: new Float32Array(this.positions),
      bindRotations: new Float32Array(this.rotations),
      translatableFlags,
      secondaryFlags,
      roles: new Map(this.roles),
      chains: new Map(this.chains),
      effectors: new Map(this.effectors),
      masks,
      sockets: new Map(this.sockets),
      jointLimits: this.jointLimits.slice(),
    };
    validateActorRigDefinition(definition);
    return definition;
  }

  /**
   * Rest length of one chain segment.
   *
   * `child` must be a direct child of `parent`, so its bind position — which is
   * local to its parent — is the segment vector. Validation rejects chains that
   * break that assumption rather than letting a bogus length reach a solver.
   */
  private restDistance(parent: number, child: number): number {
    if (this.bones[child]?.parent !== parent) {
      throw new Error(
        `Actor chain segment ${this.bones[parent]?.name} to ${this.bones[child]?.name} is not a direct parent link.`,
      );
    }
    return Math.hypot(
      this.positions[child * 3],
      this.positions[child * 3 + 1],
      this.positions[child * 3 + 2],
    );
  }
}
