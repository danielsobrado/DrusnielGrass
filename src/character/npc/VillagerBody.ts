import * as THREE from "three";
import type { ActorBoneIndex } from "../../actor/rig/ActorBoneIndex";
import type { ActorRigInstance } from "../../actor/rig/ActorRigInstance";
import type { HumanoidRigBones } from "../rig/HumanoidRigBones";
import type { VillagerAssets } from "./VillagerAssets";
import type { VillagerPartSlot } from "./VillagerGeometry";

export interface VillagerBody {
  readonly meshes: readonly THREE.Mesh[];
  dispose(): void;
}

/**
 * Hangs a villager on the shared humanoid skeleton.
 *
 * One material for the whole person, because the palette is baked into the
 * vertices. Geometry belongs to the library and is never disposed here.
 */
export function buildVillagerBody(
  rigInstance: ActorRigInstance,
  bones: HumanoidRigBones,
  assets: VillagerAssets,
  variant: number,
  shadows: boolean,
): VillagerBody {
  const placements: Array<readonly [VillagerPartSlot, ActorBoneIndex]> = [
    ["pelvis", bones.pelvis],
    ["chest", bones.chest],
    ["head", bones.head],
    ["upperArm", bones.upperArmLeft],
    ["forearm", bones.forearmLeft],
    ["upperArm", bones.upperArmRight],
    ["forearm", bones.forearmRight],
    ["thigh", bones.thighLeft],
    ["shin", bones.shinLeft],
    ["boot", bones.footLeft],
    ["thigh", bones.thighRight],
    ["shin", bones.shinRight],
    ["boot", bones.footRight],
  ];

  const tabardBone = bones.skirtFront ?? bones.skirt;
  if (tabardBone !== undefined) {
    placements.push(["tabard", tabardBone]);
  }

  // Resolve lazy shared geometry before allocating this actor's material or
  // attaching anything, so a bad variant cannot leave a partial live body.
  const geometries = placements.map(([slot]) => assets.geometryFor(variant, slot));
  const material = assets.createMaterial();
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
  };
}
