export const GRASS_CLUMP_CELLS = 3;
export const GRASS_CLUMP_CENTER_JITTER = 0.15;
export const GRASS_CLUMP_CENTER_X_SALT = 0x1f;
export const GRASS_CLUMP_CENTER_Z_SALT = 0x2b;

const CLUMP_HASH_X = 374761393;
const CLUMP_HASH_Z = 668265263;
const CLUMP_HASH_MIX = 1274126177;
const UINT32_RANGE = 4294967296;

export interface GrassPlacementGrid {
  requestedCount: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellDepth: number;
  clumpSpanX: number;
  clumpSpanZ: number;
}

/** Resolves the exact candidate grid used by the single-blade placement pass. */
export function resolveGrassPlacementGrid(
  tileSize: number,
  bladesPerSquareMeter: number,
  densityMultiplier: number,
): GrassPlacementGrid {
  const requestedCount = Math.max(
    1,
    Math.round(
      tileSize * tileSize * bladesPerSquareMeter * densityMultiplier,
    ),
  );
  const columns = Math.ceil(Math.sqrt(requestedCount));
  const rows = Math.ceil(requestedCount / columns);
  const cellWidth = tileSize / columns;
  const cellDepth = tileSize / rows;
  return {
    requestedCount,
    columns,
    rows,
    cellWidth,
    cellDepth,
    clumpSpanX: cellWidth * GRASS_CLUMP_CELLS,
    clumpSpanZ: cellDepth * GRASS_CLUMP_CELLS,
  };
}

export function hashGrassClump(
  x: number,
  z: number,
  seed: number,
): number {
  let value = Math.imul(x, CLUMP_HASH_X) + Math.imul(z, CLUMP_HASH_Z) + seed;
  value = Math.imul(value ^ (value >>> 13), CLUMP_HASH_MIX);
  return (value ^ (value >>> 16)) >>> 0;
}

export function sampleGrassClumpValue(
  x: number,
  z: number,
  seed: number,
  salt: number,
): number {
  return hashGrassClump(x, z, (seed ^ salt) >>> 0) / UINT32_RANGE;
}

/** GLSL mirror of the CPU clump identity and centre jitter. */
export const GRASS_CLUMP_LATTICE_GLSL = `
#ifndef GRASS_CLUMP_LATTICE
#define GRASS_CLUMP_LATTICE
uint grassClumpHash(int x, int z, uint seed) {
  uint value =
    uint(x) * ${CLUMP_HASH_X}u + uint(z) * ${CLUMP_HASH_Z}u + seed;
  value = (value ^ (value >> 13u)) * ${CLUMP_HASH_MIX}u;
  return value ^ (value >> 16u);
}

float grassClumpValue(int x, int z, uint seed, uint salt) {
  return float(grassClumpHash(x, z, seed ^ salt)) / ${UINT32_RANGE.toFixed(1)};
}

vec2 grassClumpCenter(vec2 clumpUv, uint seed) {
  ivec2 cell = ivec2(floor(clumpUv));
  return vec2(cell) + vec2(
    0.5 +
      (grassClumpValue(cell.x, cell.y, seed, ${GRASS_CLUMP_CENTER_X_SALT}u) - 0.5) *
        ${(GRASS_CLUMP_CENTER_JITTER * 2).toFixed(2)},
    0.5 +
      (grassClumpValue(cell.x, cell.y, seed, ${GRASS_CLUMP_CENTER_Z_SALT}u) - 0.5) *
        ${(GRASS_CLUMP_CENTER_JITTER * 2).toFixed(2)}
  );
}
#endif
`;
