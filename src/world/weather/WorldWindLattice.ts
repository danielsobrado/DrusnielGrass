import {
  DataTexture, FloatType, NearestFilter, RGFormat, RepeatWrapping,
} from "three/webgpu";

const TWO_PI = Math.PI * 2;
const HASH_COEFFICIENTS = Object.freeze([12.9898, 78.233] as const);
const HASH_SCALE = 43758.5453;

/**
 * The gradient lattice period, in noise cells.
 *
 * The field repeats every `WIND_LATTICE_PERIOD` cells, so the repeat distance
 * is the period divided by a layer's spatial scale. With the shipped scales:
 *
 * | layer     | scale (1/m) | cell size | repeat distance |
 * | --------- | ----------- | --------- | --------------- |
 * | warp      | 0.010       | 100 m     | 25.6 km         |
 * | large     | 0.015       | 66.7 m    | 17.1 km         |
 * | medium    | 0.070       | 14.3 m    | 3.7 km          |
 * | flutter   | 0.350       | 2.9 m     | 732 m           |
 *
 * The world is 2048 m across, so every layer that carries structure a person
 * could recognise — the gust fronts and their meander — repeats well outside it.
 * Only the flutter layer repeats within the world, and it is fine detail with
 * no recognisable shape, so its period is not visible. A larger period would
 * push that out too, at four bytes per cell squared: 256 costs 256 KB, 512
 * costs 1 MB for a repeat nobody can see either way.
 */
export const WIND_LATTICE_PERIOD = 256;

/**
 * Why the field samples a lattice instead of hashing in the shader.
 *
 * The model's gradient hash is `fract(sin(dot(cell, k)) * 43758.5453)`. On a
 * double-precision CPU and a single-precision GPU that expression does not
 * produce the same number: `sin` of a large argument multiplied by a large
 * constant discards exactly the bits the fractional part keeps. Measured over a
 * 64x64 world grid, the CPU and GPU gust fields disagreed by up to the full
 * output range with a mean error of 0.27 — two different noise fields, not one
 * field with rounding error. WebGL and WebGPU agreed with each other to 1e-5,
 * which is what identifies the cause as CPU-versus-GPU precision rather than a
 * backend difference.
 *
 * So the hash is evaluated once, here, on the CPU, and both samplers read the
 * result: this array, and a nearest-filtered float texture built from it. The
 * gradients are then identical by construction rather than by luck, and the
 * only difference left between CPU and GPU is float32 rounding in the
 * interpolation itself.
 */
let sharedGradients: Float32Array | undefined;

/** The source hash, retained so the lattice reproduces the original field. */
export function windSourceHashGradient(x: number, y: number): [number, number] {
  const angle = (
    (value: number): number => value - Math.floor(value)
  )(
    Math.sin(x * HASH_COEFFICIENTS[0] + y * HASH_COEFFICIENTS[1]) * HASH_SCALE,
  ) * TWO_PI;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * Builds the lattice once: cos and sin per cell, in float32.
 *
 * Stored as float32 rather than the angle so neither sampler has to call `cos`
 * and `sin` again — that call is the second place the two could diverge — and
 * in the same precision the texture will hold, so the CPU reads exactly the
 * numbers the GPU will.
 */
export function getWindGradientLattice(): Float32Array {
  if (!sharedGradients) {
    const gradients = new Float32Array(WIND_LATTICE_PERIOD * WIND_LATTICE_PERIOD * 2);
    for (let cellY = 0; cellY < WIND_LATTICE_PERIOD; cellY++) {
      for (let cellX = 0; cellX < WIND_LATTICE_PERIOD; cellX++) {
        const [gradientX, gradientY] = windSourceHashGradient(cellX, cellY);
        const index = (cellY * WIND_LATTICE_PERIOD + cellX) * 2;
        gradients[index] = gradientX;
        gradients[index + 1] = gradientY;
      }
    }
    sharedGradients = gradients;
  }
  return sharedGradients;
}

/** Positive modulo, so negative world coordinates wrap the same way. */
export function wrapLatticeIndex(cell: number): number {
  return ((cell % WIND_LATTICE_PERIOD) + WIND_LATTICE_PERIOD) % WIND_LATTICE_PERIOD;
}

/** The gradient at a lattice cell, wrapping into the period. */
export function windLatticeGradient(cellX: number, cellY: number): [number, number] {
  const gradients = getWindGradientLattice();
  const index = (wrapLatticeIndex(cellY) * WIND_LATTICE_PERIOD + wrapLatticeIndex(cellX)) * 2;
  return [gradients[index], gradients[index + 1]];
}

/**
 * The lattice as a texture the shaders sample.
 *
 * Nearest filtering and a float format are both load-bearing: any filtering
 * would blend neighbouring gradients and stop the GPU reading the number the
 * CPU read, and eight bits per channel would quantise the gradient direction
 * into visible banding across the gust fronts. Repeat wrapping gives the
 * periodic lookup for free, so the shader needs no modulo of its own.
 */
export function createWindGradientTexture(): DataTexture {
  const gradients = getWindGradientLattice();
  // RG float; the blue and alpha channels would cost memory for nothing.
  const texture = new DataTexture(
    gradients, WIND_LATTICE_PERIOD, WIND_LATTICE_PERIOD, RGFormat, FloatType,
  );
  texture.name = "world-wind-gradient-lattice";
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

let sharedTexture: DataTexture | undefined;

export function getWindGradientTexture(): DataTexture {
  if (!sharedTexture) {
    sharedTexture = createWindGradientTexture();
  }
  return sharedTexture;
}

export function disposeWindGradientTexture(): void {
  const texture = sharedTexture;
  sharedTexture = undefined;
  texture?.dispose();
}
