import * as THREE from "three";
import type { SnowflowCharacterRig } from "./SnowflowCharacterGeometry";
import type { SnowflowCharacterMaterialSet } from "./SnowflowCharacterMaterials";

const SHADOW_CASTER = true;
const SHADOW_RECEIVER = true;
const SPIDER_LEG_ANGLES = [0.96, 1.42, 1.88, 2.34];

export function addDrowCostumeGeometry(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  addShoulderMantle(rig, materials, geometries);
  addFoldedHood(rig, materials, geometries);
  addCloakPanels(rig, materials, geometries);
  addCloakClasp(rig, materials, geometries);
  addLayeredSkirt(rig, materials, geometries);
  addLeatherHarness(rig, materials, geometries);
  addMedallion(rig, materials, geometries);
  addBeltDagger(rig, materials, geometries);
}

function addShoulderMantle(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  const y = 0.37;
  for (const side of [-1, 1] as const) {
    const shoulder = addMesh(
      rig.torso,
      geometries,
      new THREE.SphereGeometry(0.145, 14, 9),
      materials.fur,
      side * 0.17,
      y,
      -0.015,
    );
    shoulder.scale.set(1.15, 0.44, 0.82);
    shoulder.rotation.z = side * 0.08;

    for (let tuftIndex = 0; tuftIndex < 4; tuftIndex += 1) {
      const tuft = addMesh(
        rig.torso,
        geometries,
        new THREE.ConeGeometry(0.028, 0.13, 7),
        materials.fur,
        side * (0.11 + tuftIndex * 0.04),
        y - 0.055 - (tuftIndex % 2) * 0.016,
        0.03 - tuftIndex * 0.01,
      );
      tuft.rotation.z = side * -(0.2 + tuftIndex * 0.06);
      tuft.rotation.x = Math.PI + 0.06;
    }
  }
}

function addFoldedHood(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  rig.hood.position.set(0, 0.39, -0.11);
  const rim = addMesh(
    rig.hood,
    geometries,
    new THREE.TorusGeometry(0.15, 0.04, 8, 24),
    materials.cloak,
    0,
    0,
    0,
  );
  rim.rotation.x = Math.PI * 0.5;
  rim.scale.set(1.18, 0.82, 1);

  const fold = addMesh(
    rig.hood,
    geometries,
    new THREE.SphereGeometry(
      0.16,
      18,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.54,
    ),
    materials.cloak,
    0,
    0.008,
    -0.045,
  );
  // Opening faces the neck, so the viewer behind the character sees the
  // convex outside of the fold rather than into a hollow shell.
  fold.rotation.x = Math.PI * -0.5;
  fold.scale.set(1.1, 0.58, 0.85);
}

function addCloakPanels(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  rig.cloakBack.position.set(0, 0.36, -0.15);
  rig.cloakLeft.position.set(-0.2, 0.33, -0.06);
  rig.cloakRight.position.set(0.2, 0.33, -0.06);

  const backGeometry = createDrapedPanelGeometry({
    topWidth: 0.6,
    bottomWidth: 0.98,
    height: 1.26,
    wrap: 0.3,
    foldCount: 3,
    foldDepth: 0.075,
    hemWave: 0.065,
    shoulderDrop: 0.07,
    columns: 18,
    rows: 10,
  });
  geometries.push(backGeometry);
  for (const layer of [materials.cloakShell, materials.cloakLining]) {
    const back = new THREE.Mesh(backGeometry, layer);
    back.position.set(0, 0, 0);
    back.rotation.x = -0.035;
    back.castShadow = SHADOW_CASTER;
    back.receiveShadow = SHADOW_RECEIVER;
    rig.cloakBack.add(back);
  }

  addCloakSidePanel(rig.cloakLeft, materials, geometries, -1);
  addCloakSidePanel(rig.cloakRight, materials, geometries, 1);
}

function addCloakSidePanel(
  parent: THREE.Object3D,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
  side: -1 | 1,
): void {
  const panel = addMesh(
    parent,
    geometries,
    createDrapedPanelGeometry({
      topWidth: 0.3,
      bottomWidth: 0.52,
      height: 1.17,
      wrap: 0.13,
      foldCount: 2,
      foldDepth: 0.045,
      hemWave: 0.04,
      shoulderDrop: 0.035,
      columns: 12,
      rows: 8,
    }),
    materials.mantle,
    side * 0.09,
    0.03,
    0,
  );
  panel.rotation.y = side * 0.24;
  panel.rotation.z = side * 0.06;
}

