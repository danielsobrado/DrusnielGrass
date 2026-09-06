import type * as THREE from "three";
import type { ActorRigInstance } from "../../actor/rig/ActorRigInstance";
import type { QuadrupedRigBones } from "./QuadrupedRigDefinition";

/**
 * What the actor owns after a species has dressed it.
 *
 * `dispose` releases only what this body allocated for this one animal — in
 * practice its material. Shared geometry belongs to whatever library built it
 * and must survive the animal.
 */
export interface QuadrupedBodyHandle {
  readonly meshes: readonly THREE.Mesh[];
  dispose(): void;
}

/**
 * How a species hangs geometry on the shared four-legged skeleton.
 *
 * The actor knows it has a body and can dispose one; it does not know whether
 * that body is a deer, and nothing in this folder should. Art, coat colour and
 * variant selection are decided by whoever composes the world and arrive here as
 * a closure.
 */
export type QuadrupedBodyBuilder = (
  rigInstance: ActorRigInstance,
  bones: QuadrupedRigBones,
) => QuadrupedBodyHandle;
