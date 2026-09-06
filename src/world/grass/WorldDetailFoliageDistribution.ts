import {
  DETAIL_FOLIAGE_CHANNEL_CLUMP_SALT,
  DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT,
  DETAIL_FOLIAGE_CHANNEL_MATURITY_SALT,
  DETAIL_FOLIAGE_CHANNEL_PRESENCE_SALT,
  DETAIL_FOLIAGE_CHANNEL_TINT_SALT,
  DETAIL_FOLIAGE_CLUMP_SALT,
  DETAIL_FOLIAGE_COLONY_SALT,
  detailFoliageChannel01,
  detailFoliageHashInt2,
} from "./DetailFoliageRandom";
import type { DetailFoliageTuning } from "./DetailFoliageTuning";

export interface DetailFoliageDistributionSample {
  colony: number;
  clump: number;
  core: number;
  keepMultiplier: number;
  familyRoll: number;
  tintRoll: number;
  maturityRoll: number;
}

export function createDetailFoliageDistributionSample(): DetailFoliageDistributionSample {
  return {
    colony: 0,
    clump: 0,
    core: 0,
    keepMultiplier: 1,
    familyRoll: 0,
    tintRoll: 0,
    maturityRoll: 0,
  };
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (value <= edge0) {
    return 0;
  }
  if (value >= edge1) {
    return 1;
  }
  const amount = (value - edge0) / (edge1 - edge0);
  return amount * amount * (3 - 2 * amount);
}

function bilerp(
  c00: number,
  c10: number,
  c01: number,
  c11: number,
  wx: number,
  wz: number,
): number {
  return lerp(lerp(c00, c10, wx), lerp(c01, c11, wx), wz);
}

/**
 * Two-scale continuous composition field. Macro cells decide where a community
 * is allowed to exist and what family/tint/maturity it carries; clump cells
 * break that area into irregular pockets. Sampling is allocation-free and has
 * no tile coordinates, so adjacent tiles agree on every continuous output.
 *
 * Each sample hashes four macro corners and four clump corners. Family, tint,
 * and maturity are channels of those same macro hashes, not extra fields.
 */
export class WorldDetailFoliageDistribution {
  private colonySeed: number;
  private clumpSeed: number;
  private colonyWorldSize: number;
  private clumpWorldSize: number;
  private colonyStrength: number;
  private quietZoneThreshold: number;
  private backgroundSuppression: number;

  constructor(seed: number, tuning: DetailFoliageTuning) {
    this.colonySeed = seed ^ DETAIL_FOLIAGE_COLONY_SALT;
    this.clumpSeed = seed ^ DETAIL_FOLIAGE_CLUMP_SALT;
    this.colonyWorldSize = tuning.colonyWorldSize;
    this.clumpWorldSize = tuning.clumpWorldSize;
    this.colonyStrength = tuning.colonyStrength;
    this.quietZoneThreshold = tuning.quietZoneThreshold;
    this.backgroundSuppression = tuning.backgroundSuppression;
  }

  setTuning(tuning: DetailFoliageTuning): void {
    this.colonyWorldSize = tuning.colonyWorldSize;
    this.clumpWorldSize = tuning.clumpWorldSize;
    this.colonyStrength = tuning.colonyStrength;
    this.quietZoneThreshold = tuning.quietZoneThreshold;
    this.backgroundSuppression = tuning.backgroundSuppression;
  }

