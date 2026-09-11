import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorldTreeAtlasRect } from "./WorldTreeAtlasFactory";
import {
  TREE_FOLIAGE_NORMALIZED_RADIUS,
  TREE_OAK_TOP_CARD_SIZE,
  type WorldTreeSpecies,
} from "./WorldTreeTuning";

const UP = new THREE.Vector3(0, 1, 0);

export function createWorldTreeWoodGeometry(
  species: WorldTreeSpecies,
  bark: WorldTreeAtlasRect,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkTop = species === "evergreen" ? 0.88 : species === "birch" ? 0.82 : 0.76;
  const trunkBottom = species === "birch" ? 0.075 : 0.095;
  parts.push(segment(
    new THREE.Vector3(0, -0.006, 0),
    new THREE.Vector3(0, 0.16, 0),
    trunkBottom * 1.45,
    trunkBottom,
    bark,
  ));
  parts.push(segment(
    new THREE.Vector3(0, 0.12, 0),
    new THREE.Vector3(0, trunkTop, 0),
    trunkBottom,
    trunkBottom * 0.52,
    bark,
  ));

  const forks = species === "evergreen"
    ? [
        [-0.54, 0.62, 0.2, 0.48],
        [0.48, 0.68, -0.24, 0.53],
        [-0.36, 0.77, -0.38, 0.61],
      ]
    : species === "birch"
      ? [
          [-0.42, 0.72, 0.22, 0.5],
          [0.36, 0.79, -0.27, 0.57],
          [0.2, 0.88, 0.34, 0.66],
        ]
      : [
          [-0.58, 0.64, 0.24, 0.42],
          [0.55, 0.7, -0.2, 0.46],
          [-0.38, 0.79, -0.45, 0.53],
          [0.3, 0.84, 0.42, 0.58],
        ];
  for (const [x, y, z, startY] of forks) {
    parts.push(segment(
      new THREE.Vector3(0, startY, 0),
      new THREE.Vector3(x, y, z),
      species === "birch" ? 0.035 : 0.045,
      0.015,
      bark,
    ));
  }
  return mergeOwned(parts, `tree ${species} wood`);
}

export function createWorldTreeFoliageGeometry(
  species: WorldTreeSpecies,
  leaf: WorldTreeAtlasRect,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (species === "oak") {
    addCrownLayer(parts, leaf, 0.68, TREE_FOLIAGE_NORMALIZED_RADIUS.oak * 2, 0.42, 3, 0);
    addCrownLayer(parts, leaf, 0.82, 1.36, 0.38, 3, Math.PI / 6);
    parts.push(card(TREE_OAK_TOP_CARD_SIZE, TREE_OAK_TOP_CARD_SIZE, 0.88, Math.PI / 2, 0, leaf));
  } else if (species === "birch") {
    addCrownLayer(parts, leaf, 0.7, TREE_FOLIAGE_NORMALIZED_RADIUS.birch * 2, 0.48, 3, 0);
    addCrownLayer(parts, leaf, 0.84, 0.86, 0.42, 3, Math.PI / 6);
    addCrownLayer(parts, leaf, 0.94, 0.62, 0.3, 2, Math.PI / 4);
  } else {
    parts.push(card(TREE_FOLIAGE_NORMALIZED_RADIUS.evergreen * 2, 0.34, 0.55, 0, 0, leaf));
    parts.push(card(1.48, 0.34, 0.55, 0, Math.PI / 2, leaf));
    parts.push(card(1.16, 0.3, 0.7, 0, Math.PI / 3, leaf));
    parts.push(card(1.16, 0.3, 0.7, 0, Math.PI * 5 / 6, leaf));
    parts.push(card(0.82, 0.26, 0.83, 0, 0, leaf));
    parts.push(card(0.82, 0.26, 0.83, 0, Math.PI / 2, leaf));
    parts.push(card(0.48, 0.22, 0.94, 0, Math.PI / 4, leaf));
  }
  return mergeOwned(parts, `tree ${species} foliage`);
}

export function createWorldTreeFarGeometry(
  far: WorldTreeAtlasRect,
): THREE.BufferGeometry {
  const parts = [0, Math.PI / 3, (Math.PI * 2) / 3].map((yaw) =>
    card(2, 1.04, 0.52, 0, yaw, far),
  );
  return mergeOwned(parts, "tree far impostor");
}

function addCrownLayer(
  parts: THREE.BufferGeometry[],
  rect: WorldTreeAtlasRect,
  y: number,
  width: number,
  height: number,
  count: number,
  yawOffset: number,
): void {
  for (let index = 0; index < count; index += 1) {
    parts.push(card(width, height, y, 0, yawOffset + index * Math.PI / count, rect));
  }
}

function card(
  width: number,
  height: number,
  y: number,
  pitch: number,
  yaw: number,
  rect: WorldTreeAtlasRect,
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
  remapUv(geometry, rect);
  geometry.rotateX(pitch);
  geometry.rotateY(yaw);
  geometry.translate(0, y, 0);
  return geometry;
}

function segment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  bottomRadius: number,
  topRadius: number,
  rect: WorldTreeAtlasRect,
): THREE.BufferGeometry {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (!(length > 0)) {
    throw new Error("Tree segment endpoints must differ.");
  }
  direction.multiplyScalar(1 / length);
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 7, 2, false);
  remapUv(geometry, rect);
  const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  geometry.applyMatrix4(new THREE.Matrix4().compose(midpoint, rotation, new THREE.Vector3(1, 1, 1)));
  return geometry;
}

function remapUv(geometry: THREE.BufferGeometry, rect: WorldTreeAtlasRect): void {
  const uv = geometry.getAttribute("uv");
  if (!uv) return;
  const width = rect.u1 - rect.u0;
  const height = rect.v1 - rect.v0;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, rect.u0 + uv.getX(index) * width, rect.v0 + uv.getY(index) * height);
  }
  uv.needsUpdate = true;
}

function mergeOwned(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  let merged: THREE.BufferGeometry | null = null;
  try {
    merged = mergeGeometries(parts, false);
    if (!merged) {
      throw new Error(`Unable to merge ${label} geometry.`);
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  } finally {
    for (const part of parts) {
      if (part !== merged) part.dispose();
    }
  }
}
