/**
 * Low-frequency variation shared by every grass LOD.
 *
 * Per-blade randomness alone produces a field that is uniform at any scale
 * larger than a blade: statistically identical everywhere, which is what makes
 * procedural grass read as a carpet rather than as a meadow. These functions
 * add the missing scales — dry patches, vigour bands, and canopy occlusion that
 * vary over metres rather than centimetres.
 *
 * Every LOD must call the same functions with the same world coordinates.
 * Near tiles, mid patches, and the far impostor instances all resolve the same
 * palette, so any macro term applied to one and not the others would show up as
 * a brightness step exactly at an LOD handoff. `verify-lod-color-parity`
 * reproduces the distributions below and bounds that step.
 *
 * These run once per blade at build time and never per frame. A single value
 * noise octave is four hashes; the terrain height sample and matrix compose
 * that surround them in the placement loop each cost considerably more.
 */

/** Metres per lattice cell of the dryness field. */
export const DRYNESS_PERIOD = 27;
/** Metres per lattice cell of the vigour field, deliberately not a multiple. */
export const VIGOR_PERIOD = 19;
/**
 * Metres per lattice cell of the clearing field, and deliberately the shortest
 * of the three. Dryness and vigour band the meadow at regional scale; a
 * clearing has to read from a standing camera as a gap between clumps, which
 * is a handful of metres, not tens of them.
 */
const CLEARING_PERIOD = 7;
export const DRYNESS_SEED = 0x51_7c_c1_b7;
export const VIGOR_SEED = 0x27_22_0a_95;
const CLEARING_SEED = 0x6d_1f_93_2b;

/**
 * How much of a blade's dryness comes from the macro field. Applied identically
 * at every LOD; raising it beyond roughly a quarter starts to push the p95
 * near-to-mid colour delta past the parity budget, because the two LODs draw
 * their remaining per-blade jitter independently.
 */
export const GRASS_MACRO_DRYNESS_STRENGTH = 0.22;

/**
 * Peak canopy occlusion, as a fraction of blade luminance, in the densest and
 * most vigorous parts of the field. This is the ambient term: it darkens whole
 * blades where they stand shoulder to shoulder, and it is what gives a dense
 * field visible depth instead of a flat green sheet. The progress-dependent
 * root darkening in the palette is the other half of the same effect.
 */
const CANOPY_AO_STRENGTH = 0.17;

