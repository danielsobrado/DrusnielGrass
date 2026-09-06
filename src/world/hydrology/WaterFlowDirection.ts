import { WATER_VISIBLE_COVERAGE_THRESHOLD } from "./WaterMaterialTuning";

const FLOW_EPSILON = 1e-6;

export interface WaterFlowSample {
  riverCoverage: number;
  flowX: number;
  flowZ: number;
}

export function createWaterFlowSample(): WaterFlowSample {
  return { riverCoverage: 0, flowX: 0, flowZ: 0 };
}

export interface WaterSurfaceGradient {
  gradientX: number;
  gradientZ: number;
}

export function createWaterSurfaceGradient(): WaterSurfaceGradient {
  return { gradientX: 0, gradientZ: 0 };
}

/**
 * Every vertex carries a surface height, but a dry one carries the bank it sits on
 * rather than a water surface. Folding that into the slope lets a steep bank decide
 * which way the river runs, so dry neighbours collapse onto the sampled vertex and
 * the difference becomes one-sided instead.
 */
function wetNeighbour(
  data: Float32Array,
  neighbour: number,
  fallback: number,
): number {
  return data[neighbour * 4] >= WATER_VISIBLE_COVERAGE_THRESHOLD
    ? neighbour
    : fallback;
}

/** Central-difference slope of the water sheet at one vertex, in world units. */
export function resolveWaterSurfaceGradient(
  index: number,
  resolution: number,
  positions: Float32Array,
  data: Float32Array,
  target: WaterSurfaceGradient,
): WaterSurfaceGradient {
  const xIndex = index % resolution;
  const zIndex = Math.floor(index / resolution);
  const left = xIndex > 0 ? wetNeighbour(data, index - 1, index) : index;
  const right =
    xIndex + 1 < resolution ? wetNeighbour(data, index + 1, index) : index;
  const down =
    zIndex > 0 ? wetNeighbour(data, index - resolution, index) : index;
  const up =
    zIndex + 1 < resolution
      ? wetNeighbour(data, index + resolution, index)
      : index;

  const leftPosition = left * 3;
  const rightPosition = right * 3;
  const downPosition = down * 3;
  const upPosition = up * 3;
  const deltaX = positions[rightPosition] - positions[leftPosition];
  const deltaZ = positions[upPosition + 2] - positions[downPosition + 2];
  target.gradientX =
    Math.abs(deltaX) > FLOW_EPSILON
      ? (positions[rightPosition + 1] - positions[leftPosition + 1]) / deltaX
      : 0;
  target.gradientZ =
    Math.abs(deltaZ) > FLOW_EPSILON
      ? (positions[upPosition + 1] - positions[downPosition + 1]) / deltaZ
      : 0;
  return target;
}

const scratchGradient = createWaterSurfaceGradient();

/** Resolves a downhill CPU direction without changing the packed tangent's length. */
export function resolveDownhillWaterFlow(
  index: number,
  resolution: number,
  positions: Float32Array,
  data: Float32Array,
  target: WaterFlowSample,
): WaterFlowSample {
  const dataOffset = index * 4;
  const riverCoverage = Math.hypot(
    data[dataOffset + 2],
    data[dataOffset + 3],
  );
  target.riverCoverage = riverCoverage;
  target.flowX = 0;
  target.flowZ = 0;
  if (!(riverCoverage > FLOW_EPSILON)) return target;

  let flowX = data[dataOffset + 2] / riverCoverage;
  let flowZ = data[dataOffset + 3] / riverCoverage;
  const { gradientX, gradientZ } = resolveWaterSurfaceGradient(
    index,
    resolution,
    positions,
    data,
    scratchGradient,
  );

  if (gradientX * flowX + gradientZ * flowZ > 0) {
    flowX = -flowX;
    flowZ = -flowZ;
  }
  target.flowX = flowX;
  target.flowZ = flowZ;
  return target;
}
