/**
 * Axis sample positions for the horizon shell.
 *
 * The shell is one regular grid in index space mapped non-uniformly onto world
 * space: even spacing across the ground the player can actually stand on, then
 * a handful of rings whose spacing grows geometrically out into an apron well
 * beyond the world bounds.
 *
 * The grading is what makes the shell affordable. A uniform grid fine enough
 * for the near horizon would need hundreds of thousands of triangles to also
 * reach the distance at which fog finally closes; a uniform grid cheap enough
 * to reach that distance is too coarse where the streamed ring hands over. The
 * apron rings cover the last two kilometres for the price of a few hundred
 * cells because nothing out there is ever more than a hazy silhouette.
 *
 * Keeping it one regular topology rather than a fine mesh abutting a coarse one
 * matters more than it looks: abutting grids of different densities meet at
 * T-junctions, and T-junctions crack open into slivers of sky under any
 * floating-point disagreement. A single index-space grid cannot crack, and it
 * stays one draw call.
 */

/**
 * The validator's 120k-triangle ceiling fits below 245 samples per axis. Keep a
 * small allocation guard in the primitive too so direct callers or malformed
 * config cannot allocate an enormous typed array before policy validation runs.
 */
export const MAX_HORIZON_AXIS_SAMPLES = 256;

/** Positions along one axis, ascending, symmetric about the world centre. */
export interface WorldHorizonAxis {
  /** World coordinate of each grid line, from `-outerHalfExtent` upward. */
  readonly positions: Float32Array;
  /** Grid lines per axis; the shell holds `size * size` vertices. */
  readonly size: number;
  /** Cells spanning the world proper, at uniform `spacing`. */
  readonly interiorCells: number;
  /** Half-extent of the whole shell, apron included. */
  readonly outerHalfExtent: number;
}

/**
 * Builds the shared axis for both grid directions. The shell is square and
 * centred on the world origin, so one axis describes it completely.
 *
 * `worldSize` must divide evenly into `spacing` so that interior grid lines
 * land on the same coordinates the streamed chunks sample. Where the two
 * meshes share a vertex position they agree exactly, which is what keeps the
 * handover from showing a seam even before the sink ramp hides it.
 */
export function createWorldHorizonAxis(
  worldSize: number,
  spacing: number,
  apronRings: number,
  apronGrowth: number,
): WorldHorizonAxis {
  const interiorCells = Math.round(worldSize / spacing);
  if (!Number.isFinite(interiorCells) || interiorCells < 2) {
    throw new Error("horizonSpacing must divide the world into at least two cells.");
  }
  if (Math.abs(interiorCells * spacing - worldSize) > 1e-6) {
    throw new Error("worldSize must be divisible by horizonSpacing.");
  }

  const size = interiorCells + 1 + apronRings * 2;
  if (!Number.isSafeInteger(size) || size > MAX_HORIZON_AXIS_SAMPLES) {
    throw new Error(
      `Horizon axis requires ${size} samples, above the ${MAX_HORIZON_AXIS_SAMPLES} allocation ceiling.`,
    );
  }

  const worldHalfExtent = worldSize * 0.5;
  const apronOffsets = createApronOffsets(spacing, apronRings, apronGrowth);
  // Positions are stored as float32 for upload. Publish the same quantized
  // endpoint so bounds and symmetry checks describe the actual mesh rather
  // than a nearby float64 value that no vertex can represent.
  const outerHalfExtent = Math.fround(
    worldHalfExtent + (apronOffsets[apronOffsets.length - 1] ?? 0),
  );
  const positions = new Float32Array(size);

  // Descending apron below the world, so the axis stays ascending overall.
  for (let ring = 0; ring < apronRings; ring += 1) {
    positions[ring] =
      -worldHalfExtent - apronOffsets[apronRings - 1 - ring];
  }
  for (let line = 0; line <= interiorCells; line += 1) {
    positions[apronRings + line] = -worldHalfExtent + line * spacing;
  }
  for (let ring = 0; ring < apronRings; ring += 1) {
    positions[apronRings + interiorCells + 1 + ring] =
      worldHalfExtent + apronOffsets[ring];
  }

  return { positions, size, interiorCells, outerHalfExtent };
}

/**
 * Cumulative distance of each apron ring beyond the world edge. The first ring
 * steps out by `spacing * growth` rather than by `spacing`, so the apron starts
 * already coarsening instead of wasting a ring reproducing the interior.
 */
function createApronOffsets(
  spacing: number,
  apronRings: number,
  apronGrowth: number,
): Float32Array {
  const offsets = new Float32Array(apronRings);
  let step = spacing;
  let distance = 0;
  for (let ring = 0; ring < apronRings; ring += 1) {
    step *= apronGrowth;
    distance += step;
    offsets[ring] = distance;
  }
  return offsets;
}
