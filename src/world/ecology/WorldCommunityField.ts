import type { WorldConfig } from "../WorldConfig";
import type { WorldEcologySample } from "./WorldEcologyField";
import {
  COMMUNITY_COUNT,
  COMMUNITY_PROFILES,
  type CommunityPreferences,
} from "./WorldCommunityProfiles";
import {
  createCommunityTopologySample,
  resolveCommunityTerritoryBias,
  sampleCommunityTopology,
} from "./WorldCommunityTopologyField";

/**
 * Which vegetation community grows here.
 *
 * The meadow's remaining structural defect is that every point in it is "grass,
 * a bit drier or wetter or denser". The macro fields already vary dryness,
 * vigour, clearing and patch density, but none of them ever *names* a
 * community, so nothing makes density, height, accent share, understory ratio
 * and clump archetype agree about what a given twenty-five metres of ground is.
 *
 * This is the field that names it, and the direction it runs in is the point:
 *
 *   **Ecology decides which communities are possible. A low-frequency
 *   composition field decides which of the possible ones organises here, and
 *   gives the patch its shape. A community may read every ecology channel and
 *   may write none.**
 *
 * Running it the other way — noise labels a patch, the label then edits dryness
 * — is what a first draft of this did, and it puts bare breaks on wet, fertile,
 * sheltered ground. That is scatter wearing a taxonomy, and it contradicts the
 * founding claim of `WorldEcologyField`: features agree only when they are
 * consequences of the same cause.
 *
 * Both halves are needed. Pure ecology would trace moisture and slope isolines
 * and read as a contour map; pure noise is what is already there. Real
 * vegetation is ecology-constrained and historically contingent, so ecology
 * sets the weight and noise breaks the tie.
 *
 * Structurally this is {@link ../grass/DetailFoliageAffinity} one level up: that
 * module already does weight x ecology-fit selection correctly for species, and
 * this is the same construction for the community those species live in.
 *
 * Cost is four lattice hashes per sample. The five per-community noise channels
 * are bit-slices of those same hashes rather than five separate fields, the way
 * `DetailFoliageRandom` slices its channels — twenty hashes here would have
 * made the terrain's per-fragment path unaffordable.
 */

export interface WorldCommunitySample {
  /** Dominant community at this position. */
  index: number;
  /** Runner-up; equals `index` where the winner is decisive. */
  neighborIndex: number;
  /** Share of individuals belonging to `neighborIndex`, in [0, 0.5]. */
  blend: number;
  /**
   * 1 where the winner is decisive, 0 where the top two scores tie.
   *
   * `blend` and `core` both fall out of the same score margin, which is what
   * makes a community edge a gradient without a second field: where two
   * communities are nearly equally suited, individuals interleave *and* the
   * winner expresses itself weakly. That is what an ecotone is.
   */
  core: number;
  /**
   * How deliberately empty this patch is, in [0, 1].
   *
   * The visual-hierarchy lever. A field where every square metre carries the
   * same amount of incident is exhausting to read however good each square
   * metre is; this is what buys quiet ground for the richer patches to stand
   * against.
   */
  quiet: number;
  /**
   * Score-weighted share of each community at this point, summing to 1.
   *
   * The response is mixed from these rather than from the top two, because the
   * *identity* of the runner-up can change while the blend toward it is still
   * non-zero -- third place overtakes second, and the response jumps to a
   * different row without any of the continuous quantities moving. The
   * continuity gate caught it as accentChance stepping 0.035 over a millimetre.
   *
   * A full mixture has no identity to jump. The dominant and runner-up indices
   * survive for the per-plant pick, which is a discrete dithered choice and is
   * allowed to differ between neighbouring plants -- that is what an ecotone is.
   */
  weights: Float64Array;
}

export function createCommunitySample(): WorldCommunitySample {
  return {
    index: 0,
    neighborIndex: 0,
    blend: 0,
    core: 1,
    quiet: 0,
    weights: new Float64Array(COMMUNITY_COUNT),
  };
}

/** Salts that slice one lattice hash into the per-community noise channels. */
const COMMUNITY_CHANNEL_SALTS = [
  0x1b_87_35_93, 0x27_d4_eb_2f, 0x85_eb_ca_6b, 0xc2_b2_ae_35, 0x16_56_67_b1,
] as const;
const COMMUNITY_QUIET_SALT = 0x94_d0_49_bb;
const COMMUNITY_FIELD_SALT = 0x7e_1a_44_9d;
const communityTopologySample = createCommunityTopologySample();
/**
 * Floor under the noise term.
 *
 * Without it a low roll could veto a well-suited community outright, which
 * turns patch interiors into holes rather than patches. The community that fits
 * the ground should always be in contention there; noise decides how strongly.
 */
