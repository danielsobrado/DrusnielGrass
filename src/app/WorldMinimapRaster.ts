import * as THREE from "three";
import type { TerrainField } from "../world/TerrainField";
import {
  minimapCellToWorld,
  type WorldMinimapExtent,
  type WorldPoint,
} from "./WorldMinimapProjection";

/**
 * Terrain raster behind the minimap.
 *
 * Built once, in time-boxed slices. A 256² map is 65k terrain samples and each
 * one runs several octaves of fBm plus hydrology carving, so building it in a
 * single call stalls the frame for long enough to trip the app's own stall
 * watchdog. Rows are filled a few at a time under a millisecond budget instead.
 *
 * Heights are captured first and shading is derived from that grid rather than
 * from `sampleNormal`, which would cost four extra terrain samples per pixel
 * for a gradient the grid already contains.
 */

/** Sun bearing for the hillshade, matched to the world's key light. */
const SHADE_DIRECTION_X = 0.83;
const SHADE_DIRECTION_Z = 0.52;
const SHADE_STRENGTH = 0.55;
const AMBIENT_SHADE = 0.62;

export class WorldMinimapRaster {
  readonly image: ImageData;
  private readonly heights: Float32Array;
  private readonly normalScratch = new THREE.Vector3();
  private readonly colorScratch = new THREE.Color();
  private readonly pointScratch: WorldPoint = { x: 0, z: 0 };
  /** Height rows captured; always kept at least two ahead of `pixelRow`. */
  private heightRow = 0;
  private pixelRow = 0;

  constructor(
    private readonly field: TerrainField,
    private readonly extent: WorldMinimapExtent,
  ) {
    const { resolution } = extent;
    this.heights = new Float32Array(resolution * resolution);
    this.image = new ImageData(resolution, resolution);
  }

  isComplete(): boolean {
    return this.pixelRow >= this.extent.resolution;
  }

  /** Fractional build progress, for the panel's loading state. */
  getProgress(): number {
    return this.pixelRow / this.extent.resolution;
  }

  /**
   * Advance the build until `budgetMs` is spent. Returns true when this call
   * changed the image, so the panel only repaints on real progress.
   *
   * Heights lead pixels by two rows rather than completing first: shading a row
   * needs its neighbours, and a separate full height pass would leave the panel
   * blank for half the build, which reads as a broken map rather than a loading
   * one. Interleaved, the image fills top to bottom from the first slice.
   */
  advance(budgetMs: number): boolean {
    if (this.isComplete()) {
      return false;
    }
    const deadline = performance.now() + budgetMs;
    const rows = this.extent.resolution;
    let changed = false;

    while (performance.now() < deadline) {
      if (this.heightRow < rows && this.heightRow <= this.pixelRow + 1) {
        this.fillHeightRow(this.heightRow);
        this.heightRow += 1;
        continue;
      }

      this.fillPixelRow(this.pixelRow);
      this.pixelRow += 1;
      changed = true;
      if (this.pixelRow >= rows) {
        return true;
      }
    }
    return changed;
  }

  private fillHeightRow(row: number): void {
    const { resolution } = this.extent;
    const offset = row * resolution;
    for (let column = 0; column < resolution; column += 1) {
      const point = minimapCellToWorld(
        this.extent,
        column,
        row,
        this.pointScratch,
      );
      this.heights[offset + column] = this.field.sampleHeight(point.x, point.z);
    }
  }

  private fillPixelRow(row: number): void {
    const { resolution, worldSize } = this.extent;
    const metresPerCell = worldSize / resolution;
    const data = this.image.data;
    const offset = row * resolution;

    for (let column = 0; column < resolution; column += 1) {
      const point = minimapCellToWorld(
        this.extent,
        column,
        row,
        this.pointScratch,
      );
      const height = this.heights[offset + column];
      // Central differences on the height grid, clamped at the border so the
      // outermost ring shades from real neighbours instead of wrapping.
      const west = this.heightAt(column - 1, row);
      const east = this.heightAt(column + 1, row);
      const north = this.heightAt(column, row - 1);
      const south = this.heightAt(column, row + 1);
      this.normalScratch
        .set(west - east, metresPerCell * 2, north - south)
        .normalize();

      const suitability = this.field.sampleGrassSuitability(
        point.x,
        point.z,
        height,
        this.normalScratch,
      );
      this.field.sampleColor(
        point.x,
        point.z,
        height,
        suitability,
        this.field.sampleEcologyAt(point.x, point.z, height),
        this.colorScratch,
      );

      const light = THREE.MathUtils.clamp(
        this.normalScratch.x * SHADE_DIRECTION_X +
          this.normalScratch.z * SHADE_DIRECTION_Z +
          this.normalScratch.y,
        0,
        1.6,
      );
      const shade = AMBIENT_SHADE + SHADE_STRENGTH * light;
      const pixel = (offset + column) * 4;
      data[pixel] = toByte(this.colorScratch.r * shade);
      data[pixel + 1] = toByte(this.colorScratch.g * shade);
      data[pixel + 2] = toByte(this.colorScratch.b * shade);
      data[pixel + 3] = 255;
    }
  }

  private heightAt(column: number, row: number): number {
    const { resolution } = this.extent;
    const clampedColumn = column < 0 ? 0 : column >= resolution ? resolution - 1 : column;
    const clampedRow = row < 0 ? 0 : row >= resolution ? resolution - 1 : row;
    return this.heights[clampedRow * resolution + clampedColumn];
  }
}

/**
 * Terrain colours are linear; the canvas expects sRGB. Skipping the transfer
 * here is what makes a hand-built map look muddy next to the rendered world.
 */
function toByte(linear: number): number {
  const clamped = linear <= 0 ? 0 : linear >= 1 ? 1 : linear;
  const encoded =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}
