export const RIVER_BASE_MIN_WIDTH_SCALE = 0.95;
export const RIVER_BASE_MAX_WIDTH_SCALE = 1.03;

/**
 * Discharge: one normalized signal per river lane, drawn once and reused.
 *
 * Every lane used to sit within 3% of the same size, so the world had a single
 * river repeated at different angles. Discharge stands in for how much water a
 * corridor carries, and everything that should follow from that — width, depth,
 * bank width, bed composition, surface velocity, and how likely the reach is to
 * break over a knickpoint — is derived from this one number rather than from
 * separate unrelated hashes. A real drainage solve would compute it from
 * accumulation; a per-lane draw gets most of the visual result for none of it.
 *
 * The distribution is deliberately bottom-heavy: major rivers have to be rare
 * enough to be landmarks. The exponent above 1 pushes the uniform lane hash
 * toward the small end before it is mapped onto anything.
 */
export const RIVER_DISCHARGE_EXPONENT = 1.9;

/**
 * Width envelope, as a multiple of the configured river width.
 *
 * The top is deliberately short of the ~2.6 the lane spacing would allow, so
 * meanders, wide bends and humidity halos keep their margin. The bottom is
 * governed by `terrainFarResolution`: a lane narrower than the coarsest terrain
 * sample step aliases in and out as chunks change LOD, and the hydrology
 * validator rejects it. A genuine step-across stream only became legal once
 * that grid went from 7 to 13 samples per chunk.
 */
export const RIVER_DISCHARGE_MIN_WIDTH_SCALE = 0.58;
export const RIVER_DISCHARGE_MAX_WIDTH_SCALE = 1.95;
/**
 * Depth is scaled independently of width and far more aggressively. Holding the
 * old depth/width ratio would have left a 40 m river as shallow as the 12 m one
 * it replaced, which is the whole reason the channel read as wet gravel.
 */
export const RIVER_DISCHARGE_MIN_DEPTH_SCALE = 0.36;
export const RIVER_DISCHARGE_MAX_DEPTH_SCALE = 2;
/** Banks widen with the river, but about half as fast as the channel. */
export const RIVER_DISCHARGE_MIN_BANK_SCALE = 0.78;
export const RIVER_DISCHARGE_MAX_BANK_SCALE = 1.6;

/**
 * The width safety envelope every hydrology invariant is checked against.
 * It has to span discharge as well as per-lane and per-sample variation,
 * because `HydrologyConfigValidator` uses these to prove that neighbouring
 * lanes cannot touch and that the narrowest lane still survives far-terrain
 * LOD sampling.
 */
export const RIVER_GLOBAL_MIN_WIDTH_SCALE = 0.48;
export const RIVER_GLOBAL_MAX_WIDTH_SCALE = 2.3;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Maps a lane's uniform hash onto its discharge. */
export function resolveRiverDischarge(laneHash: number): number {
  return Math.pow(clamp01(laneHash), RIVER_DISCHARGE_EXPONENT);
}

export function resolveRiverDischargeWidthScale(discharge: number): number {
  return (
    RIVER_DISCHARGE_MIN_WIDTH_SCALE +
    (RIVER_DISCHARGE_MAX_WIDTH_SCALE - RIVER_DISCHARGE_MIN_WIDTH_SCALE) *
      clamp01(discharge)
  );
}

export function resolveRiverDischargeDepthScale(discharge: number): number {
  return (
    RIVER_DISCHARGE_MIN_DEPTH_SCALE +
    (RIVER_DISCHARGE_MAX_DEPTH_SCALE - RIVER_DISCHARGE_MIN_DEPTH_SCALE) *
      clamp01(discharge)
  );
}

export function resolveRiverDischargeBankScale(discharge: number): number {
  return (
    RIVER_DISCHARGE_MIN_BANK_SCALE +
    (RIVER_DISCHARGE_MAX_BANK_SCALE - RIVER_DISCHARGE_MIN_BANK_SCALE) *
      clamp01(discharge)
  );
}

export const RIVER_SECONDARY_AMPLITUDE = 0.3;

export const RIVER_MORPH_PRIMARY_WEIGHT = 0.72;
export const RIVER_MORPH_SECONDARY_WEIGHT = 0.28;
export const RIVER_MORPH_MAX_ABS = Math.max(
  RIVER_MORPH_PRIMARY_WEIGHT,
  RIVER_MORPH_SECONDARY_WEIGHT,
);

export const RIVER_SHELF_DEPTH_SHARE = 0.2;
export const RIVER_CHANNEL_DEPTH_SHARE = 0.8;
export const RIVER_SHELF_START = 0.68;
export const RIVER_CHANNEL_INNER = 0.1;
export const RIVER_CHANNEL_OUTER = 0.72;
export const RIVER_DEPTH_EDGE_START = 0.9;
export const RIVER_BANK_INCISION_SCALE = 0.08;

const WIDTH_ENVELOPE_EPSILON = 1e-9;

export function resolveRiverWidthEnvelope(
  riverWidthVariation: number,
  riverBendBankAsymmetry: number,
): { minWidthScale: number; maxWidthScale: number } {
  return {
    minWidthScale:
      RIVER_DISCHARGE_MIN_WIDTH_SCALE *
      RIVER_BASE_MIN_WIDTH_SCALE *
      (1 - riverWidthVariation) *
      (1 - riverBendBankAsymmetry),
    maxWidthScale:
      RIVER_DISCHARGE_MAX_WIDTH_SCALE *
      RIVER_BASE_MAX_WIDTH_SCALE *
      (1 + riverWidthVariation) *
      (1 + riverBendBankAsymmetry),
  };
}

export function validateRiverWidthEnvelope(
  riverWidthVariation: number,
  riverBendBankAsymmetry: number,
): void {
  const { minWidthScale, maxWidthScale } = resolveRiverWidthEnvelope(
    riverWidthVariation,
    riverBendBankAsymmetry,
  );
  if (maxWidthScale > RIVER_GLOBAL_MAX_WIDTH_SCALE + WIDTH_ENVELOPE_EPSILON) {
    throw new Error(
      `Combined river discharge, width variation and bend asymmetry exceed the ${RIVER_GLOBAL_MAX_WIDTH_SCALE} safety envelope.`,
    );
  }
  if (minWidthScale < RIVER_GLOBAL_MIN_WIDTH_SCALE - WIDTH_ENVELOPE_EPSILON) {
    throw new Error(
      `Combined river discharge, width variation and bend asymmetry fall below the ${RIVER_GLOBAL_MIN_WIDTH_SCALE} safety envelope.`,
    );
  }
}
