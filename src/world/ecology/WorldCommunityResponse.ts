import type { WorldConfig } from "../WorldConfig";
import type { WorldCommunitySample } from "./WorldCommunityField";
import {
  COMMUNITY_PROFILES,
  NEUTRAL_COMMUNITY_RESPONSE,
  type CommunityResponse,
} from "./WorldCommunityProfiles";

/**
 * Turns "which community is here" into "what that does to the plants".
 *
 * Kept apart from the field that decides the community so `sampleGrassHabitat`
 * can take the resolved response rather than the raw sample: the habitat mapper
 * stays a pure function of numbers, and every caller shares one resolution
 * instead of four call sites each deciding how to read a community.
 */

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

export function createCommunityResponse(): CommunityResponse {
  return { ...NEUTRAL_COMMUNITY_RESPONSE };
}

/**
 * Mixes the response from every community's share of this ground, then fades
 * the whole thing toward neutral by how decisively one of them holds it.
 *
 * The mixture is over all five rather than over the dominant and its runner-up,
 * and that is a correctness requirement rather than a refinement. A top-two
 * blend jumps whenever third place overtakes second: the blend toward the
 * runner-up is still non-zero at that moment, so the response snaps to a
 * different row while every continuous quantity holds still. The continuity
 * gate measured it as `accentChance` stepping 0.035 across a millimetre. A full
 * mixture has no identity to jump.
 *
 * `core` then makes a colony edge a gradient rather than a wall — without it
 * the field would produce hard-walled patches with the right species and the
 * wrong density.
 *
 * `quiet` deliberately does not touch density. Quiet ground is not bare ground:
 * what falls in a quiet patch is the accent layer and the clump-scale variety
 * that make a patch busy, so the eye gets somewhere to rest without the meadow
 * developing holes.
 */
export function resolveCommunityResponse(
  sample: WorldCommunitySample,
  config: WorldConfig,
  target: CommunityResponse,
): CommunityResponse {
  const strength = clamp01(config.grassCommunityStrength);
  const expression = clamp01(sample.core) * strength;

  let density = 0;
  let height = 0;
  let accentChance = 0;
  let understory = 0;
  let clumpScale = 0;
  let clearingAffinity = 0;
  let groundExposure = 0;
  let organicCover = 0;
  let dryGroundBias = 0;
  let shareSum = 0;
  for (let index = 0; index < sample.weights.length; index += 1) {
    const share = sample.weights[index];
    if (!(share > 0)) {
      continue;
    }
    const row = COMMUNITY_PROFILES[index]?.response;
    if (!row) {
      continue;
    }
    density += row.density * share;
    height += row.height * share;
    accentChance += row.accentChance * share;
    understory += row.understory * share;
    clumpScale += row.clumpScale * share;
    clearingAffinity += row.clearingAffinity * share;
    groundExposure += row.groundExposure * share;
    organicCover += row.organicCover * share;
    dryGroundBias += row.dryGroundBias * share;
    shareSum += share;
  }
  if (shareSum <= 0) {
    Object.assign(target, NEUTRAL_COMMUNITY_RESPONSE);
    return target;
  }

  target.density = lerp(1, density / shareSum, expression);
  target.height = lerp(1, height / shareSum, expression);
  target.accentChance = lerp(1, accentChance / shareSum, expression);
  target.understory = lerp(1, understory / shareSum, expression);
  target.clumpScale = lerp(1, clumpScale / shareSum, expression);
  target.clearingAffinity = lerp(
    NEUTRAL_COMMUNITY_RESPONSE.clearingAffinity,
    clearingAffinity / shareSum,
    expression,
  );
  target.groundExposure = (groundExposure / shareSum) * expression;
  target.organicCover = (organicCover / shareSum) * expression;
  target.dryGroundBias = (dryGroundBias / shareSum) * expression;

  const quiet = clamp01(sample.quiet) * clamp01(config.grassCommunityQuietStrength);
  target.accentChance *= 1 - quiet;
  target.clumpScale = lerp(target.clumpScale, 1, quiet * 0.7);
  return target;
}