function hashLattice(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep-interpolated value noise on a unit lattice, in [0, 1]. */
function valueNoise(x: number, z: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const fractionX = x - cellX;
  const fractionZ = z - cellZ;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightZ = fractionZ * fractionZ * (3 - 2 * fractionZ);
  const corner00 = hashLattice(cellX, cellZ, seed);
  const corner10 = hashLattice(cellX + 1, cellZ, seed);
  const corner01 = hashLattice(cellX, cellZ + 1, seed);
  const corner11 = hashLattice(cellX + 1, cellZ + 1, seed);
  const lower = corner00 + (corner10 - corner00) * weightX;
  const upper = corner01 + (corner11 - corner01) * weightX;
  return lower + (upper - lower) * weightZ;
}

/**
 * Two octaves so patches have both a broad shape and a ragged edge. The
 * second octave is halved in weight and normalised back to [0, 1].
 */
function patchNoise(x: number, z: number, period: number, seed: number): number {
  const coarse = valueNoise(x / period, z / period, seed);
  const fine = valueNoise((x * 2.7) / period, (z * 2.7) / period, seed ^ 0x9e3779b9);
  return (coarse + fine * 0.5) / 1.5;
}

/**
 * Broad dry patches, in [0, 1]. Feeds the palette's dryness input on top of the
 * terrain suitability term that was already there, so a well-watered slope can
 * still carry a dry crown and a poor one can stay green in a hollow.
 */
export function sampleGrassMacroDryness(x: number, z: number): number {
  return patchNoise(x, z, DRYNESS_PERIOD, DRYNESS_SEED);
}

/**
 * Growth vigour, in [0, 1]. Drives clump height banding and, with terrain
 * suitability, how strongly the canopy occludes itself.
 */
export function sampleGrassMacroVigor(x: number, z: number): number {
  return patchNoise(x, z, VIGOR_PERIOD, VIGOR_SEED);
}

/**
 * Open ground, in [0, 1]. High where the meadow simply has no grass on it.
 *
 * This is the one macro field that is not a modulation of how *well* grass
 * grows: dryness and vigour scale a canopy that is still there, and every
 * ecological term upstream is floored by the biome's climate retention so a
 * meadow cannot climate itself bald. That floor is correct, and it is also why
 * the field read as one opaque carpet — nothing downstream of it could reach
 * zero, so bare ground was unreachable at any ecology. A clearing is not poor
 * climate; it is ground with nothing on it, so it applies after the floor and
 * is allowed to take density to zero.
 */
export function sampleGrassMacroClearing(x: number, z: number): number {
  return patchNoise(x, z, CLEARING_PERIOD, CLEARING_SEED);
}

/**
 * Clearing-field value above which a given share of ground lies, measured from
 * the field itself over a 160 000-sample grid.
 *
 * Two smoothed octaves averaged together do not produce a uniform variate: the
 * field's median is 0.505 and it reaches 0.8 only in the top few per cent, so
 * the obvious `threshold = 1 - coverage` is wrong by roughly an order of
 * magnitude at the useful end. Authoring against it opened 3% of the ground
 * when it asked for 20%. These are the measured quantiles, so the config lever
 * means the share of ground it says it means.
 *
 * Index i is the threshold for a coverage of `(i + 1) * 0.05`.
 */
const CLEARING_THRESHOLD_BY_COVERAGE = [
  0.7650, 0.7139, 0.6777, 0.6468, 0.6200, 0.5949, 0.5716, 0.5486,
] as const;

/**
 * Resolves the clearing threshold for a target open-ground share, in [0, 0.4].
 * Coverage counts ground thinned by at least half, which is where the ramp in
 * {@link sampleGrassHabitat} crosses 0.5.
 */
export function resolveGrassClearingThreshold(coverage: number): number {
  const table = CLEARING_THRESHOLD_BY_COVERAGE;
  if (coverage <= 0) {
    return 1.1;
  }
  const position = coverage / 0.05 - 1;
  if (position <= 0) {
    // Below the first measured anchor, interpolate toward "nothing opens".
    return table[0] + (1.1 - table[0]) * -position;
  }
  const low = Math.min(Math.floor(position), table.length - 1);
  const high = Math.min(low + 1, table.length - 1);
  return table[low] + (table[high] - table[low]) * (position - low);
}

/**
 * Whole-blade ambient occlusion from the surrounding canopy, as a multiplier on
 * blade luminance. Dense, vigorous grass sits in its own shade; sparse grass on
 * poor ground does not.
 *
 * `suitability` and `vigor` are both in [0, 1], so the result is bounded by
 * `[1 - CANOPY_AO_STRENGTH, 1]` and cannot drive the palette negative.
 */
/**
 * Metres per lattice cell of the path-edge field.
 *
 * Far shorter than the other macro periods because it roughens a boundary whose
 * feature size is about a metre. The terrain shader used to roughen the path
 * core with its 64 m and 29.5 m surface-noise channels, which is the wrong
 * scale for the job by more than an order of magnitude -- and, worse, was a
 * field the CPU could not sample, so the blades and the painted ground were
 * roughened by different things and could only agree on average.
 */
export const PATH_EDGE_PERIOD = 6;
export const PATH_EDGE_SEED = 0x1c_2d_8f_43;

/**
 * Roughness for a path boundary, zero-mean in [-0.5, 0.5].
 *
 * Read identically by the terrain field when it decides where blades stop and
 * by the terrain shader when it decides where dirt starts. That sharing is the
 * whole point: a ragged dirt core inside a cleanly-offset grass edge is what
 * makes a verge read as a stencil laid over the meadow.
 */
export function samplePathEdgeNoise(x: number, z: number): number {
  return patchNoise(x, z, PATH_EDGE_PERIOD, PATH_EDGE_SEED) - 0.5;
}

export function resolveGrassCanopyAo(vigor: number, suitability: number): number {
  return 1 - CANOPY_AO_STRENGTH * vigor * suitability;
}
