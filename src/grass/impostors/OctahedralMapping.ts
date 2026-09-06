import * as THREE from "three";

export interface OctahedralView {
  index: number;
  row: number;
  column: number;
  uv: readonly [number, number];
  direction: THREE.Vector3;
}

export class OctahedralMapping {
  static decodeHemisphere(u: number, v: number): THREE.Vector3 {
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      throw new Error("Hemi-octahedral decoding requires finite coordinates.");
    }
    const x = (u + v) * 0.5;
    const z = (u - v) * 0.5;
    const y = Math.max(0, 1 - Math.abs(x) - Math.abs(z));
    return new THREE.Vector3(x, y, z).normalize();
  }

  static encodeHemisphere(direction: THREE.Vector3): THREE.Vector2 {
    if (
      !Number.isFinite(direction.x) ||
      !Number.isFinite(direction.y) ||
      !Number.isFinite(direction.z) ||
      direction.lengthSq() <= Number.EPSILON
    ) {
      throw new Error(
        "Hemi-octahedral encoding requires a finite non-zero direction.",
      );
    }

    const normalized = direction.clone().normalize();
    if (normalized.y < 0) {
      throw new Error("Hemi-octahedral encoding requires an upper-hemisphere direction.");
    }

    const inverseL1 =
      1 / (Math.abs(normalized.x) + normalized.y + Math.abs(normalized.z));
    const x = normalized.x * inverseL1;
    const z = normalized.z * inverseL1;
    return new THREE.Vector2(x + z, x - z);
  }

  static createHemisphereViews(viewsPerAxis: number): OctahedralView[] {
    if (!Number.isInteger(viewsPerAxis) || viewsPerAxis < 2) {
      throw new Error("viewsPerAxis must be an integer of at least 2.");
    }

    const views: OctahedralView[] = [];
    for (let row = 0; row < viewsPerAxis; row += 1) {
      for (let column = 0; column < viewsPerAxis; column += 1) {
        const u = -1 + ((column + 0.5) / viewsPerAxis) * 2;
        const v = 1 - ((row + 0.5) / viewsPerAxis) * 2;
        views.push({
          index: row * viewsPerAxis + column,
          row,
          column,
          uv: [u, v],
          direction: this.decodeHemisphere(u, v),
        });
      }
    }

    return views;
  }
}
