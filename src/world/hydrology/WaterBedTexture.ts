import * as THREE from "three";
import {
  waterNoiseHash,
  waterNoiseWrap,
  waterPeriodicValueNoise,
} from "./WaterFlowNoiseTexture";

/**
 * 256 rather than 128: the tile covers ~2.6 m of bed, so at 128 a wading-depth
 * close-up magnified every texel roughly eightfold and the cobbles dissolved
 * into blur. Doubling keeps the same cobble count and world size — only the
 * silhouettes sharpen — for one extra build pass and 256 KB.
 */
export const WATER_BED_NOISE_SIZE = 256;
const BYTE_MAX = 255;
const PEBBLE_CELLS = 9;
const GRAVEL_CELLS = 19;
const PEBBLE_JITTER = 0.7;
const PEBBLE_INSET = 0.15;

/** Light baked into the map, so a cobble is lit the same however far away it is. */
const PEBBLE_LIGHT_X = -0.42;
const PEBBLE_LIGHT_Y = -0.38;
const PEBBLE_LIGHT_Z = 0.82;
/** Crevices between stones sit in their own shadow, so they read darker than any top. */
const CREVICE_SHADE = 0.3;

interface PebbleSample {
  distance: number;
  radius: number;
  tint: number;
  directionX: number;
  directionY: number;
}

function createPebbleSample(): PebbleSample {
  return { distance: 0, radius: 1, tint: 0, directionX: 0, directionY: 0 };
}

/**
 * Nearest-feature Worley, but keeping the distance instead of the cell edge:
 * a cobble is a dome falling away from its own centre, not a crack between two.
 * The per-cell tint travels with the winning point so one stone keeps one colour.
 */
function periodicWorleyPebble(
  x: number,
  y: number,
  cells: number,
  seed: number,
  target: PebbleSample,
): void {
  const scaledX = (x / WATER_BED_NOISE_SIZE) * cells;
  const scaledY = (y / WATER_BED_NOISE_SIZE) * cells;
  const baseX = Math.floor(scaledX);
  const baseY = Math.floor(scaledY);
  let nearest = Number.POSITIVE_INFINITY;
  let tint = 0;
  let radius = 1;
  let deltaNearestX = 0;
  let deltaNearestY = 0;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cellX = baseX + offsetX;
      const cellY = baseY + offsetY;
      const wrappedX = waterNoiseWrap(cellX, cells);
      const wrappedY = waterNoiseWrap(cellY, cells);
      const pointX =
        cellX +
        PEBBLE_INSET +
        waterNoiseHash(wrappedX, wrappedY, seed) * PEBBLE_JITTER;
      const pointY =
        cellY +
        PEBBLE_INSET +
        waterNoiseHash(wrappedX, wrappedY, seed + 23) * PEBBLE_JITTER;
      const deltaX = scaledX - pointX;
      const deltaY = scaledY - pointY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared < nearest) {
        nearest = distanceSquared;
        tint = waterNoiseHash(wrappedX, wrappedY, seed + 57);
        // Stones of one size read as printed dots; spread them instead.
        radius = THREE.MathUtils.lerp(
          0.4,
          0.78,
          waterNoiseHash(wrappedX, wrappedY, seed + 91),
        );
        deltaNearestX = deltaX;
        deltaNearestY = deltaY;
      }
    }
  }

  const distance = Math.sqrt(nearest);
  const inverse = distance > 1e-6 ? 1 / distance : 0;
  target.distance = distance;
  target.radius = radius;
  target.tint = tint;
  target.directionX = deltaNearestX * inverse;
  target.directionY = deltaNearestY * inverse;
}

/** Rounds a cobble off: solid near its centre, gone by the sand between stones. */
function pebbleDome(sample: PebbleSample): number {
  return (
    1 -
    THREE.MathUtils.smoothstep(
      sample.distance,
      sample.radius * 0.24,
      sample.radius,
    )
  );
}

