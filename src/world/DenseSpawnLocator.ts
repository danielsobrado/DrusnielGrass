import * as THREE from "three";
import { CHARACTER_SPAWN_CLEARANCE_RADIUS_SCALE } from "./SpawnTuning";
import { StoneClearanceCache } from "./stones/StoneClearanceCache";
import { StoneField } from "./stones/StoneField";
import type { WorldConfig } from "./WorldConfig";
import type { TerrainField } from "./TerrainField";

const HEADING_SAMPLE_COUNT = 8;
const COARSE_STEP_MULTIPLIER = 4;
const REFINE_CANDIDATE_COUNT = 8;
const CLEAR_SPAWN_SEARCH_RADIUS_STEPS = 2;
const CLEAR_SPAWN_STEP_SCALE = 0.5;
const AREA_SAMPLE_OFFSETS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export interface DenseWorldSpawn {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  suitability: number;
}

interface SpawnCandidate {
  x: number;
  z: number;
  suitability: number;
}

export class DenseSpawnLocator {
  private readonly normal = new THREE.Vector3();
  private readonly stoneClearance?: StoneClearanceCache;

  constructor(
    private readonly field: TerrainField,
    private readonly config: WorldConfig,
    stones?: StoneField,
  ) {
    const stoneField =
      config.stonesEnabled >= 1 ? stones ?? new StoneField(field, config) : undefined;
    this.stoneClearance = stoneField
      ? new StoneClearanceCache(stoneField, config)
      : undefined;
  }

  find(): DenseWorldSpawn {
    const halfWorld = this.config.worldSize * 0.5 - this.config.chunkSize;
    const radius = Math.min(this.config.spawnSearchRadius, halfWorld);
    const step = this.config.spawnSearchStep;
    const coarseStep = step * COARSE_STEP_MULTIPLIER;
    const coarseCandidates: SpawnCandidate[] = [];
    const sampledSuitability = new Map<string, number>();
    const sampleCandidate = (x: number, z: number): number => {
      const key = `${x}:${z}`;
      const cached = sampledSuitability.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const suitability = this.sampleAreaSuitability(x, z);
      sampledSuitability.set(key, suitability);
      return suitability;
    };

    // Rank broad ecological regions without invoking the stone generator. Exact
    // body/stone clearance is intentionally deferred to the few best regions.
    for (let z = -radius; z <= radius; z += coarseStep) {
      for (let x = -radius; x <= radius; x += coarseStep) {
        coarseCandidates.push({ x, z, suitability: sampleCandidate(x, z) });
      }
    }
    coarseCandidates.sort(
      (left, right) => right.suitability - left.suitability,
    );
    if (!(coarseCandidates[0]?.suitability > 0)) {
      throw new Error("Unable to locate viable grass terrain for the world spawn.");
    }

    const regions: SpawnCandidate[] = [];
    const candidatesToRefine = Math.min(
      REFINE_CANDIDATE_COUNT,
      coarseCandidates.length,
    );
    for (let index = 0; index < candidatesToRefine; index += 1) {
      const candidate = coarseCandidates[index];
      let regionalBest = candidate;
      for (
        let z = candidate.z - coarseStep;
        z <= candidate.z + coarseStep;
        z += step
      ) {
        if (z < -radius || z > radius) {
          continue;
        }
        for (
          let x = candidate.x - coarseStep;
          x <= candidate.x + coarseStep;
          x += step
        ) {
          if (x < -radius || x > radius) {
            continue;
          }
          const suitability = sampleCandidate(x, z);
          if (suitability > regionalBest.suitability) {
            regionalBest = { x, z, suitability };
          }
        }
      }
      regions.push(regionalBest);
    }
    regions.sort((left, right) => right.suitability - left.suitability);

    let clearSpawn: SpawnCandidate | undefined;
    for (const region of regions) {
      clearSpawn = this.tryResolveClearSpawn(
        region.x,
        region.z,
        region.suitability,
        radius,
      );
      if (clearSpawn) {
        break;
      }
    }
    if (!clearSpawn) {
      throw new Error("Unable to find a path- and stone-safe world spawn.");
    }

    const height = this.field.sampleHeight(clearSpawn.x, clearSpawn.z);
    return {
      position: new THREE.Vector3(
        clearSpawn.x,
        height + this.config.spawnEyeHeight,
        clearSpawn.z,
      ),
      yaw: this.resolveHeading(clearSpawn.x, clearSpawn.z),
      pitch: THREE.MathUtils.degToRad(this.config.spawnPitchDegrees),
      suitability: THREE.MathUtils.clamp(clearSpawn.suitability, 0, 1),
    };
  }

