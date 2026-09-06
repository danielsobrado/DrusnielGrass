import type { WorldConfig } from "../WorldConfig";

const TWO_PI = Math.PI * 2;
const LAKE_EDGE_FEATHER_RATIO = 0.035;
const LAKE_SECONDARY_EDGE_RATIO = 0.45;
const LAKE_PRIMARY_EDGE_LOBES = 5;
const LAKE_SECONDARY_EDGE_LOBES = 9;
const LAKE_MIN_ASPECT = 0.76;
export const HYDROLOGY_LAKE_MAX_ASPECT = 1.28;
const LAKE_COVERAGE_OUTER_EDGE = 1.02;
/** Widest `1 + edge` the lobed shoreline can reach, so bands push out by at most this. */
const HYDROLOGY_LAKE_MAX_EDGE_SCALE =
  1 + LAKE_EDGE_FEATHER_RATIO * (1 + LAKE_SECONDARY_EDGE_RATIO);
/** Radii are `base * aspect` and `base / aspect`, so a thin lake beats the max aspect. */
const LAKE_MAX_RADIUS_SCALE = Math.max(
  HYDROLOGY_LAKE_MAX_ASPECT,
  1 / LAKE_MIN_ASPECT,
);
/** Bands are measured in short-radius units, so they stretch along the long radius. */
const LAKE_MAX_BAND_STRETCH = LAKE_MAX_RADIUS_SCALE * LAKE_MAX_RADIUS_SCALE;

export interface LakeSample {
  coverage: number;
  basin: number;
  proximity: number;
  waterLevel: number;
  normalizedDistance: number;
}

export function createLakeSample(): LakeSample {
  return {
    coverage: 0,
    basin: 0,
    proximity: 0,
    waterLevel: 0,
    normalizedDistance: Number.POSITIVE_INFINITY,
  };
}

/**
 * Worst-case reach of a lake's water, shoreline, and humidity halo from its center.
 * `LakeField` only ever resolves the cell a sample falls in, so a lake center has to
 * stay at least this far from every edge of its own cell. Under-reserve it and the
 * neighbouring cell cuts a band off mid-value, stepping along the cell boundary.
 */