const NOISE_FLOOR = 0.3;
/**
 * Sharpening applied to the scores before they are normalised into the response
 * mixture. High enough that a patch interior is dominated by one community, low
 * enough that the handover at an edge stays smooth.
 *
 * It compounds with {@link ECOLOGY_EXPONENT}: together they set how hard this
 * layer amplifies a change in ecology, and their product is the Lipschitz bound
 * verify-community-field holds it to. At 6 the pair turned a 2.6% step in
 * canopy shade into a 19% step in expression, which is the hard-walled patch
 * edge the whole expression channel exists to avoid.
 */
export const MIXTURE_SHARPNESS = 3;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function hashLattice(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

/** One decorrelated channel of a lattice hash, in [0, 1). */
function channel01(hash: number, salt: number): number {
  let value = hash ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function preference(value: number, target: number, tolerance: number): number {
  return clamp01(1 - Math.abs(value - target) / tolerance);
}

/**
 * Floor under each channel's preference before the product below.
 *
 * `preference` clamps to zero as soon as a channel is further from its target
 * than its own tolerance, and six such terms multiplied together are zero
 * almost everywhere: with tolerances around 0.3 the chance that all six land
 * inside is small. The first version of this had no floor, and the result was a
 * fit of zero for every community at nearly every point -- so ecology handed
 * every candidate the same score and the noise decided the whole world. The
 * causality gate measured it as a moisture margin of -0.003 between the wettest
 * and driest communities.
 *
 * A floored product keeps what a product is for -- a community needs all of its
 * conditions, and one strong match must not carry it onto rock it cannot live
 * on -- while letting a community that misses a channel still score below one
 * that does not, instead of both scoring nothing.
 */
const PREFERENCE_FLOOR = 0.2;

/**
 * How far ecology is allowed to dominate the composition noise.
 *
 * The noise term spans about 3.3x between its floor and its ceiling. An ecology
 * factor applied linearly spans less than that, so ecology would lose every tie
 * it did not win outright. Raising the fit to a power lets a well-suited
 * community outscore a poorly-suited one by two orders of magnitude while noise
 * still decides between communities of *similar* fit -- which is exactly the
 * division of labour this field is for.
 *
 * At `grassCommunityEcologyStrength` 0 the exponent is 0 and selection is pure
 * noise; at 1 it is this, and communities trace the conditions closely.
 */
export const ECOLOGY_EXPONENT = 4;

/**
 * How well the conditions here suit a community, in [PREFERENCE_FLOOR, 1].
 *
 * A geometric mean rather than a weighted sum: summing lets a strong moisture
 * match carry a community onto ground it cannot live on, which is the failure
 * mode that makes ecological placement look arbitrary.
 */
export function scoreCommunityFit(
  ecology: WorldEcologySample,
  preferences: CommunityPreferences,
): number {
  const floored = (value: number, pair: readonly [number, number]): number =>
    PREFERENCE_FLOOR +
    (1 - PREFERENCE_FLOOR) * preference(value, pair[0], pair[1]);
  const product =
    floored(ecology.moisture, preferences.moisture) *
    floored(ecology.fertility, preferences.fertility) *
    floored(ecology.exposure, preferences.exposure) *
    floored(ecology.disturbance, preferences.disturbance) *
    floored(ecology.rockiness, preferences.rockiness) *
    floored(ecology.shade, preferences.shade);
  return Math.pow(product, 1 / 6);
}

/**
 * Corner hashes for the cell being sampled. Int32 rather than a plain array
 * because the only thing done with them is XOR against a salt, which is
 * bit-identical whether the value is read as signed or unsigned -- and a typed
 * array keeps the sampler allocation-free.
 */
const cornerHashes = new Int32Array(4);

/**
 * Samples the four lattice corners once and reuses them for every channel.
 * `target` is filled in place so placement loops allocate nothing.
 */
export function sampleWorldCommunity(
  x: number,
  z: number,
  ecology: WorldEcologySample,
  config: WorldConfig,
  target: WorldCommunitySample,
): WorldCommunitySample {
  // Ecology passed to this function belongs to the real (x, z). Only the
  // compositional history is warped, preserving environmental causality.
  const topology = sampleCommunityTopology(
    x,
    z,
    config,
    communityTopologySample,
  );
  const period = Math.max(config.grassCommunityWorldSize, 1);
  const seed = (config.seed ^ COMMUNITY_FIELD_SALT) >>> 0;
  const u = topology.warpedX / period;
  const v = topology.warpedZ / period;
  const cellX = Math.floor(u);
  const cellZ = Math.floor(v);
  const fractionX = u - cellX;
  const fractionZ = v - cellZ;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightZ = fractionZ * fractionZ * (3 - 2 * fractionZ);
  cornerHashes[0] = hashLattice(cellX, cellZ, seed);
  cornerHashes[1] = hashLattice(cellX + 1, cellZ, seed);
  cornerHashes[2] = hashLattice(cellX, cellZ + 1, seed);
  cornerHashes[3] = hashLattice(cellX + 1, cellZ + 1, seed);

  const strength = clamp01(config.grassCommunityEcologyStrength);
  let best = -1;
  let second = -1;
  let bestScore = -1;
  let secondScore = -1;
  for (let index = 0; index < COMMUNITY_COUNT; index += 1) {
    const salt = COMMUNITY_CHANNEL_SALTS[index];
    const lower =
      channel01(cornerHashes[0], salt) +
      (channel01(cornerHashes[1], salt) - channel01(cornerHashes[0], salt)) *
        weightX;
    const upper =
      channel01(cornerHashes[2], salt) +
      (channel01(cornerHashes[3], salt) - channel01(cornerHashes[2], salt)) *
        weightX;
    const noise = lower + (upper - lower) * weightZ;
    const profile = COMMUNITY_PROFILES[index];
    const fit = scoreCommunityFit(ecology, profile.preferences);
    const score =
      profile.weight *
      Math.pow(fit, strength * ECOLOGY_EXPONENT) *
      (NOISE_FLOOR + (1 - NOISE_FLOOR) * noise) *
      resolveCommunityTerritoryBias(
        topology.territory,
        index,
        COMMUNITY_COUNT,
      );
    target.weights[index] = score;
    if (score > bestScore) {
      secondScore = bestScore;
      second = best;
      bestScore = score;
      best = index;
    } else if (score > secondScore) {
      secondScore = score;
      second = index;
    }
  }

  const margin =
    bestScore > 0 ? (bestScore - secondScore) / bestScore : 0;
  const border = Math.max(config.grassCommunityBorderWidth, 1e-4);
  target.index = best;
  target.neighborIndex = second >= 0 ? second : best;
  // Half at a dead tie, falling to nothing once one community clearly wins.
  // Used only by the per-plant pick, which is allowed to be discrete.
  target.blend = 0.5 * (1 - smoothstep(0, border, margin));

  // Sharpen and normalise the scores into a mixture. Dividing by the best score
  // before the power keeps the intermediate inside float range whatever the
  // scores are worth in absolute terms.
  let weightSum = 0;
  for (let index = 0; index < COMMUNITY_COUNT; index += 1) {
    const relative = bestScore > 0 ? target.weights[index] / bestScore : 1;
    const sharpened = Math.pow(relative, MIXTURE_SHARPNESS);
    target.weights[index] = sharpened;
    weightSum += sharpened;
  }
  let peak = 0;
  for (let index = 0; index < COMMUNITY_COUNT; index += 1) {
    const share = weightSum > 0 ? target.weights[index] / weightSum : 1 / COMMUNITY_COUNT;
    target.weights[index] = share;
    peak = Math.max(peak, share);
  }
  // How decisively one community holds this ground, normalised so an even
  // five-way split reads as zero and a clean win as one. Derived from the
  // mixture rather than from the top-two margin, so it cannot jump when the
  // runner-up changes identity.
  const even = 1 / COMMUNITY_COUNT;
  target.core = clamp01((peak - even) / (1 - even));

  const quietLower =
    channel01(cornerHashes[0], COMMUNITY_QUIET_SALT) +
    (channel01(cornerHashes[1], COMMUNITY_QUIET_SALT) -
      channel01(cornerHashes[0], COMMUNITY_QUIET_SALT)) *
      weightX;
  const quietUpper =
    channel01(cornerHashes[2], COMMUNITY_QUIET_SALT) +
    (channel01(cornerHashes[3], COMMUNITY_QUIET_SALT) -
      channel01(cornerHashes[2], COMMUNITY_QUIET_SALT)) *
      weightX;
  // Sampled on the same lattice as the communities, deliberately: quiet is a
  // property of a patch rather than a region that cuts across several. Read
  // through a smoothstep centred well above the median, so quiet ground stays
  // the minority it is meant to be.
  const quietRaw = quietLower + (quietUpper - quietLower) * weightZ;
  target.quiet = smoothstep(0.52, 0.86, quietRaw);
  return target;
}

/**
 * The single community a plant rooted at (x, z) belongs to.
 *
 * Dithered per plant rather than blended, exactly as `pickGrassBiomeIndex`
 * does: an ecotone is two communities interleaving, not a third community made
 * of the average of two.
 */
export function pickCommunityIndex(
  x: number,
  z: number,
  sample: WorldCommunitySample,
): number {
  if (sample.blend <= 0 || sample.index === sample.neighborIndex) {
    return sample.index;
  }
  const roll =
    hashLattice(Math.round(x * 100), Math.round(z * 100), 0x5b_d1_e9_95) /
    4294967296;
  return roll < sample.blend ? sample.neighborIndex : sample.index;
}