function addCloakClasp(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  const clasp = new THREE.Group();
  clasp.name = "drow-cloak-clasp";
  // Sits in front of the harness straps, which cross the sternum at z=0.149.
  clasp.position.set(0, 0.378, 0.148);
  rig.torso.add(clasp);

  // Domed rather than a flat plate: a +Z facing face only ever catches the sun
  // at a graze and reads as black against the tunic.
  const dome = addMesh(
    clasp,
    geometries,
    new THREE.SphereGeometry(0.028, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    materials.metal,
    0,
    0,
    0,
  );
  dome.rotation.x = Math.PI * 0.5;
  dome.scale.set(1, 1, 0.5);

  const gem = addMesh(
    clasp,
    geometries,
    new THREE.OctahedronGeometry(0.014),
    materials.eye,
    0,
    0,
    0.021,
  );
  gem.scale.set(0.8, 1, 0.7);
}

function addLayeredSkirt(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  const front = addMesh(
    rig.skirtFront,
    geometries,
    createPanelGeometry(0.28, 0.42, 0.79, 0.035),
    materials.robe,
    0,
    -0.39,
    0.12,
  );
  front.rotation.x = -0.04;

  const left = addMesh(
    rig.skirtLeft,
    geometries,
    createPanelGeometry(0.24, 0.38, 0.74, 0.015),
    materials.tunic,
    -0.12,
    -0.36,
    0.035,
  );
  left.rotation.y = -0.28;
  left.rotation.z = -0.08;

  const right = addMesh(
    rig.skirtRight,
    geometries,
    createPanelGeometry(0.24, 0.38, 0.74, 0.015),
    materials.tunic,
    0.12,
    -0.36,
    0.035,
  );
  right.rotation.y = 0.28;
  right.rotation.z = 0.08;

  addMesh(
    rig.skirt,
    geometries,
    createPanelGeometry(0.22, 0.31, 0.66, -0.025),
    materials.trim,
    0,
    -0.33,
    -0.13,
  );
}

function addLeatherHarness(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  for (const side of [-1, 1] as const) {
    const strap = addMesh(
      rig.torso,
      geometries,
      new THREE.BoxGeometry(0.035, 0.54, 0.018),
      materials.leather,
      side * 0.075,
      0.2,
      0.14,
    );
    strap.rotation.z = side * 0.48;
  }

  const waistWrap = addMesh(
    rig.pelvis,
    geometries,
    new THREE.CylinderGeometry(0.185, 0.19, 0.16, 18, 2, true),
    materials.leather,
    0,
    0.07,
    0,
  );
  waistWrap.scale.z = 0.82;
}

function addMedallion(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  const medallion = new THREE.Group();
  medallion.name = "drow-medallion";
  medallion.position.set(0, 0.08, 0.175);
  rig.torso.add(medallion);

  addMesh(
    medallion,
    geometries,
    new THREE.TorusGeometry(0.085, 0.012, 8, 24),
    materials.metal,
    0,
    0,
    0,
  );
  const disc = addMesh(
    medallion,
    geometries,
    new THREE.CylinderGeometry(0.067, 0.067, 0.018, 20),
    materials.leather,
    0,
    0,
    0,
  );
  disc.rotation.x = Math.PI * 0.5;

  addSpiderEmblem(medallion, materials, geometries);
}

function addSpiderEmblem(
  medallion: THREE.Group,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  const abdomen = addMesh(
    medallion,
    geometries,
    new THREE.SphereGeometry(0.019, 10, 8),
    materials.metal,
    0,
    -0.013,
    0.018,
  );
  abdomen.scale.set(1, 1.3, 0.55);

  const thorax = addMesh(
    medallion,
    geometries,
    new THREE.SphereGeometry(0.012, 10, 8),
    materials.metal,
    0,
    0.016,
    0.018,
  );
  thorax.scale.set(1, 0.9, 0.55);

  for (const side of [-1, 1] as const) {
    for (const angle of SPIDER_LEG_ANGLES) {
      const leg = addMesh(
        medallion,
        geometries,
        new THREE.CylinderGeometry(0.0035, 0.0022, 0.056, 5),
        materials.metal,
        side * 0.028 * Math.sin(angle),
        0.02 + 0.028 * Math.cos(angle),
        0.016,
      );
      leg.rotation.z = side * -angle;
      leg.scale.z = 0.6;
    }
  }
}

function addBeltDagger(
  rig: SnowflowCharacterRig,
  materials: SnowflowCharacterMaterialSet,
  geometries: THREE.BufferGeometry[],
): void {
  const dagger = new THREE.Group();
  dagger.name = "drow-belt-dagger";
  dagger.position.set(-0.23, 0.04, 0.02);
  dagger.rotation.z = 0.2;
  rig.pelvis.add(dagger);

  addMesh(
    dagger,
    geometries,
    new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8),
    materials.leather,
    0,
    -0.04,
    0,
  );
  const guard = addMesh(
    dagger,
    geometries,
    new THREE.BoxGeometry(0.12, 0.018, 0.025),
    materials.metal,
    0,
    -0.12,
    0,
  );
  guard.rotation.z = -0.08;
  const blade = addMesh(
    dagger,
    geometries,
    new THREE.ConeGeometry(0.045, 0.32, 4),
    materials.metal,
    0,
    -0.29,
    0,
  );
  blade.scale.z = 0.32;
}

