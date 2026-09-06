import type * as THREE from "three";
import type { TerrainField } from "./TerrainField";

/**
 * A small cache of terrain heights over one tile, used to derive surface
 * normals without paying for a full noise evaluation per sample.
 *
 * `TerrainField.sampleNormal` is a central difference with a fixed 1.5 m step,
 * and it costs four `sampleHeight` calls — about three quarters of the work of
 * placing a grass blade. Near-grass blades sit roughly 0.12 m apart, so
 * thousands of them re-derive the same 1.5 m-scale slope from scratch. The
 * normal cannot represent detail finer than its own step in any case, so
 * sampling the height field onto a lattice at half that step and interpolating
 * reproduces it to well under a tenth of a degree while replacing tens of
 * thousands of noise evaluations with a few hundred.
 *
 * This is deliberately only used for normals. Blade root heights keep coming
 * from a direct `sampleHeight` call so roots stay welded to the terrain mesh.
 */
export class TerrainHeightLattice {
  private heights = new Float32Array(0);
  private field?: TerrainField;
  private originX = 0;
  private originZ = 0;
  private spacing = 1;
  private inverseSpacing = 1;
  private size = 0;
  private nextSample = 0;

  /**
   * Samples the height field over `[minX, minX + span] x [minZ, minZ + span]`.
   * The caller must include the normal's step in `span` on every side, since
   * taps reach that far outside the blade area.
   */
  build(
    field: TerrainField,
    minX: number,
    minZ: number,
    span: number,
    spacing: number,
  ): void {
    this.beginBuild(field, minX, minZ, span, spacing);
    while (!this.advanceBuild(Number.POSITIVE_INFINITY)) {
      // An infinite deadline completes in one call. Keep the synchronous wrapper
      // for non-streaming callers while streamed tiles use the sliced API below.
    }
  }

  beginBuild(
    field: TerrainField,
    minX: number,
    minZ: number,
    span: number,
    spacing: number,
  ): void {
    const size = Math.max(2, Math.ceil(span / spacing) + 1);
    if (this.heights.length !== size * size) {
      this.heights = new Float32Array(size * size);
    }
    this.field = field;
    this.size = size;
    this.originX = minX;
    this.originZ = minZ;
    this.spacing = spacing;
    this.inverseSpacing = 1 / spacing;
    this.nextSample = 0;
  }

  /** Samples a bounded portion of the lattice and reports when it is complete. */
  advanceBuild(deadline: number): boolean {
    const field = this.field;
    if (!field) {
      return true;
    }
    const size = this.size;
    const heights = this.heights;
    let processed = 0;
    while (
      this.nextSample < heights.length &&
      (processed === 0 || processed % 8 !== 0 || performance.now() < deadline)
    ) {
      const index = this.nextSample;
      const column = index % size;
      const row = Math.floor(index / size);
      heights[index] = field.sampleHeight(
        this.originX + column * this.spacing,
        this.originZ + row * this.spacing,
      );
      this.nextSample += 1;
      processed += 1;
    }
    if (this.nextSample >= heights.length) {
      this.field = undefined;
      return true;
    }
    return false;
  }

  /** Bilinear height. Points outside the built area clamp to the nearest edge. */
  sampleHeight(x: number, z: number): number {
    const size = this.size;
    const lastCell = size - 2;
    const lastSample = size - 1;
    const rawX = (x - this.originX) * this.inverseSpacing;
    const rawZ = (z - this.originZ) * this.inverseSpacing;
    const fx = Math.max(0, Math.min(lastSample, rawX));
    const fz = Math.max(0, Math.min(lastSample, rawZ));
    const column = Math.min(lastCell, Math.floor(fx));
    const row = Math.min(lastCell, Math.floor(fz));
    const tx = fx - column;
    const tz = fz - row;

    const lowerOffset = row * size + column;
    const upperOffset = lowerOffset + size;
    const heights = this.heights;
    const lower =
      heights[lowerOffset] +
      (heights[lowerOffset + 1] - heights[lowerOffset]) * tx;
    const upper =
      heights[upperOffset] +
      (heights[upperOffset + 1] - heights[upperOffset]) * tx;
    return lower + (upper - lower) * tz;
  }

  /**
   * The same central difference `TerrainField.sampleNormal` computes, taken from
   * the cached heights. `step` must match the field's own so the two agree.
   */
  sampleNormal(
    x: number,
    z: number,
    step: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    const left = this.sampleHeight(x - step, z);
    const right = this.sampleHeight(x + step, z);
    const down = this.sampleHeight(x, z - step);
    const up = this.sampleHeight(x, z + step);
    return target.set(left - right, step * 2, down - up).normalize();
  }
}
