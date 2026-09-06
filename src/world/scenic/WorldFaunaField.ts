import * as THREE from "three";
import type { DeerVariant } from "../../creatures/deer/DeerGeometry";
import { createHydrologySample } from "../hydrology/HydrologyField";
import type { TerrainField } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import { MAX_FAUNA_STREAM_RADIUS } from "./FaunaConfigValidator";
import {
  HERD_CELL_SIZE,
  HERD_MAX_ROCKINESS,
  HERD_MAX_WATER_COVERAGE,
  HERD_MIN_FERTILITY,
  HERD_MIN_GRASS_MASK,
  HERD_MIN_NORMAL_Y,
  HERD_OCCUPANCY,
} from "./WorldScenicTuning";

const HERD_SEED_SALT = 0x5eed_fa11;
const HASH_UNIT = 1 / 4294967296;
const HERD_MEMBER_MIN_REACH = 2;
const HERD_MEMBER_REACH_VARIATION = 9;
const HERD_MEMBER_MAX_REACH = HERD_MEMBER_MIN_REACH + HERD_MEMBER_REACH_VARIATION;
const normal = new THREE.Vector3();
const hydrology = createHydrologySample();

/** One animal's place in a herd, resolved before anything is built. */
export interface WorldFaunaMember {
  readonly x: number;
  readonly z: number;
  readonly variant: DeerVariant;
  /** Coat picks, both in [0, 1). */
  readonly coatValue: number;
  readonly coatWarmth: number;
  /** Stable identity, so a recycled actor can seed its behaviour from it. */
  readonly seed: number;
}

export interface WorldFaunaHerd {
  readonly anchorX: number;
  readonly anchorZ: number;
  readonly members: readonly WorldFaunaMember[];
}

/**
 * Where herds are, as a pure function of the world seed.
 *
 * Same idea as the tree lattice: a cell either holds a herd or does not, and
 * that answer never changes, so walking away and coming back finds deer in the
 * same country rather than a fresh random scattering. The ecology filters are
 * the reason a herd is somewhere plausible — open, fertile, well watered ground
 * away from rock and standing water — without anyone hand-placing one.
 *
 * Cells are large and sparsely occupied because deer come in groups: this
 * decides where a *group* is, and the members spread out from there.
 */
export class WorldFaunaField {
  private readonly seed: number;
  private readonly maxCollectionRadius: number;
  private readonly herdAnchorHalfExtent: number;

  constructor(
    private readonly field: TerrainField,
    config: WorldConfig,
  ) {
    this.seed = (config.seed ^ HERD_SEED_SALT) >>> 0;
    const halfWorld = config.worldSize * 0.5;
    this.maxCollectionRadius = Math.min(halfWorld, MAX_FAUNA_STREAM_RADIUS);
    this.herdAnchorHalfExtent = Math.max(0, halfWorld - HERD_MEMBER_MAX_REACH);
  }

  collect(centerX: number, centerZ: number, radius: number): WorldFaunaHerd[] {
    if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
      return [];
    }
    const boundedRadius = Number.isFinite(radius)
      ? Math.min(Math.max(radius, 0), this.maxCollectionRadius)
      : this.maxCollectionRadius;
    const herds: WorldFaunaHerd[] = [];
    const minX = Math.floor((centerX - boundedRadius) / HERD_CELL_SIZE);
    const maxX = Math.floor((centerX + boundedRadius) / HERD_CELL_SIZE);
    const minZ = Math.floor((centerZ - boundedRadius) / HERD_CELL_SIZE);
    const maxZ = Math.floor((centerZ + boundedRadius) / HERD_CELL_SIZE);
    const radiusSquared = boundedRadius * boundedRadius;

