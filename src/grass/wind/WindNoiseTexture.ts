import * as THREE from "three";

/**
 * The travelling gust field every grass layer shares.
 *
 * A single sine gust front is periodic at exactly one wavelength, and from any
 * elevated view that periodicity is the tell: the field pulses in stripes
 * rather than rolling. Two octaves of scrolling value noise read as real wind
 * because the crests are irregular in both spacing and width.
 *
 * The texture is tileable by construction — lattice coordinates are taken
 * modulo the period — so `RepeatWrapping` shows no seam, and one 128x128 RG
 * texture serves the whole world at every LOD. Sampling it costs one vertex
 * fetch per vertex, which is universally supported in WebGL2; the compact
 * profile compiles two crossing sine waves instead (see
 * {@link grassCompactGustGlsl}) and pays no texture fetch.
 */

/**
 * One texture repeat per this many metres, and repeats per second along the
 * wind. Every layer that samples the field must use the same two numbers, so
 * they live here rather than as per-material defaults.
 */
export const GRASS_WIND_NOISE_SCALE = 1 / 48;
export const GRASS_WIND_NOISE_SPEED = 0.06;

/**
 * The sine gust front the compact profile falls back to. Every layer that
 * compiles the fallback must use the same two numbers, or mobile gets the
 * cross-LOD wind mismatch the noise field exists to remove.
 */
export const GRASS_GUST_FRONT_SCALE = 0.085;
export const GRASS_GUST_FRONT_SPEED = 0.55;

/**
 * The second, non-parallel component of the compact gust.
 *
 * One sine travelling along the wind is periodic at exactly one wavelength and
 * constant along every line perpendicular to it, which is what produces the
 * broad synchronized stripes visible on the compact build. A second wave
 * crossing it at ninety degrees, with a different wavelength and speed, makes
 * the crests interfere: the field still rolls downwind, but no two rows bend
 * together for long. It costs one more `sin` in the vertex stage and no texture
 * fetch, which is the reason compact does not simply take the noise field.
 *
 * The weights sum to one, so the envelope stays inside [0, 1] exactly as the
 * single-sine version did — the reserved wind bounds are unchanged.
 */
export const GRASS_GUST_CROSS_SCALE = 0.037;
export const GRASS_GUST_CROSS_SPEED = 0.31;
export const GRASS_GUST_CROSS_PHASE = 1.7;
export const GRASS_GUST_PRIMARY_WEIGHT = 0.72;
export const GRASS_GUST_CROSS_WEIGHT = 0.28;

/**
 * Slow weather pulse shared by every grass layer. Calm stretches make travelling
 * gust fronts readable; a field that always moves at full amplitude never does.
 */
export const GRASS_WEATHER_CALM_FLOOR = 0.34;
export const GRASS_WEATHER_PULSE_SPEED = 0.073;
/** World cells per metre for tuft-scale wind phase. ~0.7 m so a 0.35 m clump
 * usually shares a cell instead of splitting across a lattice edge. */
export const GRASS_TUFT_WIND_CELL_SCALE = 1.45;

export function grassWeatherEnvelopeGlsl(time: string): string {
  return `mix(${GRASS_WEATHER_CALM_FLOOR.toFixed(2)}, 1.0, 0.5 + 0.5 * sin(${time} * ${GRASS_WEATHER_PULSE_SPEED.toFixed(3)}))`;
}

export function grassTuftWindPhaseGlsl(position: string): string {
  return `fract(dot(floor(${position} * ${GRASS_TUFT_WIND_CELL_SCALE.toFixed(2)}), vec2(0.1731, 0.4197)))`;
}

export interface GrassCompactGustGlslOptions {
  /** Name of the float the expression declares. */
  target: string;
  /** GLSL expression for the world-space XZ position of the instance root. */
  position: string;
  /** GLSL expression for the normalized wind direction (vec2). */
  windDirection: string;
  /** GLSL expression for the shared elapsed time. */
  time: string;
  /** GLSL expressions for the primary wave's scale and speed. */
  scale: string;
  speed: string;
}

