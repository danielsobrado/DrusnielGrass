import * as THREE from "three";
import type { GrassNearMaterial } from "../../grass/materials/GrassNearMaterial";
import { resolveNearGrassTileRadius } from "./NearGrassStreamingLimits";
import {
  WorldSingleBladeTileFactory,
  type WorldSingleBladeTile,
  type WorldSingleBladeTileBuildJob,
} from "./WorldSingleBladeTileFactory";

export interface WorldSingleBladeTileFieldOptions {
  namePrefix: string;
  visibilityRadius: number;
  worldHalfExtent: number;
  densityMultiplier: number;
  bladeSegments: number;
  receiveShadows: boolean;
  seedSalt: number;
  material: GrassNearMaterial;
  tilesPerFrame: number;
  reconcileEveryFrame: boolean;
  /** Reuse placement data produced by a wider complementary field. */
  cachedPlacementOnly?: boolean;
  /** Near-fade midpoint and half-width this field's material culls against. */
  lodNearDistance: number;
  lodTransitionDistance: number;
  /**
   * Optional distance inside which this layer is guaranteed to have zero
   * coverage. Tiles whose complete conservative bound fits inside it can skip
   * submission instead of relying on the vertex shader to reject every blade.
   */
  lodInnerCullDistance?: number;
  /**
   * Inside this distance the material's detail-mode test can keep blades the
   * plain near-coverage prefix would exclude, so the draw is never truncated
   * there. Zero for fields whose keep set is a prefix at every distance.
   */
  lodGuardDistance: number;
}

interface TileRequest {
  key: number;
  tileX: number;
  tileZ: number;
  distance: number;
}

/** Below this the tile residency set provably cannot change. */
const RECONCILE_MOVEMENT_EPSILON = 0.25;
/**
 * How far the focus may drift before instance counts are recomputed. The fade
 * used to derive a count is pulled this much nearer to compensate, so a count
 * held across the gap is never short of what the shader keeps — only, at worst,
 * a fraction of a percent longer than it needs to be.
 */
const COUNT_MOVEMENT_EPSILON = 0.25;
/**
 * The CPU reproduces the shader's dither in float64 and stores it as float32,
 * so the two can disagree in the last bit. Widening the kept prefix by this much
 * keeps the truncation strictly conservative; it costs about 0.1% of a tile.
 */
const DITHER_SAFETY_MARGIN = 1 / 1024;
/** Avoid retaining a fully populated near field throughout a long aerial view. */
const DISABLED_TILE_EVICTION_MS = 12_000;
const EVICTION_HYSTERESIS_TILES = 0.75;