    for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        const herd = this.sampleCell(cellX, cellZ);
        if (herd === undefined) {
          continue;
        }
        const dx = herd.anchorX - centerX;
        const dz = herd.anchorZ - centerZ;
        if (dx * dx + dz * dz > radiusSquared) {
          continue;
        }
        herds.push(herd);
      }
    }
    return herds;
  }

  private sampleCell(cellX: number, cellZ: number): WorldFaunaHerd | undefined {
    if (hash(cellX, cellZ, this.seed) * HASH_UNIT > HERD_OCCUPANCY) {
      return undefined;
    }
    const jitterX =
      (hash(cellX, cellZ, this.seed ^ 0x9e3779b9) * HASH_UNIT - 0.5) *
      HERD_CELL_SIZE *
      0.6;
    const jitterZ =
      (hash(cellX, cellZ, this.seed ^ 0x85ebca6b) * HASH_UNIT - 0.5) *
      HERD_CELL_SIZE *
      0.6;
    const anchorX = (cellX + 0.5) * HERD_CELL_SIZE + jitterX;
    const anchorZ = (cellZ + 0.5) * HERD_CELL_SIZE + jitterZ;
    if (
      Math.abs(anchorX) > this.herdAnchorHalfExtent ||
      Math.abs(anchorZ) > this.herdAnchorHalfExtent
    ) {
      return undefined;
    }

    const height = this.field.sampleHeight(anchorX, anchorZ);
    this.field.sampleNormal(anchorX, anchorZ, normal);
    if (normal.y < HERD_MIN_NORMAL_Y) {
      return undefined;
    }
    this.field.sampleHydrology(anchorX, anchorZ, height, hydrology);
    if (
      hydrology.waterCoverage > HERD_MAX_WATER_COVERAGE ||
      hydrology.grassMask < HERD_MIN_GRASS_MASK
    ) {
      return undefined;
    }
    const ecology = this.field.sampleEcologyAt(anchorX, anchorZ, height);
    if (
      ecology.fertility < HERD_MIN_FERTILITY ||
      ecology.rockiness > HERD_MAX_ROCKINESS
    ) {
      return undefined;
    }

    return {
      anchorX,
      anchorZ,
      members: this.buildRoster(cellX, cellZ, anchorX, anchorZ),
    };
  }

  /**
   * Who is in this herd.
   *
   * A stag is uncommon, does are the backbone, and fawns only appear where there
   * is a doe to belong to — which is enough structure that a herd reads as a
   * family group rather than as a spawn count.
   */
  private buildRoster(
    cellX: number,
    cellZ: number,
    anchorX: number,
    anchorZ: number,
  ): WorldFaunaMember[] {
    const members: WorldFaunaMember[] = [];
    const stagPick = hash(cellX, cellZ, this.seed ^ 0xc2b2ae35) * HASH_UNIT;
    const doeCount =
      1 +
      Math.floor(
        hash(cellX, cellZ, this.seed ^ 0x27d4eb2f) * HASH_UNIT * 3,
      );
    const fawnCount = Math.floor(
      hash(cellX, cellZ, this.seed ^ 0x165667b1) * HASH_UNIT * 2.4,
    );

    const push = (variant: DeerVariant, index: number): void => {
      const salt = this.seed ^ Math.imul(index + 1, 0x9e3779b9);
      const angle = hash(cellX, cellZ, salt) * HASH_UNIT * Math.PI * 2;
      const reach =
        HERD_MEMBER_MIN_REACH +
        hash(cellX, cellZ, salt ^ 0x1b873593) *
          HASH_UNIT *
          HERD_MEMBER_REACH_VARIATION;
      members.push({
        x: anchorX + Math.cos(angle) * reach,
        z: anchorZ + Math.sin(angle) * reach,
        variant,
        coatValue: hash(cellX, cellZ, salt ^ 0xcc9e2d51) * HASH_UNIT,
        coatWarmth: hash(cellX, cellZ, salt ^ 0xe6546b64) * HASH_UNIT,
        seed: hash(cellX, cellZ, salt ^ 0x2545f491),
      });
    };

    let index = 0;
    if (stagPick < 0.45) {
      push("stag", index);
      index += 1;
    }
    for (let doe = 0; doe < doeCount; doe += 1) {
      push("doe", index);
      index += 1;
    }
    for (let fawn = 0; fawn < fawnCount; fawn += 1) {
      push("fawn", index);
      index += 1;
    }
    return members;
  }
}

function hash(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}