/**
 * The compact gust, built once and used by every layer.
 *
 * Near, mid, and impostor materials must produce the *same* value at the same
 * world position, or a blade bends one way while the card that replaces it at
 * distance bends another — the cross-LOD wind mismatch the shared noise field
 * exists to prevent. Templating the expression from here is what keeps that
 * true when the formula changes; the three used to repeat it.
 */
export function grassCompactGustGlsl(
  options: GrassCompactGustGlslOptions,
): string {
  const { target, position, windDirection, time, scale, speed } = options;
  return `
float ${target} = 0.5 + 0.5 * (
  sin(
    dot(${position}, ${windDirection}) * ${scale} -
    ${time} * ${speed}
  ) * ${GRASS_GUST_PRIMARY_WEIGHT.toFixed(2)} +
  sin(
    dot(
      ${position},
      vec2(-${windDirection}.y, ${windDirection}.x)
    ) * ${GRASS_GUST_CROSS_SCALE.toFixed(3)} +
    ${time} * ${GRASS_GUST_CROSS_SPEED.toFixed(2)} +
    ${GRASS_GUST_CROSS_PHASE.toFixed(2)}
  ) * ${GRASS_GUST_CROSS_WEIGHT.toFixed(2)}
);
`;
}

const RESOLUTION = 128;
/** Lattice cells across the texture for the coarse octave. */
const COARSE_PERIOD = 4;
/** Deliberately not a multiple of the coarse period, so crests do not align. */
const FINE_PERIOD = 11;

function hashLattice(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function tileableValueNoise(
  x: number,
  z: number,
  period: number,
  seed: number,
): number {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const fractionX = x - cellX;
  const fractionZ = z - cellZ;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightZ = fractionZ * fractionZ * (3 - 2 * fractionZ);
  const x0 = ((cellX % period) + period) % period;
  const z0 = ((cellZ % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const z1 = (z0 + 1) % period;
  const corner00 = hashLattice(x0, z0, seed);
  const corner10 = hashLattice(x1, z0, seed);
  const corner01 = hashLattice(x0, z1, seed);
  const corner11 = hashLattice(x1, z1, seed);
  const lower = corner00 + (corner10 - corner00) * weightX;
  const upper = corner01 + (corner11 - corner01) * weightX;
  return lower + (upper - lower) * weightZ;
}

function encode(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

/**
 * R: broad gust crests. G: the same field at a higher frequency, available for
 * layers that want a finer secondary ripple without a second fetch.
 */
export function createGrassWindNoiseTexture(seed = 0x5f_35_6495): THREE.DataTexture {
  const data = new Uint8Array(RESOLUTION * RESOLUTION * 2);
  for (let row = 0; row < RESOLUTION; row += 1) {
    for (let column = 0; column < RESOLUTION; column += 1) {
      const u = (column / RESOLUTION) * COARSE_PERIOD;
      const v = (row / RESOLUTION) * COARSE_PERIOD;
      const coarse = tileableValueNoise(u, v, COARSE_PERIOD, seed);
      const fine = tileableValueNoise(
        (column / RESOLUTION) * FINE_PERIOD,
        (row / RESOLUTION) * FINE_PERIOD,
        FINE_PERIOD,
        seed ^ 0x9e3779b9,
      );
      const combined = (coarse + fine * 0.5) / 1.5;
      // Smoothstep-shaped contrast: crests stay broad and lulls stay flat,
      // instead of the field spending most of its time mid-way between the two.
      const shaped = combined * combined * (3 - 2 * combined);
      const offset = (row * RESOLUTION + column) * 2;
      data[offset] = encode(shaped);
      data[offset + 1] = encode(fine);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    RESOLUTION,
    RESOLUTION,
    THREE.RGFormat,
    THREE.UnsignedByteType,
  );
  texture.name = "grass-wind-noise";
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One texture for the whole app. Every grass material samples the same field
 * with the same scale and speed uniforms, which is what makes near blades, mid
 * blades, and far cards bend with one wind instead of three.
 */
let sharedTexture: THREE.DataTexture | undefined;

export function getGrassWindNoiseTexture(): THREE.DataTexture {
  if (!sharedTexture) {
    sharedTexture = createGrassWindNoiseTexture();
  }
  return sharedTexture;
}

export function disposeGrassWindNoiseTexture(): void {
  const texture = sharedTexture;
  sharedTexture = undefined;
  texture?.dispose();
}