/** Matches the GLSL `smoothstep(edge0, edge1, x)` the vertex shader uses. */
function smoothstep(value: number, edge0: number, edge1: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Index of the first entry greater than `value` in an ascending array. */
function upperBound(values: Float32Array, value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Cantor-pairs two zig-zag encoded integers into one allocation-free key.
 * Unlike fixed-width bit packing, this stays collision-free when a configured
 * world crosses an arbitrary signed-coordinate boundary.
 */
function tileKey(tileX: number, tileZ: number): number {
  const x = tileX >= 0 ? tileX * 2 : -tileX * 2 - 1;
  const z = tileZ >= 0 ? tileZ * 2 : -tileZ * 2 - 1;
  const sum = x + z;
  return (sum * (sum + 1)) / 2 + z;
}

export class WorldSingleBladeTileField {
  private readonly tiles = new Map<number, WorldSingleBladeTile>();
  /** Desired tiles known to contain no blades for this immutable field setup. */
  private readonly emptyTiles = new Set<number>();
  private readonly desired = new Set<number>();
  private readonly queue: TileRequest[] = [];
  private readonly requests: TileRequest[] = [];
  private readonly reconciledFocus = new THREE.Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  private readonly countedFocus = new THREE.Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  private readonly innerCullCenter = new THREE.Vector3();
  /** Set whenever the tile set or the fade changes under a stationary focus. */
  private countsDirty = true;
  private activeBuild?: WorldSingleBladeTileBuildJob;
  private enabled = true;
  private disabledAt = 0;
  private centerTileX = Number.NaN;
  private centerTileZ = Number.NaN;
  private visibilityRadius: number;
  private lodNearDistance: number;
  private lodTransitionDistance: number;
  private lodInnerCullDistance: number;
  private lastBuildMs = 0;
  private maxBuildMs = 0;
  private densityScale = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly factory: WorldSingleBladeTileFactory,
    private readonly tileSize: number,
    private readonly options: Readonly<WorldSingleBladeTileFieldOptions>,
  ) {
    resolveNearGrassTileRadius(options.visibilityRadius, tileSize);
    this.visibilityRadius = options.visibilityRadius;
    this.lodNearDistance = options.lodNearDistance;
    this.lodTransitionDistance = options.lodTransitionDistance;
    this.lodInnerCullDistance = Math.max(0, options.lodInnerCullDistance ?? 0);
  }

  /** Art directions with a shorter near fade need fewer resident tiles. */
  setVisibilityRadius(radius: number): void {
    if (radius === this.visibilityRadius) {
      return;
    }
    resolveNearGrassTileRadius(radius, this.tileSize);
    this.visibilityRadius = radius;
    this.centerTileX = Number.NaN;
    this.centerTileZ = Number.NaN;
    this.countsDirty = true;
  }

  /** Must track whatever `configureLod` was given for this field's material. */
  setLodFade(nearDistance: number, transitionDistance: number): void {
    this.lodNearDistance = nearDistance;
    this.lodTransitionDistance = transitionDistance;
    this.countsDirty = true;
  }

  setInnerCullDistance(distance: number): void {
    const resolved = Math.max(0, distance);
    if (resolved !== this.lodInnerCullDistance) {
      this.lodInnerCullDistance = resolved;
      this.countsDirty = true;
    }
  }

  setDensityScale(scale: number): void {
    const resolved = THREE.MathUtils.clamp(scale, 0.05, 1);
    if (resolved !== this.densityScale) {
      this.densityScale = resolved;
      this.countsDirty = true;
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) {
      if (
        !enabled &&
        this.tiles.size > 0 &&
        performance.now() - this.disabledAt >= DISABLED_TILE_EVICTION_MS
      ) {
        this.evictTiles();
      }
      return;
    }
    this.enabled = enabled;
    this.queue.length = 0;
    if (this.activeBuild) {
      this.factory.cancelBuild(this.activeBuild);
      this.activeBuild = undefined;
    }
    this.countsDirty = true;
    for (const tile of this.tiles.values()) {
      tile.mesh.visible = enabled && tile.mesh.count > 0;
    }
    if (enabled) {
      this.disabledAt = 0;
      this.centerTileX = Number.NaN;
      this.centerTileZ = Number.NaN;
    } else {
      this.disabledAt = performance.now();
    }
  }

  update(
    focus: THREE.Vector3,
    buildDeadline = Number.POSITIVE_INFINITY,
  ): void {
    if (
      !this.enabled ||
      !Number.isFinite(focus.x) ||
      !Number.isFinite(focus.z)
    ) {
      return;
    }
    const tileX = Math.floor(focus.x / this.tileSize);
    const tileZ = Math.floor(focus.z / this.tileSize);
    const tileChanged =
      tileX !== this.centerTileX || tileZ !== this.centerTileZ;

    if (tileChanged) {
      this.centerTileX = tileX;
      this.centerTileZ = tileZ;
    }
    // Reconciling every frame is what keeps the outer near-fade ring complete
    // while moving inside a tile, but it allocates and scans ~140 cells each
    // time. The residency test only depends on the focus position, so a focus
    // that has barely moved cannot change the answer.
    const focusMoved =
      focus.distanceToSquared(this.reconciledFocus) >
      RECONCILE_MOVEMENT_EPSILON * RECONCILE_MOVEMENT_EPSILON;
    if (tileChanged || (this.options.reconcileEveryFrame && focusMoved)) {
      this.reconciledFocus.copy(focus);
      this.reconcile(focus);
    }

    this.processQueue(buildDeadline);

    // Counts only depend on the focus distance and the fade, and the fade is
    // widened below by exactly the distance the focus is allowed to drift, so a
    // stale count can only ever be too generous. Skipping the walk over every
    // resident tile while standing still is therefore free of visible effect.
    if (
      this.countsDirty ||
      focus.distanceToSquared(this.countedFocus) >
        COUNT_MOVEMENT_EPSILON * COUNT_MOVEMENT_EPSILON
    ) {
      this.countedFocus.copy(focus);
      this.countsDirty = false;
      this.updateInstanceCounts(focus);
    }
  }

  /**
   * Trims each tile's draw to the blades that can actually survive the vertex
   * shader's LOD cull.
   *
   * Instances are sorted by dither at build time and the shader keeps a blade
   * when `dither <= coverage`, so the survivors are a prefix of the buffer.
   * Coverage is evaluated at the tile's nearest point — the maximum over the
   * whole tile — so the cut is conservative: it can only ever include blades the
   * shader would have dropped, never exclude one it would have kept.
   */
  private updateInstanceCounts(focus: THREE.Vector3): void {
    const guardDistance = this.options.lodGuardDistance;
    const fadeStart = this.lodNearDistance - this.lodTransitionDistance;
    const fadeEnd = this.lodNearDistance + this.lodTransitionDistance;
    for (const tile of this.tiles.values()) {
      if (this.isInsideInnerCull(focus, tile)) {
        tile.mesh.count = 0;
        tile.mesh.visible = false;
        continue;
      }

      // Charge the tile as if the focus had already closed the full drift this
      // count is allowed to survive, so approaching between recomputes can
      // never leave the draw short.
      const distance =
        this.distanceToTile(
          focus.x,
          focus.z,
          tile.tileX * this.tileSize,
          tile.tileZ * this.tileSize,
        ) - COUNT_MOVEMENT_EPSILON;
      let count: number;
      if (distance < guardDistance) {
        count = tile.bladeCount;
      } else if (distance <= fadeStart) {
        count = upperBound(
          tile.sortedDithers,
          this.densityScale + DITHER_SAFETY_MARGIN,
        );
      } else if (distance >= fadeEnd) {
        count = 0;
      } else {
        const coverage = 1 - smoothstep(distance, fadeStart, fadeEnd);
        count = upperBound(
          tile.sortedDithers,
          coverage * this.densityScale + DITHER_SAFETY_MARGIN,
        );
      }
      tile.mesh.count = count;
      tile.mesh.visible = count > 0;
    }
  }

  getBladeCount(): number {
    let count = 0;
    for (const tile of this.tiles.values()) {
      count += tile.bladeCount;
    }
    return count;
  }

  getTileCount(): number {
    return this.tiles.size;
  }

  getLastBuildMs(): number {
    return this.lastBuildMs;
  }

  getMaxBuildMs(): number {
    return this.maxBuildMs;
  }

  dispose(): void {
    if (this.activeBuild) {
      this.factory.cancelBuild(this.activeBuild);
      this.activeBuild = undefined;
    }
    this.evictTiles();
    this.desired.clear();
    this.emptyTiles.clear();
    this.queue.length = 0;
  }

  private reconcile(focus: THREE.Vector3): void {
    const offset = resolveNearGrassTileRadius(
      this.visibilityRadius,
      this.tileSize,
    );
    const requests = this.requests;
    requests.length = 0;
    this.desired.clear();

    for (let dz = -offset; dz <= offset; dz += 1) {
      for (let dx = -offset; dx <= offset; dx += 1) {
        const tileX = this.centerTileX + dx;
        const tileZ = this.centerTileZ + dz;
        const originX = tileX * this.tileSize;
        const originZ = tileZ * this.tileSize;
        if (
          originX < -this.options.worldHalfExtent ||
          originZ < -this.options.worldHalfExtent ||
          originX + this.tileSize > this.options.worldHalfExtent ||
          originZ + this.tileSize > this.options.worldHalfExtent
        ) {
          continue;
        }
        const distance = this.distanceToTile(
          focus.x,
          focus.z,
          originX,
          originZ,
        );
        if (distance > this.visibilityRadius) {
          continue;
        }

        const key = tileKey(tileX, tileZ);
        this.desired.add(key);
        if (
          !this.tiles.has(key) &&
          !this.emptyTiles.has(key) &&
          this.activeBuild?.options.key !== key
        ) {
          requests.push({ key, tileX, tileZ, distance });
        }
      }
    }

    for (const [key, tile] of this.tiles) {
      if (this.desired.has(key)) {
        continue;
      }
      const distance = this.distanceToTile(
        focus.x,
        focus.z,
        tile.tileX * this.tileSize,
        tile.tileZ * this.tileSize,
      );
      if (
        distance <=
        this.visibilityRadius + this.tileSize * EVICTION_HYSTERESIS_TILES
      ) {
        continue;
      }
      this.scene.remove(tile.mesh);
      this.factory.disposeTile(tile);
      this.tiles.delete(key);
      this.countsDirty = true;
    }
    for (const key of this.emptyTiles) {
      if (!this.desired.has(key)) {
        this.emptyTiles.delete(key);
      }
    }

    if (
      this.activeBuild &&
      !this.desired.has(this.activeBuild.options.key)
    ) {
      this.factory.cancelBuild(this.activeBuild);
      this.activeBuild = undefined;
    }

    requests.sort((left, right) => left.distance - right.distance);
    // Copy rather than spread: `push(...requests)` passes every request as a
    // separate argument, which this runs on every frame.
    this.queue.length = 0;
    for (const request of requests) {
      this.queue.push(request);
    }
  }

  private processQueue(buildDeadline: number): void {
    let built = 0;
    const hasWork = this.activeBuild !== undefined || this.queue.length > 0;
    const startedAt = hasWork ? performance.now() : 0;
    while (
      built < this.options.tilesPerFrame &&
      performance.now() < buildDeadline
    ) {
      while (!this.activeBuild && this.queue.length > 0) {
        const request = this.queue.shift();
        if (
          !request ||
          !this.desired.has(request.key) ||
          this.tiles.has(request.key)
        ) {
          continue;
        }
        const job = this.factory.beginBuild(
          {
            key: request.key,
            tileX: request.tileX,
            tileZ: request.tileZ,
            densityMultiplier: this.options.densityMultiplier,
            bladeSegments: this.options.bladeSegments,
            receiveShadows: this.options.receiveShadows,
            seedSalt: this.options.seedSalt,
            namePrefix: this.options.namePrefix,
            material: this.options.material,
          },
          this.options.cachedPlacementOnly === true,
        );
        if (job === null) {
          this.emptyTiles.add(request.key);
          built += 1;
          break;
        }
        if (!job) {
          // The complementary wide field has not produced this placement yet.
          // Preserve the request and let the other fields spend this deadline.
          this.queue.push(request);
          break;
        }
        this.activeBuild = job;
      }

      const job = this.activeBuild;
      if (!job) {
        break;
      }
      if (!this.desired.has(job.options.key)) {
        this.factory.cancelBuild(job);
        this.activeBuild = undefined;
        continue;
      }

      const result = this.factory.advanceBuild(job, buildDeadline);
      if (!result.complete) {
        break;
      }
      this.activeBuild = undefined;
      const tile = result.tile;
      if (result.empty && this.desired.has(job.options.key)) {
        this.emptyTiles.add(job.options.key);
      }
      if (tile && this.desired.has(tile.key) && !this.tiles.has(tile.key)) {
        this.tiles.set(tile.key, tile);
        this.scene.add(tile.mesh);
        // A new tile starts at whatever count the mesh was built with.
        this.countsDirty = true;
      } else if (tile) {
        this.factory.disposeTile(tile);
      }
      built += 1;
    }

    if (hasWork) {
      this.lastBuildMs = performance.now() - startedAt;
      this.maxBuildMs = Math.max(this.maxBuildMs, this.lastBuildMs);
    } else {
      this.lastBuildMs = 0;
    }
  }

  private evictTiles(): void {
    for (const tile of this.tiles.values()) {
      this.scene.remove(tile.mesh);
      this.factory.disposeTile(tile);
    }
    this.tiles.clear();
    this.emptyTiles.clear();
    this.desired.clear();
    this.centerTileX = Number.NaN;
    this.centerTileZ = Number.NaN;
    this.countsDirty = true;
  }

  private isInsideInnerCull(
    focus: THREE.Vector3,
    tile: WorldSingleBladeTile,
  ): boolean {
    const sphere = tile.mesh.boundingSphere;
    if (this.lodInnerCullDistance <= 0 || !sphere) {
      return false;
    }
    this.innerCullCenter.copy(sphere.center).add(tile.mesh.position);
    return (
      focus.distanceTo(this.innerCullCenter) +
        sphere.radius +
        COUNT_MOVEMENT_EPSILON <=
      this.lodInnerCullDistance
    );
  }

  private distanceToTile(
    x: number,
    z: number,
    originX: number,
    originZ: number,
  ): number {
    const distanceX = Math.max(
      originX - x,
      0,
      x - (originX + this.tileSize),
    );
    const distanceZ = Math.max(
      originZ - z,
      0,
      z - (originZ + this.tileSize),
    );
    return Math.hypot(distanceX, distanceZ);
  }
}
