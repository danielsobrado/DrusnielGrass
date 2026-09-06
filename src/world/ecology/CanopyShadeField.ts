import * as THREE from "three";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
import {
  ECOLOGY_CANOPY_CORE_RADIUS,
  ECOLOGY_CANOPY_CROWN_SHADE,
  ECOLOGY_CANOPY_SHADE_FEATHER,
  ECOLOGY_CANOPY_SHADOW_SHADE,
} from "./WorldEcologyTuning";

/**
 * One crown, as the shade field needs to see it.
 *
 * Deliberately not {@link WorldTreeInstance}: this layer must not know what a
 * tree is. It knows that something round stands at a height above a point and
 * blocks the sky, which is also true of a rock overhang, a wall, or anything
 * else a later pass wants to cast vegetation shade from.
 */
export interface CanopyShadeCrown {
  readonly x: number;
  readonly z: number;
  /** Crown radius in metres. */
  readonly radius: number;
  /** Height of the crown's centre above the ground under it, in metres. */
  readonly centerHeight: number;
}

/**
 * A deterministic lattice of crowns, queried one cell at a time.
 *
 * Cell-at-a-time rather than a radius query because the shade field caches by
 * cell: a radius query would re-walk the same crowns for every blade of grass
 * in a patch, and the walk is the expensive part.
 */
export interface CanopyShadeSource {
  /** Metres per lattice cell. The field derives its own margin from this. */
  readonly cellSize: number;
  sampleCanopyCell(cellX: number, cellZ: number): CanopyShadeCrown | undefined;
}

interface CanopyShadeFootprint {
  x: number;
  z: number;
  coreRadius: number;
  reach: number;
  reachSquared: number;
  depth: number;
}

const CACHE_LIMIT = 256;

const SUN = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();
/**
 * Ground offset from a crown's centre to the centre of its cast shadow, per
 * metre of crown height. The sun sits high enough that this stays a couple of
 * metres; a low sun would smear the lobe across the whole cell and the clamp
 * below is what stops a future sun angle from doing that.
 */
const SHADOW_OFFSET_X = -SUN.x / Math.max(SUN.y, 0.2);
const SHADOW_OFFSET_Z = -SUN.z / Math.max(SUN.y, 0.2);

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

function trimOldest<K, V>(cache: Map<K, V>, limit: number): void {
  if (cache.size < limit) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) cache.delete(oldestKey);
}

/**
 * How much of the sky a crown takes away at a point on the ground.
 *
 * This is the field the ecology was missing. Every other cause it models is a
 * property of the ground itself — its slope, its aspect, the water that reaches
 * it — so the world could produce a damp hollow but never a damp hollow
 * *because something stands over it*. Trees were placed and then ignored, which
 * is exactly the "props sitting on the world rather than in it" failure the
 * ecology layer exists to avoid.
 *
 * Deterministic and stateless in the way that matters: the cache is a speed
 * device over a pure function of position and seed, so a cold field and a warm
 * one must agree exactly, and every LOD sampling the same point gets the same
 * answer.
 */
export class CanopyShadeField {
  private readonly neighborhoods = new Map<number, CanopyShadeFootprint[]>();
  private readonly cellSize: number;
  private readonly marginCells: number;
  private readonly cellKeyStride: number;
  private readonly cellKeyOffset = 1 << 15;
  private readonly scratch: CanopyShadeFootprint[] = [];

  constructor(private readonly source: CanopyShadeSource) {
    this.cellSize = source.cellSize;
    if (!Number.isFinite(this.cellSize) || this.cellSize <= 0) {
      throw new Error("Canopy shade source must report a positive cell size.");
    }
    // One ring is enough while a crown's reach stays inside a cell, which the
    // lattice guarantees by being far coarser than any crown. Deriving the
    // margin rather than hard-coding 1 keeps that an assertion instead of an
    // assumption if either number moves.
    this.marginCells = 1;
    this.cellKeyStride = this.cellKeyOffset * 2 + 1;
  }

  /** Sky blocked at (x, z) by everything standing over it, in [0, 1]. */
  sample(x: number, z: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return 0;
    }
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);
    const footprints = this.getNeighborhood(cellX, cellZ);
    let shade = 0;

    for (const footprint of footprints) {
      const offsetX = x - footprint.x;
      const offsetZ = z - footprint.z;
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared >= footprint.reachSquared) continue;

      const cover =
        footprint.depth *
        (1 -
          smoothstep(
            Math.sqrt(distanceSquared),
            footprint.coreRadius,
            footprint.reach,
          ));
      // Union rather than sum: two crowns overlapping deepen the shade under
      // them without the total running past full cover, which is what a sum
      // would do and would clip flat across every grove.
      shade += (1 - shade) * cover;
      if (shade >= 0.999) return 1;
    }
    return shade;
  }

  clear(): void {
    this.neighborhoods.clear();
  }

  private getNeighborhood(
    cellX: number,
    cellZ: number,
  ): CanopyShadeFootprint[] {
    const key =
      (cellZ + this.cellKeyOffset) * this.cellKeyStride +
      (cellX + this.cellKeyOffset);
    const cached = this.neighborhoods.get(key);
    if (cached) {
      return cached;
    }

    this.scratch.length = 0;
    for (
      let offsetZ = -this.marginCells;
      offsetZ <= this.marginCells;
      offsetZ += 1
    ) {
      for (
        let offsetX = -this.marginCells;
        offsetX <= this.marginCells;
        offsetX += 1
      ) {
        const crown = this.source.sampleCanopyCell(
          cellX + offsetX,
          cellZ + offsetZ,
        );
        if (!crown) continue;
        this.addFootprints(crown);
      }
    }

    const footprints = this.scratch.slice();
    trimOldest(this.neighborhoods, CACHE_LIMIT);
    this.neighborhoods.set(key, footprints);
    return footprints;
  }

  private addFootprints(crown: CanopyShadeCrown): void {
    const radius = crown.radius;
    if (!(radius > 0)) {
      return;
    }
    const reach = radius + ECOLOGY_CANOPY_SHADE_FEATHER;
    this.scratch.push({
      x: crown.x,
      z: crown.z,
      coreRadius: radius * ECOLOGY_CANOPY_CORE_RADIUS,
      reach,
      reachSquared: reach * reach,
      depth: ECOLOGY_CANOPY_CROWN_SHADE,
    });

    // The cast lobe is capped to the cell so a low sun can never throw shade
    // into a neighbourhood this cache did not walk, which would make the field
    // disagree with itself across a cell boundary.
    const limit = this.cellSize * 0.5 - reach;
    if (limit <= 0) {
      return;
    }
    let shadowX = crown.centerHeight * SHADOW_OFFSET_X;
    let shadowZ = crown.centerHeight * SHADOW_OFFSET_Z;
    const offset = Math.hypot(shadowX, shadowZ);
    if (offset > limit) {
      const scale = limit / offset;
      shadowX *= scale;
      shadowZ *= scale;
    }
    this.scratch.push({
      x: crown.x + shadowX,
      z: crown.z + shadowZ,
      coreRadius: radius * ECOLOGY_CANOPY_CORE_RADIUS,
      reach,
      reachSquared: reach * reach,
      depth: ECOLOGY_CANOPY_SHADOW_SHADE,
    });
  }
}
