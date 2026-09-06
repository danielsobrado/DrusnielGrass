import * as THREE from "three";
import type { ActorBoneIndex } from "../../actor/rig/ActorBoneIndex";
import type {
  QuadrupedBodyBuilder,
  QuadrupedBodyHandle,
} from "../quadruped/QuadrupedBodyContract";
import type { QuadrupedRigBones } from "../quadruped/QuadrupedRigDefinition";
import type { DeerAssets } from "./DeerAssets";
import type { DeerPartSlot, DeerVariant } from "./DeerGeometry";

/**
 * Dresses the shared four-legged skeleton as one particular deer.
 *
 * The actor receives this as a closure and never learns what a deer is. Coat
 * tint and variant are decided by whoever composes the herd, which is what lets
 * one library of geometry produce a stag, two does and a fawn that all look
 * related but not identical.
 */
export function createDeerBodyBuilder(
  assets: DeerAssets,
  variant: DeerVariant,
  tint: THREE.Color,
  shadows: boolean,
): QuadrupedBodyBuilder {
  return (rigInstance, bones) => {
    const placements = createPlacements(bones);
    const geometries = placements.map(([slot]) => assets.geometryFor(variant, slot));
    const material = assets.createMaterial(tint);
    const meshes: THREE.Mesh[] = [];

    try {
      for (let index = 0; index < placements.length; index += 1) {
        const [, bone] = placements[index];
        const mesh = new THREE.Mesh(geometries[index], material);
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        rigInstance.attach(bone, mesh);
        meshes.push(mesh);
      }
    } catch (error) {
      for (const mesh of meshes) {
        mesh.removeFromParent();
      }
      material.dispose();
      throw error;
    }

    let disposed = false;
    return {
      meshes,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        for (const mesh of meshes) {
          mesh.removeFromParent();
        }
        material.dispose();
      },
    } satisfies QuadrupedBodyHandle;
  };
}

function createPlacements(
  bones: QuadrupedRigBones,
): Array<readonly [DeerPartSlot, ActorBoneIndex]> {
  const placements: Array<readonly [DeerPartSlot, ActorBoneIndex]> = [
    ["body", bones.bodyCenter],
    ["neck", bones.neck],
    ["head", bones.head],
  ];

  if (bones.ears.length === 2) {
    placements.push(["earLeft", bones.ears[0]], ["earRight", bones.ears[1]]);
  }

  const tailSlots: DeerPartSlot[] = ["tailBase", "tailMid", "tailTip"];
  for (let index = 0; index < bones.tail.length; index += 1) {
    placements.push([
      tailSlots[Math.min(index, tailSlots.length - 1)],
      bones.tail[index],
    ]);
  }

  for (let side = 0; side < 2; side += 1) {
    placements.push(
      ["frontUpper", bones.frontUpper[side]],
      ["frontLower", bones.frontLower[side]],
      ["frontHoof", bones.frontPaw[side]],
      ["hindUpper", bones.hindUpper[side]],
      ["hindLower", bones.hindLower[side]],
      ["hindHoof", bones.hindPaw[side]],
    );
  }

  return placements;
}