  private sampleAreaSuitability(x: number, z: number): number {
    let total = 0;
    const radius = this.config.spawnNeighborhoodRadius;

    for (const [offsetX, offsetZ] of AREA_SAMPLE_OFFSETS) {
      const sampleX = x + offsetX * radius;
      const sampleZ = z + offsetZ * radius;
      const height = this.field.sampleHeight(sampleX, sampleZ);
      const suitabilityWithoutSlope =
        this.field.sampleGrassSuitabilityWithoutSlope(sampleX, sampleZ, height);
      if (suitabilityWithoutSlope <= 0) {
        continue;
      }
      const pathMask = this.field.samplePathGrassMask(sampleX, sampleZ, height);
      if (pathMask <= 0) {
        continue;
      }
      this.field.sampleNormal(sampleX, sampleZ, this.normal);
      total +=
        suitabilityWithoutSlope *
        this.field.sampleGrassSlopeMask(this.normal) *
        pathMask;
    }

    return total / AREA_SAMPLE_OFFSETS.length;
  }

  private tryResolveClearSpawn(
    x: number,
    z: number,
    suitability: number,
    searchRadius: number,
  ): SpawnCandidate | undefined {
    const clearanceRadius =
      this.config.characterScale * CHARACTER_SPAWN_CLEARANCE_RADIUS_SCALE;
    const step = this.config.spawnSearchStep * CLEAR_SPAWN_STEP_SCALE;
    let best: SpawnCandidate | undefined;

    for (
      let offsetZ = -CLEAR_SPAWN_SEARCH_RADIUS_STEPS;
      offsetZ <= CLEAR_SPAWN_SEARCH_RADIUS_STEPS;
      offsetZ += 1
    ) {
      for (
        let offsetX = -CLEAR_SPAWN_SEARCH_RADIUS_STEPS;
        offsetX <= CLEAR_SPAWN_SEARCH_RADIUS_STEPS;
        offsetX += 1
      ) {
        const candidateX = x + offsetX * step;
        const candidateZ = z + offsetZ * step;
        if (
          candidateX < -searchRadius ||
          candidateX > searchRadius ||
          candidateZ < -searchRadius ||
          candidateZ > searchRadius
        ) {
          continue;
        }
        const height = this.field.sampleHeight(candidateX, candidateZ);
        const pathClearance = this.field.samplePathGrassMask(
          candidateX,
          candidateZ,
          height,
          clearanceRadius,
        );
        const stoneClearance =
          this.stoneClearance?.sample(
            candidateX,
            candidateZ,
            clearanceRadius,
          ) ?? 1;
        const clearance = Math.min(pathClearance, stoneClearance);
        if (clearance <= 0.5) {
          continue;
        }
        const areaSuitability =
          offsetX === 0 && offsetZ === 0
            ? suitability
            : this.sampleAreaSuitability(candidateX, candidateZ);
        if (!(areaSuitability > 0)) {
          continue;
        }
        const score = areaSuitability * clearance;
        if (!best || score > best.suitability) {
          best = { x: candidateX, z: candidateZ, suitability: score };
        }
      }
    }
    return best;
  }

  private resolveHeading(x: number, z: number): number {
    const distance = this.config.spawnNeighborhoodRadius * 2;
    let bestSuitability = Number.NEGATIVE_INFINITY;
    let directionX = 0;
    let directionZ = -1;

    for (let index = 0; index < HEADING_SAMPLE_COUNT; index += 1) {
      const angle = (index / HEADING_SAMPLE_COUNT) * Math.PI * 2;
      const candidateX = Math.sin(angle);
      const candidateZ = Math.cos(angle);
      const suitability = this.sampleAreaSuitability(
        x + candidateX * distance,
        z + candidateZ * distance,
      );
      if (suitability > bestSuitability) {
        bestSuitability = suitability;
        directionX = candidateX;
        directionZ = candidateZ;
      }
    }

    return Math.atan2(-directionX, -directionZ);
  }
}
