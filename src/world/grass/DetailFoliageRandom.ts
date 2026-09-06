/**
 * Integer hashes for the detail-foliage composition model.
 *
 * Candidate positions come from a tile PRNG. Everything else — keep, family,
 * tint, height, yaw — is a channel of one world-space identity hash, so a
 * tuning change that rejects different cards cannot slide later plants around.
 * Salts are identity constants, not YAML.
 */

export const DETAIL_FOLIAGE_COLONY_SALT = 0x6d2b79f5;
export const DETAIL_FOLIAGE_CLUMP_SALT = 0x1b873593;
export const DETAIL_FOLIAGE_CHANNEL_PRESENCE_SALT = 0x27d4eb2f;
export const DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT = 0x9e3779b9;
export const DETAIL_FOLIAGE_CHANNEL_TINT_SALT = 0x85ebca6b;
export const DETAIL_FOLIAGE_CHANNEL_MATURITY_SALT = 0xc2b2ae35;
export const DETAIL_FOLIAGE_CHANNEL_CLUMP_SALT = 0x165667b1;

export const DETAIL_FOLIAGE_CANDIDATE_SALT = 0xa24baed1;
export const DETAIL_FOLIAGE_BIOME_DENSITY_CHANNEL_SALT = 0x51ed27a3;
export const DETAIL_FOLIAGE_DISTRIBUTION_KEEP_CHANNEL_SALT = 0x3c074a61;
export const DETAIL_FOLIAGE_DOMINANT_DECISION_SALT = 0x5bd1e995;
export const DETAIL_FOLIAGE_COMPANION_PICK_SALT = 0x94d049bb;
export const DETAIL_FOLIAGE_TINT_COHERENCE_SALT = 0x7f4a7c15;
export const DETAIL_FOLIAGE_INDEPENDENT_TINT_SALT = 0x27d4eb2e;
export const DETAIL_FOLIAGE_HEIGHT_SALT = 0x2c1b3a57;
export const DETAIL_FOLIAGE_INDIVIDUAL_MATURITY_SALT = 0x495d7c8f;
export const DETAIL_FOLIAGE_PHENOTYPE_SALT = 0x27220a95;
export const DETAIL_FOLIAGE_YAW_SALT = 0x9e3779b1;
export const DETAIL_FOLIAGE_DITHER_SALT = 0xe6546b64;
export const DETAIL_FOLIAGE_WIND_SALT = 0xc2b2ae34;
export const DETAIL_FOLIAGE_AO_SALT = 0x165667b0;

export function detailFoliageHashInt2(
  x: number,
  z: number,
  seed: number,
): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

export function detailFoliagePositionHash(
  x: number,
  z: number,
  seed: number,
  salt: number,
): number {
  return detailFoliageHashInt2(
    Math.round(x * 100),
    Math.round(z * 100),
    seed ^ salt,
  );
}

export function detailFoliageChannel01(hash: number, salt: number): number {
  let value = hash ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 4294967296;
}
