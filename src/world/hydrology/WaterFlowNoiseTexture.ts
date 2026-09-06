import * as THREE from "three";

export const WATER_FLOW_NOISE_SIZE = 128;
const BYTE_MAX = 255;

/** Shared periodic-noise basis: every water map is built from these three. */
export function waterNoiseHash(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function waterNoiseWrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function waterPeriodicValueNoise(
  x: number,
  y: number,
  cells: number,
  seed: number,
  size: number = WATER_FLOW_NOISE_SIZE,
): number {
  const scaledX = (x / size) * cells;
  const scaledY = (y / size) * cells;
  const cellX = Math.floor(scaledX);
  const cellY = Math.floor(scaledY);
  const fractionX = scaledX - cellX;
  const fractionY = scaledY - cellY;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightY = fractionY * fractionY * (3 - 2 * fractionY);
  const nextX = cellX + 1 === cells ? 0 : cellX + 1;
  const nextY = cellY + 1 === cells ? 0 : cellY + 1;
  const lower = THREE.MathUtils.lerp(
    waterNoiseHash(cellX, cellY, seed),
    waterNoiseHash(nextX, cellY, seed),
    weightX,
  );
  const upper = THREE.MathUtils.lerp(
    waterNoiseHash(cellX, nextY, seed),
    waterNoiseHash(nextX, nextY, seed),
    weightX,
  );
  return THREE.MathUtils.lerp(lower, upper, weightY);
}

function periodicWorleyRidge(
  x: number,
  y: number,
  cells: number,
  seed: number,
): number {
  const scaledX = (x / WATER_FLOW_NOISE_SIZE) * cells;
  const scaledY = (y / WATER_FLOW_NOISE_SIZE) * cells;
  const baseX = Math.floor(scaledX);
  const baseY = Math.floor(scaledY);
  let nearest = Number.POSITIVE_INFINITY;
  let secondNearest = Number.POSITIVE_INFINITY;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cellX = baseX + offsetX;
      const cellY = baseY + offsetY;
      const wrappedX = waterNoiseWrap(cellX, cells);
      const wrappedY = waterNoiseWrap(cellY, cells);
      const pointX = cellX + 0.12 + waterNoiseHash(wrappedX, wrappedY, seed) * 0.76;
      const pointY =
        cellY + 0.12 + waterNoiseHash(wrappedX, wrappedY, seed + 19) * 0.76;
      const deltaX = pointX - scaledX;
      const deltaY = pointY - scaledY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared < nearest) {
        secondNearest = nearest;
        nearest = distanceSquared;
      } else if (distanceSquared < secondNearest) {
        secondNearest = distanceSquared;
      }
    }
  }

  const edgeDistance = Math.sqrt(secondNearest) - Math.sqrt(nearest);
  return 1 - THREE.MathUtils.smoothstep(edgeDistance, 0.035, 0.34);
}

export function sampleWaterFlowNoisePixel(
  x: number,
  y: number,
  seed: number,
  target: Float64Array,
): void {
  const wrappedX = waterNoiseWrap(x, WATER_FLOW_NOISE_SIZE);
  const wrappedY = waterNoiseWrap(y, WATER_FLOW_NOISE_SIZE);
  const broad =
    waterPeriodicValueNoise(wrappedX, wrappedY, 4, seed + 11) * 0.7 +
    waterPeriodicValueNoise(wrappedX, wrappedY, 9, seed + 17) * 0.3;
  const turbulence =
    waterPeriodicValueNoise(wrappedX, wrappedY, 17, seed + 23) * 0.64 +
    waterPeriodicValueNoise(wrappedX, wrappedY, 31, seed + 29) * 0.36;
  const caustic =
    periodicWorleyRidge(wrappedX, wrappedY, 11, seed + 37) * 0.72 +
    periodicWorleyRidge(wrappedX, wrappedY, 23, seed + 41) * 0.28;
  const glint =
    waterPeriodicValueNoise(wrappedX, wrappedY, 43, seed + 47) * 0.52 +
    waterNoiseHash(wrappedX, wrappedY, seed + 53) * 0.48;

  target[0] = THREE.MathUtils.clamp(broad, 0, 1);
  target[1] = THREE.MathUtils.clamp(turbulence, 0, 1);
  target[2] = THREE.MathUtils.clamp(caustic, 0, 1);
  target[3] = THREE.MathUtils.clamp(glint, 0, 1);
}

/** One seamless RGBA texture carrying broad warp, turbulence, caustics, and glints. */
export function createWaterFlowNoiseTexture(seed: number): THREE.DataTexture {
  const data = new Uint8Array(
    WATER_FLOW_NOISE_SIZE * WATER_FLOW_NOISE_SIZE * 4,
  );
  const channels = new Float64Array(4);
  for (let y = 0; y < WATER_FLOW_NOISE_SIZE; y += 1) {
    for (let x = 0; x < WATER_FLOW_NOISE_SIZE; x += 1) {
      sampleWaterFlowNoisePixel(x, y, seed, channels);
      const offset = (y * WATER_FLOW_NOISE_SIZE + x) * 4;
      data[offset] = Math.round(channels[0] * BYTE_MAX);
      data[offset + 1] = Math.round(channels[1] * BYTE_MAX);
      data[offset + 2] = Math.round(channels[2] * BYTE_MAX);
      data[offset + 3] = Math.round(channels[3] * BYTE_MAX);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WATER_FLOW_NOISE_SIZE,
    WATER_FLOW_NOISE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = "world-water-flow-noise";
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
