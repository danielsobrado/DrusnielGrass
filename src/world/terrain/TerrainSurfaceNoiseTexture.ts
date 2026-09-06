import * as THREE from "three";

export const TERRAIN_SURFACE_NOISE_SIZE = 256;
const BYTE_MAX = 255;
const TWO_PI = Math.PI * 2;

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Periodic value noise for coordinates already wrapped to the texture domain. */
function periodicValueNoise(
  x: number,
  y: number,
  cells: number,
  seed: number,
): number {
  const scaledX = (x / TERRAIN_SURFACE_NOISE_SIZE) * cells;
  const scaledY = (y / TERRAIN_SURFACE_NOISE_SIZE) * cells;
  const cellX = Math.floor(scaledX);
  const cellY = Math.floor(scaledY);
  const fractionX = scaledX - cellX;
  const fractionY = scaledY - cellY;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightY = fractionY * fractionY * (3 - 2 * fractionY);
  const nextX = cellX + 1 === cells ? 0 : cellX + 1;
  const nextY = cellY + 1 === cells ? 0 : cellY + 1;
  const lower = THREE.MathUtils.lerp(
    hash(cellX, cellY, seed),
    hash(nextX, cellY, seed),
    weightX,
  );
  const upper = THREE.MathUtils.lerp(
    hash(cellX, nextY, seed),
    hash(nextX, nextY, seed),
    weightX,
  );
  return THREE.MathUtils.lerp(lower, upper, weightY);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/** Writes one normalized RGBA sample and is periodic on both texture axes. */
export function sampleTerrainSurfaceNoisePixel(
  x: number,
  y: number,
  seed: number,
  target: Float64Array,
): void {
  const wrappedX = wrap(x, TERRAIN_SURFACE_NOISE_SIZE);
  const wrappedY = wrap(y, TERRAIN_SURFACE_NOISE_SIZE);
  const broad =
    periodicValueNoise(wrappedX, wrappedY, 2, seed + 11) * 0.68 +
    periodicValueNoise(wrappedX, wrappedY, 5, seed + 13) * 0.32;
  const meso =
    periodicValueNoise(wrappedX, wrappedY, 12, seed + 17) * 0.72 +
    periodicValueNoise(wrappedX, wrappedY, 27, seed + 19) * 0.28;
  const fine =
    periodicValueNoise(wrappedX, wrappedY, 48, seed + 23) * 0.62 +
    hash(wrappedX, wrappedY, seed + 29) * 0.38;
  const fibreCarrier = periodicValueNoise(
    wrappedX,
    wrappedY,
    19,
    seed + 31,
  );
  // Integer cycle counts make the directional carrier exactly periodic at
  // both edges. Arbitrary coefficients here produce a visible repeat seam.
  const fibrePhase =
    TWO_PI *
    ((wrappedX * 29) / TERRAIN_SURFACE_NOISE_SIZE +
      (wrappedY * 7) / TERRAIN_SURFACE_NOISE_SIZE);
  const fibre =
    0.5 +
    Math.sin(fibrePhase + fibreCarrier * 8.5) * 0.27 +
    (fract(fibreCarrier * 5.7) - 0.5) * 0.23;

  target[0] = THREE.MathUtils.clamp(broad, 0, 1);
  target[1] = THREE.MathUtils.clamp(meso, 0, 1);
  target[2] = THREE.MathUtils.clamp(fine, 0, 1);
  target[3] = THREE.MathUtils.clamp(fibre, 0, 1);
}

/**
 * A deterministic, seamless RGBA field generated once at startup.
 *
 * R carries broad patches, G meso variation, B fine soil grain, and A an
 * anisotropic organic/fibre pattern. Sampling those channels at rotated and
 * scaled world coordinates supplies the whole terrain surface without an
 * authored texture asset or a stack of per-fragment FBM octaves.
 */
/**
 * Mean of `smoothstep(0.68, 0.9, A)` over the fibre channel, measured across the
 * whole 256x256 field at level 0 and quantized exactly as the texture stores it.
 *
 * The terrain shader holds this mean constant as the micro-detail weight fades so
 * the ground does not brighten at the cutoff — only the speckle around it
 * disappears. It has to be the *measured* mean, not an eyeballed one: A is a
 * carrier-modulated sine, not a uniform, so the fraction of it above the 0.68
 * knee is not something the knee positions predict. Sampled over the six seeds in
 * `verify-terrain-surface` the mean lands in 0.080-0.085 regardless of seed,
 * which is what makes one constant legitimate here.
 */
export const TERRAIN_DRY_FIBRE_PULSE_MEAN = 0.082;

/**
 * Mean of `smoothstep(0.64, 0.86, B)` over the fine channel, measured across the
 * whole 256x256 field at level 0 and quantized exactly as the texture stores it.
 *
 * The grit pulse had the same defect the fibre pulse was fixed for and kept it:
 * it is strictly positive, so weighting it by the micro-detail fade removed
 * brightness from paths as the fade closed rather than removing only speckle.
 * Paths lightened across the micro boundary — one of the six camera-distance
 * schedules that stacked into the visible ring. Holding this mean constant means
 * only the variance around it disappears with distance.
 *
 * Measured over the six seeds `verify-terrain-surface` sweeps, where it spans
 * 0.0805 to 0.0909; B is a value-noise/hash blend rather than a uniform, so this
 * is not something the smoothstep knees predict.
 */
export const TERRAIN_GRIT_PULSE_MEAN = 0.0857;

export function createTerrainSurfaceNoiseTexture(seed: number): THREE.DataTexture {
  const data = new Uint8Array(
    TERRAIN_SURFACE_NOISE_SIZE * TERRAIN_SURFACE_NOISE_SIZE * 4,
  );
  const channels = new Float64Array(4);
  for (let y = 0; y < TERRAIN_SURFACE_NOISE_SIZE; y += 1) {
    for (let x = 0; x < TERRAIN_SURFACE_NOISE_SIZE; x += 1) {
      sampleTerrainSurfaceNoisePixel(x, y, seed, channels);
      const offset = (y * TERRAIN_SURFACE_NOISE_SIZE + x) * 4;
      data[offset] = Math.round(channels[0] * BYTE_MAX);
      data[offset + 1] = Math.round(channels[1] * BYTE_MAX);
      data[offset + 2] = Math.round(channels[2] * BYTE_MAX);
      data[offset + 3] = Math.round(channels[3] * BYTE_MAX);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    TERRAIN_SURFACE_NOISE_SIZE,
    TERRAIN_SURFACE_NOISE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = "world-terrain-surface-noise";
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}