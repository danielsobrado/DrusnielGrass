export const MAX_NEAR_GRASS_TILE_RADIUS = 24;

export function resolveNearGrassTileRadius(
  visibilityRadius: number,
  tileSize: number,
): number {
  if (!Number.isFinite(visibilityRadius) || visibilityRadius <= 0) {
    throw new Error("Near-grass visibility radius must be a positive number.");
  }
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    throw new Error("Near-grass tile size must be a positive number.");
  }

  const tileRadius = Math.max(1, Math.ceil(visibilityRadius / tileSize));
  if (tileRadius > MAX_NEAR_GRASS_TILE_RADIUS) {
    throw new Error(
      `Near-grass visibility requires ${tileRadius} tile radii, above the ${MAX_NEAR_GRASS_TILE_RADIUS} safety ceiling.`,
    );
  }
  return tileRadius;
}
