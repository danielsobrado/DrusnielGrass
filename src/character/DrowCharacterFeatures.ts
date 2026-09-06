import * as THREE from "three";
import type { SnowflowCharacterRig } from "./SnowflowCharacterGeometry";

const SHADOW_CASTER = true;
const SHADOW_RECEIVER = true;
const HAIR_LOCK_LENGTHS = [0.32, 0.42, 0.52, 0.58];
const HAIR_LOCKS_PER_SIDE = HAIR_LOCK_LENGTHS.length;

export function addDrowCharacterFeatures(rig: SnowflowCharacterRig): void {
  const { skin, hair, eye, metal } = rig.materialSet;

  addCheekbones(rig, skin);
  addNose(rig, skin);
  addMouth(rig, skin);
  addEar(rig, skin, -1);
  addEar(rig, skin, 1);
  addHair(rig, hair);
  addEyes(rig, eye);
  addBrows(rig, hair);
  addCirclet(rig, metal, eye);
}

function addCheekbones(
  rig: SnowflowCharacterRig,
  material: THREE.Material,
): void {
  for (const side of [-1, 1] as const) {
    const cheek = addMesh(
      rig.head,
      rig,
      new THREE.SphereGeometry(0.024, 10, 7),
      material,
    );
    cheek.name = side < 0 ? "drow-left-cheek" : "drow-right-cheek";
    cheek.position.set(side * 0.06, 0.002, 0.058);
    cheek.scale.set(1, 0.55, 0.85);
    cheek.rotation.z = side * -0.3;
  }
}

function addNose(rig: SnowflowCharacterRig, material: THREE.Material): void {
  const bridge = addMesh(
    rig.head,
    rig,
    new THREE.CapsuleGeometry(0.012, 0.04, 3, 6),
    material,
  );
  bridge.name = "drow-nose";
  bridge.position.set(0, -0.006, 0.102);
  bridge.rotation.x = Math.PI * 0.5 + 0.22;
  bridge.scale.set(0.78, 1, 0.7);
}

function addMouth(rig: SnowflowCharacterRig, material: THREE.Material): void {
  const mouth = addMesh(
    rig.head,
    rig,
    new THREE.BoxGeometry(0.038, 0.006, 0.01),
    material,
  );
  mouth.name = "drow-mouth";
  mouth.position.set(0, -0.042, 0.1);
  mouth.scale.set(1, 0.55, 0.8);
}

function addEar(
  rig: SnowflowCharacterRig,
  material: THREE.Material,
  side: -1 | 1,
): void {
  const geometry = new THREE.ConeGeometry(0.038, 0.2, 8, 1, false);
  const ear = addMesh(rig.head, rig, geometry, material);
  ear.name = side < 0 ? "drow-left-ear" : "drow-right-ear";
  ear.position.set(side * 0.06, 0.006, -0.004);
  ear.rotation.z = side * -Math.PI * 0.5;
  ear.rotation.y = side * 0.5;
  ear.rotation.x = 0.52;
  ear.scale.set(1.15, 1, 0.42);
}

function addHair(rig: SnowflowCharacterRig, material: THREE.Material): void {
  const cap = addMesh(
    rig.head,
    rig,
    new THREE.SphereGeometry(
      0.098,
      11,
      6,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.37,
    ),
    material,
  );
  cap.name = "drow-hair-cap";
  cap.position.set(0, 0.026, 0.012);
  cap.scale.set(1.02, 1.08, 1.16);

  const nape = addMesh(
    rig.head,
    rig,
    new THREE.SphereGeometry(0.098, 10, 8, 0, Math.PI, 0, Math.PI * 0.92),
    material,
  );
  nape.name = "drow-hair-nape";
  nape.position.set(0, 0.012, -0.008);
  nape.rotation.y = Math.PI;
  nape.scale.set(1, 1.16, 0.94);

  addHairSide(rig.hairLeft, rig, material, -1);
  addHairSide(rig.hairRight, rig, material, 1);

  // A single widow's peak reads as an elven hairline; a row of forward-hanging
  // cones just looks like fangs over the brow.
  const peak = addMesh(
    rig.head,
    rig,
    new THREE.ConeGeometry(0.028, 0.055, 8, 1, false),
    material,
  );
  peak.name = "drow-hair-peak";
  peak.position.set(0, 0.07, 0.104);
  peak.rotation.x = Math.PI - 0.2;
  peak.scale.set(1, 1, 0.42);
}

function addHairSide(
  parent: THREE.Object3D,
  rig: SnowflowCharacterRig,
  material: THREE.Material,
  side: -1 | 1,
): void {
  parent.position.set(side * 0.072, 0.075, 0.005);
  for (let index = 0; index < HAIR_LOCKS_PER_SIDE; index += 1) {
    const lock = addMesh(
      parent,
      rig,
      new THREE.ConeGeometry(
        0.017 - index * 0.001,
        HAIR_LOCK_LENGTHS[index],
        8,
      ),
      material,
    );
    lock.name = `${side < 0 ? "left" : "right"}-hair-lock-${index}`;
    lock.position.set(
      side * index * 0.006,
      -0.14 - index * 0.03,
      0.026 - index * 0.032,
    );
    lock.rotation.z = side * -(0.14 + index * 0.03);
    lock.rotation.x = Math.PI + 0.04 + index * 0.1;
    lock.scale.set(1, 1, 0.72);
  }
}

function addEyes(rig: SnowflowCharacterRig, material: THREE.Material): void {
  for (const side of [-1, 1] as const) {
    const eye = addMesh(
      rig.head,
      rig,
      new THREE.SphereGeometry(0.017, 14, 10),
      material,
    );
    eye.name = side < 0 ? "drow-left-eye" : "drow-right-eye";
    eye.position.set(side * 0.036, 0.006, 0.104);
    eye.scale.set(1.25, 0.46, 0.36);
    eye.rotation.z = side * 0.16;
  }
}

function addBrows(rig: SnowflowCharacterRig, material: THREE.Material): void {
  for (const side of [-1, 1] as const) {
    const brow = addMesh(
      rig.head,
      rig,
      new THREE.BoxGeometry(0.05, 0.008, 0.008),
      material,
    );
    brow.name = side < 0 ? "drow-left-brow" : "drow-right-brow";
    brow.position.set(side * 0.04, 0.032, 0.108);
    brow.rotation.z = side * -0.24;
  }
}

function addCirclet(
  rig: SnowflowCharacterRig,
  bandMaterial: THREE.Material,
  gemMaterial: THREE.Material,
): void {
  const band = addMesh(
    rig.head,
    rig,
    new THREE.TorusGeometry(0.09, 0.006, 6, 28),
    bandMaterial,
  );
  band.name = "drow-circlet";
  band.position.set(0, 0.082, 0.012);
  band.rotation.x = Math.PI * 0.5;
  band.scale.set(1, 1, 1.12);

  const gem = addMesh(
    rig.head,
    rig,
    new THREE.OctahedronGeometry(0.021),
    gemMaterial,
  );
  gem.name = "drow-circlet-gem";
  gem.position.set(0, 0.08, 0.11);
  gem.scale.set(0.72, 1, 0.6);
}

function addMesh(
  parent: THREE.Object3D,
  rig: SnowflowCharacterRig,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.Mesh {
  rig.geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = SHADOW_CASTER;
  mesh.receiveShadow = SHADOW_RECEIVER;
  parent.add(mesh);
  return mesh;
}
