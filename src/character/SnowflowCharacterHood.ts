import * as THREE from "three";

const HOOD_COLUMNS = 34;
const HOOD_ROWS = 9;
const HEAD_CENTER = new THREE.Vector3(0, 1.655, 0.005);
const FACE_DIRECTION = new THREE.Vector3(0, -0.28, 0.96).normalize();
const HOOD_HORIZONTAL = new THREE.Vector3(1, 0, 0);
const HOOD_VERTICAL = new THREE.Vector3().crossVectors(
  FACE_DIRECTION,
  HOOD_HORIZONTAL,
);
const HOOD_CENTER = HEAD_CENTER.clone().addScaledVector(FACE_DIRECTION, 0.105);

export function createSnowflowHoodGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rim = new THREE.Vector3();
  const base = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const control = new THREE.Vector3();

  for (let row = 0; row <= HOOD_ROWS; row += 1) {
    const t = row / HOOD_ROWS;
    const inverse = 1 - t;
    for (let column = 0; column < HOOD_COLUMNS; column += 1) {
      const s = column / HOOD_COLUMNS;
      hoodRimPoint(s, rim);
      hoodBasePoint(s, base);
      const angle = s * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      normal.set(sin, cos * 0.84, cos * -0.54).normalize();
      const radius = 0.205 + 0.062 * cos;
      control.copy(HEAD_CENTER).addScaledVector(normal, radius);
      positions.push(
        inverse * inverse * rim.x + 2 * inverse * t * control.x + t * t * base.x,
        inverse * inverse * rim.y + 2 * inverse * t * control.y + t * t * base.y,
        inverse * inverse * rim.z + 2 * inverse * t * control.z + t * t * base.z,
      );
    }
  }

  for (let row = 0; row < HOOD_ROWS; row += 1) {
    for (let column = 0; column < HOOD_COLUMNS; column += 1) {
      const nextColumn = (column + 1) % HOOD_COLUMNS;
      const a = row * HOOD_COLUMNS + column;
      const b = row * HOOD_COLUMNS + nextColumn;
      const c = (row + 1) * HOOD_COLUMNS + nextColumn;
      const d = (row + 1) * HOOD_COLUMNS + column;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSnowflowHoodTrimGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < HOOD_COLUMNS; index += 1) {
    points.push(hoodRimPoint(index / HOOD_COLUMNS, new THREE.Vector3()));
  }
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.4);
  return new THREE.TubeGeometry(curve, 64, 0.026, 6, true);
}

function hoodRimPoint(t: number, target: THREE.Vector3): THREE.Vector3 {
  const angle = t * Math.PI * 2;
  return target
    .copy(HOOD_CENTER)
    .addScaledVector(HOOD_HORIZONTAL, 0.152 * Math.sin(angle))
    .addScaledVector(HOOD_VERTICAL, 0.163 * Math.cos(angle));
}

function hoodBasePoint(t: number, target: THREE.Vector3): THREE.Vector3 {
  const angle = t * Math.PI * 2;
  return target.set(
    0.212 * Math.sin(angle),
    1.352,
    -0.012 - 0.182 * Math.cos(angle),
  );
}
