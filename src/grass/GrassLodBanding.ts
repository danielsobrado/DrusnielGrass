/**
 * World-space wander applied to every camera-distance LOD edge, and the shared
 * lattice noise every LOD schedule and macro field is built from.
 *
 * Six schedules in this renderer key off camera distance: the terrain's micro
 * and meso detail weights and its canopy merge, the mid layer's density
 * falloff, the detail-foliage fade, and the near/mid/far handoffs. Individually
 * each is dithered. Together they used to share the same two edge values -- 28 m
 * and 54 m -- which is what turned a stack of soft fades into one hard ring
 * following the camera across the hillside.
 *
 * Separating the edges is most of the fix. This is the rest of it: offsetting
 * each schedule's *distance* by a low-frequency world-space field turns every
 * remaining boundary into one that wanders over tens of metres instead of
 * tracing a circle centred on the viewer.
 *
 * Two properties make it safe to apply everywhere:
 *
 * - The offset is added to the distance rather than to the two edges, so a
 *   jittered `start` can never cross a jittered `end`. The ordering invariant
 *   holds by construction rather than by a bound on the jitter amount.
 * - The field is zero-mean, so a schedule's average coverage over any large
 *   area is unchanged and `verify-lod-color-parity`'s budget is untouched.
 *
 * The GLSL exports below are the mirrors the shaders inject. They must stay
 * bit-identical to the TypeScript above them: `Math.imul` is a 32-bit signed
 * multiply and GLSL ES 3.0 `uint * uint` is mod 2^32, so the bit patterns agree,
 * and `verify-lod-band-separation` parses the GLSL text and re-evaluates it
 * against the functions here rather than trusting that claim.
 */

/**
 * Metres per lattice cell of the wander field.
 *
 * Deliberately not a multiple of any macro ecology period (19, 27, 7, 36) or of
 * any transition width. A wander that beat against the dryness or vigour fields
 * would trade a ring for a moire.
 */
export const LOD_BAND_JITTER_PERIOD = 46;
export const LOD_BAND_JITTER_SEED = 0x2f_a5_1b_c7;

/**
 * Share of a schedule's own transition width spent wandering.
 *
 * One ratio rather than a knob per schedule: the useful wander is a fixed
 * fraction of the width being wandered, so deriving it removes four levers that
 * could only ever be set wrong relative to each other. The runtime value comes
 * from `config.lodBandJitterRatio`; this is the ceiling the schema enforces.
 */
export const MAX_LOD_BAND_JITTER_RATIO = 0.5;

/**
 * Ceiling on the wander, in metres, however wide the schedule.
 *
 * The wander exists to stop a boundary tracing a circle around the viewer, and
 * eight metres of it already destroys a circle at any range this world draws.
 * Without the cap a 72 m-wide schedule would swing by a dozen metres and start
 * colliding with its neighbours at the extremes of the field — trading the ring
 * for the stacking the separation was for.
 */
export const LOD_BAND_JITTER_MAX_METRES = 8;

/** Metres a schedule of the given width wanders, before the signed offset. */
export function resolveLodBandJitterMetres(
  start: number,
  end: number,
  ratio: number,
): number {
  return Math.min((end - start) * ratio, LOD_BAND_JITTER_MAX_METRES);
}

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
 * Two octaves so the boundary is ragged as well as wandering. Identical in
 * construction to `GrassFieldVariation.patchNoise`, and deliberately duplicated
 * rather than imported: the band field must be re-tunable without moving the
 * ecology fields that decide where plants grow.
 */
function patchNoise(x: number, z: number, period: number, seed: number): number {
  const coarse = valueNoise(x / period, z / period, seed);
  const fine = valueNoise((x * 2.7) / period, (z * 2.7) / period, seed ^ 0x9e3779b9);
  return (coarse + fine * 0.5) / 1.5;
}

