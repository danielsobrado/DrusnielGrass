import type { WorldConfig } from "../WorldConfig";

/** Large-scale historical topology for vegetation communities. */
export interface CommunityTopologySample {
  warpedX: number;
  warpedZ: number;
  /** Stable territory phase in [0, 1). */
  territory: number;
}

export function createCommunityTopologySample(): CommunityTopologySample {
  return { warpedX: 0, warpedZ: 0, territory: 0 };
}

const TOPOLOGY_FIELD_SALT = 0x41_73_aa_19;
const WARP_X_SALT = 0x9e_37_79_b9;
const WARP_Z_SALT = 0x85_eb_ca_6b;
const TERRITORY_SALT = 0xc2_b2_ae_35;
const cornerHashes = new Int32Array(4);

function hashLattice(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

function channel01(hash: number, salt: number): number {
  let value = hash ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function bilerpChannel(
  hashes: Int32Array,
  salt: number,
  weightX: number,
  weightZ: number,
): number {
  const lower =
    channel01(hashes[0], salt) +
    (channel01(hashes[1], salt) - channel01(hashes[0], salt)) * weightX;
  const upper =
    channel01(hashes[2], salt) +
    (channel01(hashes[3], salt) - channel01(hashes[2], salt)) * weightX;
  return lower + (upper - lower) * weightZ;
}

/**
 * Warps composition coordinates while leaving real-coordinate ecology intact.
 * One four-corner hash set supplies both vector channels and territory.
 */
export function sampleCommunityTopology(
  x: number,
  z: number,
  config: WorldConfig,
  target: CommunityTopologySample,
): CommunityTopologySample {
  const period = Math.max(1, config.grassCommunityWarpWorldSize);
  const u = x / period;
  const v = z / period;
  const cellX = Math.floor(u);
  const cellZ = Math.floor(v);
  const fractionX = u - cellX;
  const fractionZ = v - cellZ;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightZ = fractionZ * fractionZ * (3 - 2 * fractionZ);
  const seed = (config.seed ^ TOPOLOGY_FIELD_SALT) >>> 0;
  cornerHashes[0] = hashLattice(cellX, cellZ, seed);
  cornerHashes[1] = hashLattice(cellX + 1, cellZ, seed);
  cornerHashes[2] = hashLattice(cellX, cellZ + 1, seed);
  cornerHashes[3] = hashLattice(cellX + 1, cellZ + 1, seed);

  const distance = config.grassCommunityWarpDistance;
  const warpX = bilerpChannel(cornerHashes, WARP_X_SALT, weightX, weightZ);
  const warpZ = bilerpChannel(cornerHashes, WARP_Z_SALT, weightX, weightZ);
  target.warpedX = x + (warpX * 2 - 1) * distance;
  target.warpedZ = z + (warpZ * 2 - 1) * distance;
  target.territory = bilerpChannel(
    cornerHashes,
    TERRITORY_SALT,
    weightX,
    weightZ,
  );
  return target;
}

/** Bounded [0.75, 1.25] preference for one broad territory identity. */
export function resolveCommunityTerritoryBias(
  territory: number,
  communityIndex: number,
  communityCount: number,
): number {
  const phase = territory * communityCount;
  const preferred = Math.floor(phase) % communityCount;
  const next = (preferred + 1) % communityCount;
  const blend = phase - Math.floor(phase);
  const preferredWeight = communityIndex === preferred ? 1 - blend : 0;
  const nextWeight = communityIndex === next ? blend : 0;
  return 0.75 + 0.5 * Math.max(preferredWeight, nextWeight);
}
