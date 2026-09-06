/** Height of the ground at a world position, without river carving applied. */
export type TerrainHeightSampler = (x: number, z: number) => number;

export interface TerrainHorizonOptions {
  /** Azimuth bins around the camera. More bins resolve narrower ridges. */
  readonly sectorCount: number;
  /** Furthest ground distance that can act as an occluder, in metres. */
  readonly maxDistance: number;
  /** Spacing of ground samples along each azimuth ray, in metres. */
  readonly stepDistance: number;
  /** Nothing closer than this is ever rejected, in metres. */
  readonly minOccludeDistance: number;
  /**
   * Angular slack, in radians, subtracted from every rejection test.
   *
   * The profile is sampled, so a ridge between two rays is invisible to it.
   * This margin is what keeps that sampling error on the safe side.
   */
  readonly elevationMargin: number;
}

export const DEFAULT_TERRAIN_HORIZON_OPTIONS: TerrainHorizonOptions = {
  sectorCount: 128,
  maxDistance: 1200,
  stepDistance: 16,
  minOccludeDistance: 64,
  elevationMargin: 0.02,
};

/**
 * Rejects world content that lies behind terrain.
 *
 * A generic occlusion test has to rediscover from the framebuffer what this
 * world already knows: the terrain is generated, so its silhouette can be asked
 * for directly rather than reconstructed from depth. That avoids the usual costs
 * of occlusion queries — no readback, no latency, no dependence on draw order —
 * at the price of only modelling terrain as an occluder, which in this world is
 * the occluder that matters.
 *
 * The profile is one elevation angle per azimuth bin: march the ground outward
 * from the camera, and remember the highest angle any ground sample subtended,
 * along with how far away that sample was. A candidate is hidden when its whole
 * angular extent sits below that horizon *and* the ridge responsible is nearer
 * than the candidate.
 *
 * Every approximation is deliberately biased toward drawing. Sampling can miss a
 * thin ridge, so `elevationMargin` lowers the bar; a candidate spanning several
 * bins is tested against the most permissive of them; anything nearer than
 * `minOccludeDistance` is never rejected. A frame with something wrongly drawn
 * costs performance, one with something wrongly culled is a visible hole.
 */
export class TerrainHorizonCuller {
  private readonly options: TerrainHorizonOptions;
  private readonly horizonAngle: Float32Array;
  private readonly horizonDistance: Float32Array;
  private cameraX = 0;
  private cameraY = 0;
  private cameraZ = 0;
  private built = false;

  constructor(options: TerrainHorizonOptions = DEFAULT_TERRAIN_HORIZON_OPTIONS) {
    this.options = options;
    this.horizonAngle = new Float32Array(options.sectorCount);
    this.horizonDistance = new Float32Array(options.sectorCount);
  }

  /** True once a profile exists; queries before this never reject. */
  isReady(): boolean {
    return this.built;
  }

  /**
   * Rebuilds the horizon profile around a camera position.
   *
   * Cost is `sectorCount * (maxDistance / stepDistance)` height samples, so this
   * is meant to run when the camera has actually moved, not every frame.
   */
  build(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    sampleHeight: TerrainHeightSampler,
  ): void {
    if (
      !Number.isFinite(cameraX) ||
      !Number.isFinite(cameraY) ||
      !Number.isFinite(cameraZ)
    ) {
      this.built = false;
      return;
    }
    this.cameraX = cameraX;
    this.cameraY = cameraY;
    this.cameraZ = cameraZ;

    const { sectorCount, maxDistance, stepDistance } = this.options;
    const sectorArc = (Math.PI * 2) / sectorCount;

    for (let sector = 0; sector < sectorCount; sector += 1) {
      // Sample down the middle of the bin; the margin covers the rest of it.
      const azimuth = (sector + 0.5) * sectorArc;
      const dirX = Math.cos(azimuth);
      const dirZ = Math.sin(azimuth);
      let bestAngle = -Math.PI / 2;
      let bestDistance = 0;

      for (
        let distance = stepDistance;
        distance <= maxDistance;
        distance += stepDistance
      ) {
        const height = sampleHeight(
          cameraX + dirX * distance,
          cameraZ + dirZ * distance,
        );
        if (!Number.isFinite(height)) {
          continue;
        }
        const angle = Math.atan2(height - cameraY, distance);
        if (angle > bestAngle) {
          bestAngle = angle;
          bestDistance = distance;
        }
      }

      this.horizonAngle[sector] = bestAngle;
      this.horizonDistance[sector] = bestDistance;
    }
    this.built = true;
  }

  /**
   * True when a bounding sphere is certainly hidden behind terrain.
   *
   * `topY` is the sphere's highest point, which is what has to clear the ridge —
   * testing the centre would cull tall things whose crowns are still in view.
   */
  isOccluded(x: number, y: number, z: number, radius: number): boolean {
    if (!this.built) {
      return false;
    }
    const dx = x - this.cameraX;
    const dz = z - this.cameraZ;
    const distance = Math.hypot(dx, dz);
    if (
      !Number.isFinite(distance) ||
      distance <= this.options.minOccludeDistance ||
      distance <= radius
    ) {
      return false;
    }

    const { sectorCount } = this.options;
    const sectorArc = (Math.PI * 2) / sectorCount;
    // Nearest approach and highest point: the most generous view of the target.
    const nearDistance = distance - radius;
    const topAngle = Math.atan2(y + radius - this.cameraY, nearDistance);

    let azimuth = Math.atan2(dz, dx);
    if (azimuth < 0) {
      azimuth += Math.PI * 2;
    }
    // Angular half-width, so a wide object is judged across every bin it covers.
    const halfWidth = Math.asin(Math.min(1, radius / distance));
    const firstSector = Math.floor((azimuth - halfWidth) / sectorArc);
    const lastSector = Math.floor((azimuth + halfWidth) / sectorArc);

    for (let sector = firstSector; sector <= lastSector; sector += 1) {
      const index = ((sector % sectorCount) + sectorCount) % sectorCount;
      const ridgeDistance = this.horizonDistance[index];
      // A ridge beyond the target cannot hide it.
      if (ridgeDistance <= 0 || ridgeDistance >= nearDistance) {
        return false;
      }
      if (topAngle + this.options.elevationMargin >= this.horizonAngle[index]) {
        return false;
      }
    }
    return true;
  }
}