/** Zero-mean offset in [-0.5, 0.5], smooth in world space. */
export function sampleLodBandOffset(x: number, z: number): number {
  return patchNoise(x, z, LOD_BAND_JITTER_PERIOD, LOD_BAND_JITTER_SEED) - 0.5;
}

/**
 * Applies a schedule's wander to a camera distance.
 *
 * Callers pass their own edges so the wander scales with the width being
 * wandered; the result is fed to `smoothstep(start, end, ...)` unchanged.
 */
export function resolveLodBandDistance(
  distance: number,
  start: number,
  end: number,
  ratio: number,
  x: number,
  z: number,
): number {
  return (
    distance +
    resolveLodBandJitterMetres(start, end, ratio) * sampleLodBandOffset(x, z)
  );
}

/**
 * The lattice hash, value noise, and two-octave patch noise, in GLSL.
 *
 * Injected by every shader that needs a world-space field the CPU also
 * evaluates. WebGL2 is the only backend three 0.185 supports, so `uint` and the
 * bit operators below are always available.
 *
 * `float(uint)` loses bits above 2^24, so a GLSL sample can differ from the JS
 * one by at most about 6e-8 relative. That is four orders of magnitude below
 * anything a capture resolves, and the parity gate uses 1e-5.
 */
export const GRASS_LATTICE_NOISE_GLSL = `
#ifndef GRASS_LATTICE_NOISE
#define GRASS_LATTICE_NOISE
uint grassLatticeHash(int x, int z, uint seed) {
  uint value = (uint(x) * 374761393u) ^ (uint(z) * 668265263u) ^ seed;
  value = (value ^ (value >> 13u)) * 1274126177u;
  return value ^ (value >> 16u);
}

float grassLatticeHash01(int x, int z, uint seed) {
  return float(grassLatticeHash(x, z, seed)) / 4294967296.0;
}

float grassValueNoise(vec2 position, uint seed) {
  vec2 cell = floor(position);
  vec2 fraction = position - cell;
  vec2 weight = fraction * fraction * (3.0 - 2.0 * fraction);
  int cellX = int(cell.x);
  int cellZ = int(cell.y);
  float corner00 = grassLatticeHash01(cellX, cellZ, seed);
  float corner10 = grassLatticeHash01(cellX + 1, cellZ, seed);
  float corner01 = grassLatticeHash01(cellX, cellZ + 1, seed);
  float corner11 = grassLatticeHash01(cellX + 1, cellZ + 1, seed);
  return mix(
    mix(corner00, corner10, weight.x),
    mix(corner01, corner11, weight.x),
    weight.y
  );
}

float grassPatchNoise(vec2 world, float period, uint seed) {
  float coarse = grassValueNoise(world / period, seed);
  float fine = grassValueNoise((world * 2.7) / period, seed ^ 0x9e3779b9u);
  return (coarse + fine * 0.5) / 1.5;
}
#endif
`;

/**
 * The wander field and the distance it produces, in GLSL. Requires
 * {@link GRASS_LATTICE_NOISE_GLSL} to have been injected first.
 */
export const GRASS_LOD_BAND_GLSL = `
#ifndef GRASS_LOD_BAND
#define GRASS_LOD_BAND
float grassLodBandOffset(vec2 world) {
  return grassPatchNoise(
    world,
    ${LOD_BAND_JITTER_PERIOD.toFixed(1)},
    ${LOD_BAND_JITTER_SEED}u
  ) - 0.5;
}

float grassLodBandJitterMetres(float start, float end, float ratio) {
  return min(
    (end - start) * ratio,
    ${LOD_BAND_JITTER_MAX_METRES.toFixed(1)}
  );
}

float grassLodBandDistance(
  float distanceToCamera,
  float start,
  float end,
  float ratio,
  vec2 world
) {
  return distanceToCamera +
    grassLodBandJitterMetres(start, end, ratio) * grassLodBandOffset(world);
}
#endif
`;