/**
 * Lambert against the dome a cobble would have if it were a real half-buried
 * stone: flat on top, turning away towards its rim. Baking it keeps every stone
 * lit identically at any distance, which a screen-space derivative cannot.
 */
function pebbleShade(sample: PebbleSample): number {
  const slope = Math.min(1, sample.distance / Math.max(1e-6, sample.radius));
  const normalX = sample.directionX * slope;
  const normalY = sample.directionY * slope;
  const normalZ = Math.sqrt(Math.max(0, 1 - slope * slope));
  return THREE.MathUtils.clamp(
    normalX * PEBBLE_LIGHT_X + normalY * PEBBLE_LIGHT_Y + normalZ * PEBBLE_LIGHT_Z,
    0,
    1,
  );
}

export function sampleWaterBedPixel(
  x: number,
  y: number,
  seed: number,
  target: Float64Array,
): void {
  const wrappedX = waterNoiseWrap(x, WATER_BED_NOISE_SIZE);
  const wrappedY = waterNoiseWrap(y, WATER_BED_NOISE_SIZE);
  const cobble = createPebbleSample();
  const gravel = createPebbleSample();
  periodicWorleyPebble(wrappedX, wrappedY, PEBBLE_CELLS, seed + 61, cobble);
  periodicWorleyPebble(wrappedX, wrappedY, GRAVEL_CELLS, seed + 67, gravel);

  // Cobbles read first; gravel only fills the sand that the cobbles left bare.
  const cobbleHeight = pebbleDome(cobble);
  const gravelHeight = pebbleDome(gravel) * 0.62;
  const relief = Math.max(cobbleHeight, gravelHeight * (1 - cobbleHeight));
  const tint = THREE.MathUtils.lerp(gravel.tint, cobble.tint, cobbleHeight);
  // Gaps are shaded by the stones standing around them, not lit like open sand.
  const shade = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(CREVICE_SHADE, pebbleShade(gravel), gravelHeight),
    pebbleShade(cobble),
    cobbleHeight,
  );

  // Algae mats: broad patches gated so they clump rather than wash over the bed.
  const algaePatch =
    waterPeriodicValueNoise(wrappedX, wrappedY, 5, seed + 71, WATER_BED_NOISE_SIZE) *
      0.68 +
    waterPeriodicValueNoise(wrappedX, wrappedY, 13, seed + 73, WATER_BED_NOISE_SIZE) *
      0.32;
  const algaeStrand = waterPeriodicValueNoise(
    wrappedX,
    wrappedY,
    37,
    seed + 79,
    WATER_BED_NOISE_SIZE,
  );
  const algae = algaePatch * algaePatch * (0.62 + algaeStrand * 0.7) * 1.55;

  target[0] = THREE.MathUtils.clamp(relief, 0, 1);
  target[1] = THREE.MathUtils.clamp(tint, 0, 1);
  target[2] = THREE.MathUtils.clamp(algae, 0, 1);
  target[3] = THREE.MathUtils.clamp(shade, 0, 1);
}

/** One seamless RGBA map carrying pebble relief, stone tint, algae, and sand grain. */
export function createWaterBedTexture(seed: number): THREE.DataTexture {
  const data = new Uint8Array(WATER_BED_NOISE_SIZE * WATER_BED_NOISE_SIZE * 4);
  const channels = new Float64Array(4);
  for (let y = 0; y < WATER_BED_NOISE_SIZE; y += 1) {
    for (let x = 0; x < WATER_BED_NOISE_SIZE; x += 1) {
      sampleWaterBedPixel(x, y, seed, channels);
      const offset = (y * WATER_BED_NOISE_SIZE + x) * 4;
      data[offset] = Math.round(channels[0] * BYTE_MAX);
      data[offset + 1] = Math.round(channels[1] * BYTE_MAX);
      data[offset + 2] = Math.round(channels[2] * BYTE_MAX);
      data[offset + 3] = Math.round(channels[3] * BYTE_MAX);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WATER_BED_NOISE_SIZE,
    WATER_BED_NOISE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = "world-water-bed";
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
