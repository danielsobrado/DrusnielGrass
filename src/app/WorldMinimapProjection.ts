/**
 * World ↔ minimap coordinate mapping.
 *
 * Kept pure and separate from the panel so the build can gate it. This is the
 * part of a click-to-travel map that fails silently: a flipped axis or an
 * off-by-one on the raster edge still produces a plausible-looking map and
 * still teleports somewhere, just not where the player pointed.
 *
 * Convention: the map is viewed from above with +X to the right and +Z down,
 * so a heading of 0 (which the character controller measures as +Z) points
 * down the screen.
 */

export interface WorldMinimapExtent {
  /** Full world span in metres; the world is centred on the origin. */
  readonly worldSize: number;
  /** Raster resolution in pixels per side. */
  readonly resolution: number;
}

export interface MinimapPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  z: number;
}

/**
 * Pixel centres, not pixel corners. Sampling at the corner biases the whole
 * raster half a cell north-west of the terrain it claims to show, which is
 * invisible on the image and lands every teleport slightly off.
 */
export function minimapCellToWorld(
  extent: WorldMinimapExtent,
  column: number,
  row: number,
  target: WorldPoint,
): WorldPoint {
  const metresPerCell = extent.worldSize / extent.resolution;
  const half = extent.worldSize * 0.5;
  target.x = -half + (column + 0.5) * metresPerCell;
  target.z = -half + (row + 0.5) * metresPerCell;
  return target;
}

/** World metres to normalized [0, 1] map space, clamped to the map. */
export function worldToMinimapUnit(
  extent: WorldMinimapExtent,
  x: number,
  z: number,
  target: MinimapPoint,
): MinimapPoint {
  const half = extent.worldSize * 0.5;
  target.x = clamp01((x + half) / extent.worldSize);
  target.y = clamp01((z + half) / extent.worldSize);
  return target;
}

/**
 * Normalized map space back to world metres. Inputs outside [0, 1] are clamped
 * so a click on the panel's border cannot teleport outside the world.
 */
export function minimapUnitToWorld(
  extent: WorldMinimapExtent,
  u: number,
  v: number,
  target: WorldPoint,
): WorldPoint {
  const half = extent.worldSize * 0.5;
  target.x = clamp01(u) * extent.worldSize - half;
  target.z = clamp01(v) * extent.worldSize - half;
  return target;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}
