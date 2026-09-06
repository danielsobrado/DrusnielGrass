import * as THREE from "three";
import type { SnowflowCharacterMaterialSet } from "./SnowflowCharacterMaterials";
import { DROW_BOOT_GEOMETRY } from "./DrowBootGeometryTuning";

const SHADOW_CASTER = true;
const SHADOW_RECEIVER = true;

export function addDrowBootGeometry(
  foot: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: SnowflowCharacterMaterialSet,
): void {
  const sole = addMesh(
    foot,
    geometries,
    new THREE.CapsuleGeometry(
      DROW_BOOT_GEOMETRY.sole.radius,
      DROW_BOOT_GEOMETRY.sole.length,
      2,
      10,
    ),
    materials.leather,
    0,
    DROW_BOOT_GEOMETRY.sole.y,
    DROW_BOOT_GEOMETRY.sole.z,
  );
  sole.name = "drow-boot-sole";
  sole.rotation.x = Math.PI * 0.5;
  sole.scale.z = DROW_BOOT_GEOMETRY.sole.verticalScale;

  const vamp = addMesh(
    foot,
    geometries,
    new THREE.CapsuleGeometry(
      DROW_BOOT_GEOMETRY.vamp.radius,
      DROW_BOOT_GEOMETRY.vamp.length,
      3,
      10,
    ),
    materials.leather,
    0,
    DROW_BOOT_GEOMETRY.vamp.y,
    DROW_BOOT_GEOMETRY.vamp.z,
  );
  vamp.name = "drow-boot-vamp";
  vamp.rotation.x = Math.PI * 0.5;
  vamp.scale.z = DROW_BOOT_GEOMETRY.vamp.verticalScale;

  const instep = addMesh(
    foot,
    geometries,
    new THREE.BoxGeometry(
      DROW_BOOT_GEOMETRY.instep.width,
      DROW_BOOT_GEOMETRY.instep.height,
      DROW_BOOT_GEOMETRY.instep.length,
      1,
      1,
      2,
    ),
    materials.leather,
    0,
    DROW_BOOT_GEOMETRY.instep.y,
    DROW_BOOT_GEOMETRY.instep.z,
  );
  instep.name = "drow-boot-instep";
  instep.rotation.x = DROW_BOOT_GEOMETRY.instep.pitch;

  const shaft = addMesh(
    foot,
    geometries,
    new THREE.CylinderGeometry(
      DROW_BOOT_GEOMETRY.shaft.topRadius,
      DROW_BOOT_GEOMETRY.shaft.bottomRadius,
      DROW_BOOT_GEOMETRY.shaft.height,
      10,
      1,
    ),
    materials.leather,
    0,
    DROW_BOOT_GEOMETRY.shaft.y,
    DROW_BOOT_GEOMETRY.shaft.z,
  );
  shaft.name = "drow-boot-shaft";

  const cuff = addMesh(
    foot,
    geometries,
    new THREE.CylinderGeometry(
      DROW_BOOT_GEOMETRY.cuff.radius,
      DROW_BOOT_GEOMETRY.cuff.radius,
      DROW_BOOT_GEOMETRY.cuff.height,
      10,
      1,
    ),
    materials.trim,
    0,
    DROW_BOOT_GEOMETRY.cuff.y,
    DROW_BOOT_GEOMETRY.cuff.z,
  );
  cuff.name = "drow-boot-cuff";

  const toeBand = addMesh(
    foot,
    geometries,
    new THREE.BoxGeometry(
      DROW_BOOT_GEOMETRY.toeBand.width,
      DROW_BOOT_GEOMETRY.toeBand.height,
      DROW_BOOT_GEOMETRY.toeBand.length,
    ),
    materials.trim,
    0,
    DROW_BOOT_GEOMETRY.toeBand.y,
    DROW_BOOT_GEOMETRY.toeBand.z,
  );
  toeBand.name = "drow-boot-toe-band";
  toeBand.rotation.x = DROW_BOOT_GEOMETRY.toeBand.pitch;
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