interface DrapedPanelOptions {
  topWidth: number;
  bottomWidth: number;
  height: number;
  /** How far the side edges curl forward to embrace the body. */
  wrap: number;
  /** Number of vertical fold ridges across the panel. */
  foldCount: number;
  foldDepth: number;
  /** How far the hem dips under each fold ridge. */
  hemWave: number;
  /** How far the outer top corners sag, so the shoulder line is not a bar. */
  shoulderDrop: number;
  columns: number;
  rows: number;
}

/**
 * A cloth sheet hanging from y=0 down to -height, with vertical folds that
 * open up toward the hem and a scalloped edge that follows them. Faces wind so
 * that the side pointing away from the body is the front face.
 */
function createDrapedPanelGeometry(
  options: DrapedPanelOptions,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = options.columns + 1;

  for (let row = 0; row <= options.rows; row += 1) {
    const v = row / options.rows;
    const width = THREE.MathUtils.lerp(
      options.topWidth,
      options.bottomWidth,
      Math.pow(v, 0.75),
    );
    const fold = options.foldDepth * Math.pow(v, 1.35);
    const curl = options.wrap * (0.22 + 0.78 * Math.pow(v, 0.9));
    for (let column = 0; column <= options.columns; column += 1) {
      const u = column / options.columns;
      const spread = u * 2 - 1;
      const ripple = Math.cos(u * options.foldCount * Math.PI * 2);
      const sag = options.shoulderDrop * spread * spread * (1 - v);
      positions.push(
        spread * width * 0.5,
        -(options.height + options.hemWave * ripple) * v - sag,
        curl * spread * spread - fold * ripple,
      );
      uvs.push(u, 1 - v);
    }
  }

  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = (row + 1) * stride + column + 1;
      const d = (row + 1) * stride + column;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createPanelGeometry(
  topWidth: number,
  bottomWidth: number,
  height: number,
  centerDepth: number,
): THREE.BufferGeometry {
  const halfTop = topWidth * 0.5;
  const halfBottom = bottomWidth * 0.5;
  const halfHeight = height * 0.5;
  const positions = new Float32Array([
    -halfTop, halfHeight, 0,
    halfTop, halfHeight, 0,
    -halfBottom, 0, centerDepth,
    halfBottom, 0, centerDepth,
    -halfBottom * 0.86, -halfHeight, 0,
    halfBottom * 0.86, -halfHeight, 0,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 1, 1, 1, 0, 0.5, 1, 0.5, 0.08, 0, 0.92, 0],
      2,
    ),
  );
  geometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = SHADOW_CASTER;
  mesh.receiveShadow = SHADOW_RECEIVER;
  parent.add(mesh);
  geometries.push(geometry);
  return mesh;
}