  sample(
    x: number,
    z: number,
    target: DetailFoliageDistributionSample,
  ): DetailFoliageDistributionSample {
    const inverseColony = 1 / this.colonyWorldSize;
    const colonyU = x * inverseColony;
    const colonyV = z * inverseColony;
    const colonyIx = Math.floor(colonyU);
    const colonyIz = Math.floor(colonyV);
    const colonyFx = colonyU - colonyIx;
    const colonyFz = colonyV - colonyIz;
    const colonyWx = colonyFx * colonyFx * (3 - 2 * colonyFx);
    const colonyWz = colonyFz * colonyFz * (3 - 2 * colonyFz);
    const h00 = detailFoliageHashInt2(colonyIx, colonyIz, this.colonySeed);
    const h10 = detailFoliageHashInt2(colonyIx + 1, colonyIz, this.colonySeed);
    const h01 = detailFoliageHashInt2(colonyIx, colonyIz + 1, this.colonySeed);
    const h11 = detailFoliageHashInt2(colonyIx + 1, colonyIz + 1, this.colonySeed);

    const presence = bilerp(
      detailFoliageChannel01(h00, DETAIL_FOLIAGE_CHANNEL_PRESENCE_SALT),
      detailFoliageChannel01(h10, DETAIL_FOLIAGE_CHANNEL_PRESENCE_SALT),
      detailFoliageChannel01(h01, DETAIL_FOLIAGE_CHANNEL_PRESENCE_SALT),
      detailFoliageChannel01(h11, DETAIL_FOLIAGE_CHANNEL_PRESENCE_SALT),
      colonyWx,
      colonyWz,
    );
    const familyRoll = bilerp(
      detailFoliageChannel01(h00, DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT),
      detailFoliageChannel01(h10, DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT),
      detailFoliageChannel01(h01, DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT),
      detailFoliageChannel01(h11, DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT),
      colonyWx,
      colonyWz,
    );
    const tintRoll = bilerp(
      detailFoliageChannel01(h00, DETAIL_FOLIAGE_CHANNEL_TINT_SALT),
      detailFoliageChannel01(h10, DETAIL_FOLIAGE_CHANNEL_TINT_SALT),
      detailFoliageChannel01(h01, DETAIL_FOLIAGE_CHANNEL_TINT_SALT),
      detailFoliageChannel01(h11, DETAIL_FOLIAGE_CHANNEL_TINT_SALT),
      colonyWx,
      colonyWz,
    );
    const maturityRoll = bilerp(
      detailFoliageChannel01(h00, DETAIL_FOLIAGE_CHANNEL_MATURITY_SALT),
      detailFoliageChannel01(h10, DETAIL_FOLIAGE_CHANNEL_MATURITY_SALT),
      detailFoliageChannel01(h01, DETAIL_FOLIAGE_CHANNEL_MATURITY_SALT),
      detailFoliageChannel01(h11, DETAIL_FOLIAGE_CHANNEL_MATURITY_SALT),
      colonyWx,
      colonyWz,
    );

    const inverseClump = 1 / this.clumpWorldSize;
    const clumpU = x * inverseClump;
    const clumpV = z * inverseClump;
    const clumpIx = Math.floor(clumpU);
    const clumpIz = Math.floor(clumpV);
    const clumpFx = clumpU - clumpIx;
    const clumpFz = clumpV - clumpIz;
    const clumpWx = clumpFx * clumpFx * (3 - 2 * clumpFx);
    const clumpWz = clumpFz * clumpFz * (3 - 2 * clumpFz);
    const c00 = detailFoliageHashInt2(clumpIx, clumpIz, this.clumpSeed);
    const c10 = detailFoliageHashInt2(clumpIx + 1, clumpIz, this.clumpSeed);
    const c01 = detailFoliageHashInt2(clumpIx, clumpIz + 1, this.clumpSeed);
    const c11 = detailFoliageHashInt2(clumpIx + 1, clumpIz + 1, this.clumpSeed);
    const clump = bilerp(
      detailFoliageChannel01(c00, DETAIL_FOLIAGE_CHANNEL_CLUMP_SALT),
      detailFoliageChannel01(c10, DETAIL_FOLIAGE_CHANNEL_CLUMP_SALT),
      detailFoliageChannel01(c01, DETAIL_FOLIAGE_CHANNEL_CLUMP_SALT),
      detailFoliageChannel01(c11, DETAIL_FOLIAGE_CHANNEL_CLUMP_SALT),
      clumpWx,
      clumpWz,
    );

    const quiet = this.quietZoneThreshold;
    const macroBand = smoothstep(quiet, Math.min(1, quiet + 0.4), presence);
    const clumpBand = smoothstep(0.28, 0.72, clump);
    const structured = macroBand * (0.6 + 0.4 * clumpBand);
    const correlation = clamp01(this.colonyStrength);
    const core = lerp(0.5, structured, correlation);
    const structuredKeep = lerp(1 - this.backgroundSuppression, 1, structured);
    const keepMultiplier = lerp(1, structuredKeep, correlation);

    target.colony = clamp01(macroBand);
    target.clump = clamp01(clumpBand);
    target.core = clamp01(core);
    target.keepMultiplier = clamp01(keepMultiplier);
    target.familyRoll = clamp01(familyRoll);
    target.tintRoll = clamp01(tintRoll);
    target.maturityRoll = clamp01(maturityRoll);
    return target;
  }
}
