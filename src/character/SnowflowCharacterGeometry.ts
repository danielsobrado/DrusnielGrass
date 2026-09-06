import * as THREE from "three";
import { ActorRigInstance } from "../actor/rig/ActorRigInstance";
import { disposeResources } from "../render/ResourceDisposal";
import { addDrowBootGeometry } from "./DrowBootGeometry";
import { addDrowCostumeGeometry } from "./DrowCostumeGeometry";
import {
  humanoidRig,
  type HumanoidRig,
} from "./rig/HumanoidRigDefinition";
import {
  createSnowflowCharacterMaterials,
  type SnowflowCharacterMaterialSet,
} from "./SnowflowCharacterMaterials";

const SHADOW_RECEIVER = true;
const SHADOW_CASTER = true;

/**
 * The player's renderable rig.
 *
 * `root`, `slope`, and `heading` are world placement and stay plain groups —
 * they are not anatomical joints. Everything below them is a bone owned by the
 * shared {@link ActorRigInstance}; the named fields here are the same joints
 * the costume and cloth modules have always attached to, now resolved by index
 * instead of by name search.
 */
export interface SnowflowCharacterRig {
  root: THREE.Group;
  slope: THREE.Group;
  heading: THREE.Group;
  rigInstance: ActorRigInstance;
  humanoid: HumanoidRig;
  body: THREE.Object3D;
  pelvis: THREE.Object3D;
  torso: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  hood: THREE.Object3D;
  skirt: THREE.Object3D;
  skirtFront: THREE.Object3D;
  skirtLeft: THREE.Object3D;
  skirtRight: THREE.Object3D;
  cloakBack: THREE.Object3D;
  cloakLeft: THREE.Object3D;
  cloakRight: THREE.Object3D;
  hairLeft: THREE.Object3D;
  hairRight: THREE.Object3D;
  leftUpperArm: THREE.Object3D;
  leftForearm: THREE.Object3D;
  leftWrist: THREE.Object3D;
  rightUpperArm: THREE.Object3D;
  rightForearm: THREE.Object3D;
  rightWrist: THREE.Object3D;
  leftThigh: THREE.Object3D;
  leftShin: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightThigh: THREE.Object3D;
  rightShin: THREE.Object3D;
  rightFoot: THREE.Object3D;
  materialSet: SnowflowCharacterMaterialSet;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

export function buildSnowflowCharacter(
  scene: THREE.Scene,
  scale: number,
): SnowflowCharacterRig {
  const materials = createSnowflowCharacterMaterials();
  const materialList = Object.values(materials);
  const geometries: THREE.BufferGeometry[] = [];
  const root = namedGroup("drusniel-character");
  const slope = namedGroup("character-slope");
  const heading = namedGroup("character-heading");
  let rigInstance: ActorRigInstance | undefined;

  root.scale.setScalar(scale);
  root.add(slope);
  slope.add(heading);

  try {
    const humanoid = humanoidRig();
    rigInstance = new ActorRigInstance(humanoid.definition, heading);
    const bone = (index: number): THREE.Object3D => rigInstance!.getBone(index);
    const bones = humanoid.bones;

    const pelvis = bone(bones.pelvis);
    const torso = bone(bones.chest);
    const head = bone(bones.head);

    buildTorso(torso, pelvis, geometries, materials);
    buildHead(head, geometries, materials);
    buildArm(
      bone(bones.upperArmLeft),
      bone(bones.forearmLeft),
      bone(bones.handLeft),
      geometries,
      materials,
      -1,
    );
    buildArm(
      bone(bones.upperArmRight),
      bone(bones.forearmRight),
      bone(bones.handRight),
      geometries,
      materials,
      1,
    );
    buildLeg(
      bone(bones.thighLeft),
      bone(bones.shinLeft),
      bone(bones.footLeft),
      geometries,
      materials,
    );
    buildLeg(
      bone(bones.thighRight),
      bone(bones.shinRight),
      bone(bones.footRight),
      geometries,
      materials,
    );

    const rig: SnowflowCharacterRig = {
      root,
      slope,
      heading,
      rigInstance,
      humanoid,
      body: bone(bones.actorRoot),
      pelvis,
      torso,
      neck: bone(bones.neck),
      head,
      hood: bone(bones.hood),
      skirt: bone(bones.skirt),
      skirtFront: bone(bones.skirtFront),
      skirtLeft: bone(bones.skirtLeft),
      skirtRight: bone(bones.skirtRight),
      cloakBack: bone(bones.cloakBack),
      cloakLeft: bone(bones.cloakLeft),
      cloakRight: bone(bones.cloakRight),
      hairLeft: bone(bones.hairLeft),
      hairRight: bone(bones.hairRight),
      leftUpperArm: bone(bones.upperArmLeft),
      leftForearm: bone(bones.forearmLeft),
      leftWrist: bone(bones.handLeft),
      rightUpperArm: bone(bones.upperArmRight),
      rightForearm: bone(bones.forearmRight),
      rightWrist: bone(bones.handRight),
      leftThigh: bone(bones.thighLeft),
      leftShin: bone(bones.shinLeft),
      leftFoot: bone(bones.footLeft),
      rightThigh: bone(bones.thighRight),
      rightShin: bone(bones.shinRight),
      rightFoot: bone(bones.footRight),
      materialSet: materials,
      materials: materialList,
      geometries,
    };

    addDrowCostumeGeometry(rig, materials, geometries);
    scene.add(root);
    return rig;
  } catch (error) {
    root.removeFromParent();
    try {
      disposeResources([rigInstance, ...geometries, ...materialList]);
    } catch (cleanupError) {
      console.warn(
        "[Drusniel World] Character rig construction cleanup failed.",
        cleanupError,
      );
    }
    throw error;
  }
}

function buildTorso(
  torso: THREE.Object3D,
  pelvis: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: SnowflowCharacterMaterialSet,
): void {
  const chest = addMesh(
    torso,
    geometries,
    new THREE.CapsuleGeometry(0.15, 0.22, 5, 12),
    materials.tunic,
    0,
    0.18,
    0,
  );
  chest.scale.set(0.96, 1, 0.72);

  // Midriff waist transition
  const waist = addMesh(
    pelvis,
    geometries,
    new THREE.CylinderGeometry(0.142, 0.155, 0.11, 12, 1),
    materials.tunic,
    0,
    0.11,
    0,
  );
  waist.scale.set(0.98, 1, 0.78);

  const hips = addMesh(
    pelvis,
    geometries,
    new THREE.SphereGeometry(0.16, 14, 10),
    materials.robe,
    0,
    0.02,
    0,
  );
  hips.scale.set(1.05, 0.62, 0.82);

  const belt = addMesh(
    pelvis,
    geometries,
    new THREE.TorusGeometry(0.17, 0.025, 8, 28),
    materials.leather,
    0,
    0.08,
    0,
  );
  belt.rotation.x = Math.PI * 0.5;
  belt.scale.z = 0.82;
}

function buildHead(
  head: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: SnowflowCharacterMaterialSet,
): void {
  const cranium = addMesh(
    head,
    geometries,
    new THREE.SphereGeometry(0.112, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
    materials.skin,
    0,
    0.004,
    0.018,
  );
  cranium.name = "drow-cranium";
  cranium.scale.set(0.8, 1.06, 0.9);

  const jaw = addMesh(
    head,
    geometries,
    new THREE.SphereGeometry(0.078, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    materials.skin,
    0,
    -0.062,
    0.03,
  );
  jaw.name = "drow-jaw";
  jaw.scale.set(0.78, 0.72, 0.86);
  jaw.rotation.x = 0.18;

  const neckGuard = addMesh(
    head,
    geometries,
    new THREE.CylinderGeometry(0.084, 0.074, 0.11, 20, 2, true),
    materials.trim,
    0,
    -0.108,
    0.006,
  );
  neckGuard.scale.z = 0.9;
}

function buildArm(
  upperArm: THREE.Object3D,
  forearm: THREE.Object3D,
  hand: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: SnowflowCharacterMaterialSet,
  side: -1 | 1,
): void {
  // Shoulder joint cap
  addMesh(
    upperArm,
    geometries,
    new THREE.SphereGeometry(0.058, 8, 8),
    materials.tunic,
    side * 0.012,
    -0.02,
    0,
  );

  const upperMesh = addMesh(
    upperArm,
    geometries,
    new THREE.CapsuleGeometry(0.052, 0.2, 4, 10),
    materials.tunic,
    side * 0.018,
    -0.145,
    0,
  );
  upperMesh.rotation.z = side * -0.12;

  // Elbow joint cap
  addMesh(
    forearm,
    geometries,
    new THREE.SphereGeometry(0.048, 8, 8),
    materials.tunic,
    0,
    -0.01,
    0.005,
  );

  addMesh(
    forearm,
    geometries,
    new THREE.CapsuleGeometry(0.042, 0.18, 4, 10),
    materials.tunic,
    0,
    -0.135,
    0.008,
  );
  addMesh(
    forearm,
    geometries,
    new THREE.CapsuleGeometry(0.048, 0.08, 3, 10),
    materials.leather,
    0,
    -0.19,
    0.012,
  );

  const palm = addMesh(
    hand,
    geometries,
    new THREE.BoxGeometry(0.055, 0.09, 0.035, 1, 1, 1),
    materials.skin,
    0,
    -0.05,
    0.028,
  );
  palm.scale.set(0.92, 1, 0.85);
  for (let finger = 0; finger < 4; finger += 1) {
    const digit = addMesh(
      hand,
      geometries,
      new THREE.CapsuleGeometry(0.007, 0.032, 2, 5),
      materials.skin,
      (finger - 1.5) * 0.014,
      -0.1,
      0.04,
    );
    digit.rotation.x = 0.35;
  }
}

function buildLeg(
  thigh: THREE.Object3D,
  shin: THREE.Object3D,
  foot: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: SnowflowCharacterMaterialSet,
): void {
  // Hip joint cap
  addMesh(
    thigh,
    geometries,
    new THREE.SphereGeometry(0.085, 8, 8),
    materials.robe,
    0,
    -0.03,
    0,
  );

  addMesh(
    thigh,
    geometries,
    new THREE.CapsuleGeometry(0.082, 0.28, 4, 10),
    materials.robe,
    0,
    -0.22,
    0,
  );

  // Knee joint cap
  addMesh(
    shin,
    geometries,
    new THREE.SphereGeometry(0.072, 8, 8),
    materials.robe,
    0,
    -0.01,
    0.01,
  );

  addMesh(
    shin,
    geometries,
    new THREE.CapsuleGeometry(0.066, 0.24, 4, 10),
    materials.leather,
    0,
    -0.185,
    0,
  );
  addDrowBootGeometry(foot, geometries, materials);
}

function namedGroup(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function addMesh(
  parent: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = SHADOW_CASTER;
  mesh.receiveShadow = SHADOW_RECEIVER;
  parent.add(mesh);
  return mesh;
}