export function resolveHydrologyLakeCellMargin(config: WorldConfig): number {
  const longestRadius = config.lakeRadiusMax * LAKE_MAX_RADIUS_SCALE;
  const widestBand = Math.max(
    longestRadius * LAKE_COVERAGE_OUTER_EDGE,
    longestRadius +
      Math.max(config.lakeShoreWidth, config.waterHumidityRadius) *
        LAKE_MAX_BAND_STRETCH,
  );
  return widestBand * HYDROLOGY_LAKE_MAX_EDGE_SCALE + 2;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

function hash(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Deterministic lowland lake basins with cached per-cell shape parameters. */
export class LakeField {
  private readonly cellMargin: number;
  private cellX = Number.NaN;
  private cellZ = Number.NaN;
  private active = false;
  private centerX = 0;
  private centerZ = 0;
  private radiusX = 1;
  private radiusZ = 1;
  private rotationCos = 1;
  private rotationSin = 0;
  private edgePhase = 0;
  private waterLevel = 0;
  private basinBand = 1;
  private proximityBand = 1;
  private influenceLimitSquared = 0;

  constructor(private readonly config: WorldConfig) {
    this.cellMargin = resolveHydrologyLakeCellMargin(config);
  }

  sample(
    x: number,
    z: number,
    height: number,
    target: LakeSample,
  ): LakeSample {
    const spacing = this.config.lakeSpacing;
    const cellX = Math.floor(x / spacing);
    const cellZ = Math.floor(z / spacing);
    this.prepareCell(cellX, cellZ);
    if (!this.active) {
      return this.clear(target);
    }

    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    const normalizedX =
      (dx * this.rotationCos + dz * this.rotationSin) / this.radiusX;
    const normalizedZ =
      (-dx * this.rotationSin + dz * this.rotationCos) / this.radiusZ;
    const normalizedSquared =
      normalizedX * normalizedX + normalizedZ * normalizedZ;
    // Beyond the widest band every output is zero, so skip the shoreline lobes.
    if (normalizedSquared >= this.influenceLimitSquared) {
      return this.clear(target);
    }

    const normalized = Math.sqrt(normalizedSquared);
    const polar = Math.atan2(normalizedZ, normalizedX);
    const edge =
      Math.sin(polar * LAKE_PRIMARY_EDGE_LOBES + this.edgePhase) *
        LAKE_EDGE_FEATHER_RATIO +
      Math.sin(
        polar * LAKE_SECONDARY_EDGE_LOBES - this.edgePhase * 0.71,
      ) *
        LAKE_EDGE_FEATHER_RATIO *
        LAKE_SECONDARY_EDGE_RATIO;
    const shapedDistance = normalized / (1 + edge);
    const altitudeMask =
      1 -
      smoothstep(
        height,
        this.waterLevel + this.config.lakeDepth * 0.8,
        this.waterLevel + this.config.lakeDepth + this.config.lakeShoreWidth,
      );

    target.coverage =
      (1 - smoothstep(shapedDistance, 0.96, LAKE_COVERAGE_OUTER_EDGE)) *
      altitudeMask;
    target.basin =
      (1 - smoothstep(shapedDistance, 1, this.basinBand)) * altitudeMask;
    target.proximity =
      (1 - smoothstep(shapedDistance, 1, this.proximityBand)) * altitudeMask;
    target.waterLevel = this.waterLevel;
    target.normalizedDistance = shapedDistance;
    return target;
  }

  private prepareCell(cellX: number, cellZ: number): void {
    if (cellX === this.cellX && cellZ === this.cellZ) return;

    this.cellX = cellX;
    this.cellZ = cellZ;
    this.active =
      hash(cellX, cellZ, this.config.seed + 1201) < this.config.lakeChance;
    if (!this.active) return;

    const spacing = this.config.lakeSpacing;
    const margin = this.cellMargin;
    const available = spacing - margin * 2;
    this.centerX =
      cellX * spacing +
      margin +
      hash(cellX, cellZ, this.config.seed + 1213) * available;
    this.centerZ =
      cellZ * spacing +
      margin +
      hash(cellX, cellZ, this.config.seed + 1223) * available;
    const baseRadius = lerp(
      this.config.lakeRadiusMin,
      this.config.lakeRadiusMax,
      hash(cellX, cellZ, this.config.seed + 1231),
    );
    const aspect = lerp(
      LAKE_MIN_ASPECT,
      HYDROLOGY_LAKE_MAX_ASPECT,
      hash(cellX, cellZ, this.config.seed + 1237),
    );
    this.radiusX = baseRadius * aspect;
    this.radiusZ = baseRadius / aspect;
    const angle = hash(cellX, cellZ, this.config.seed + 1249) * TWO_PI;
    this.rotationCos = Math.cos(angle);
    this.rotationSin = Math.sin(angle);
    this.edgePhase = hash(cellX, cellZ, this.config.seed + 1259) * TWO_PI;
    const levelNoise = hash(cellX, cellZ, this.config.seed + 1277);
    this.waterLevel =
      this.config.baseHeight +
      this.config.rollingHeight * lerp(0.06, 0.42, levelNoise);

    const minimumRadius = Math.min(this.radiusX, this.radiusZ);
    this.basinBand = 1 + this.config.lakeShoreWidth / minimumRadius;
    this.proximityBand = 1 + this.config.waterHumidityRadius / minimumRadius;
    // `shapedDistance` is `normalized / (1 + edge)`, so a normalized distance past
    // the widest band times the widest edge cannot land inside any band.
    const influenceLimit =
      Math.max(LAKE_COVERAGE_OUTER_EDGE, this.basinBand, this.proximityBand) *
      HYDROLOGY_LAKE_MAX_EDGE_SCALE;
    this.influenceLimitSquared = influenceLimit * influenceLimit;
  }

  private clear(target: LakeSample): LakeSample {
    target.coverage = 0;
    target.basin = 0;
    target.proximity = 0;
    target.waterLevel = 0;
    target.normalizedDistance = Number.POSITIVE_INFINITY;
    return target;
  }
}
