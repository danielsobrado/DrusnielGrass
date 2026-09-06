import type { RiverSample } from "./RiverField";
import type { WaterfallField, WaterfallSample } from "./WaterfallField";
import { WATERFALL_CORRIDOR_SCALE } from "./WaterfallTuning";

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

/**
 * How far the channel floor has already dropped at a point because of a
 * knickpoint upstream of it.
 *
 * Confined to the channel corridor and feathered out over half a channel width
 * again, so a fall cuts a gorge rather than a scarp running to the horizon. The
 * lateral mask uses the sampled point while the profile itself is evaluated on
 * the centreline, which keeps the step's elevation constant bank to bank — a
 * waterfall lip is level, and deriving it per-vertex would twist it.
 */
export function resolveRiverFallStep(
  waterfalls: WaterfallField,
  river: RiverSample,
  scratch: WaterfallSample,
  x: number,
  z: number,
): number {
  const halfWidth = river.localHalfWidth;
  if (halfWidth <= 0) return 0;
  const corridor = halfWidth * WATERFALL_CORRIDOR_SCALE;
  const lateral = Math.abs(z - river.centerZ);
  if (lateral >= corridor) return 0;

  waterfalls.sample(river.laneIndex, x, river.flowSign, river.discharge, scratch);
  if (scratch.step <= 0) return 0;
  return scratch.step * (1 - smoothstep(lateral, halfWidth, corridor));
}

/**
 * Elevation of a river's surface.
 *
 * Water is level across a channel; terrain is not. Taking the surface from the
 * sample's own position tilted the sheet bank to bank by whatever the ground
 * did there — tolerable on a 12 m river, a visible ramp once a major river
 * spanned 40 m. Reading the terrain once on the centreline gives one elevation
 * for the whole cross-section, and stepping it by the same knickpoint profile
 * that cut the ground puts the lip exactly where the ledge is.
 *
 * Still clamped to the carved bed: open water is contractually never below the
 * ground beneath it.
 */
export function resolveRiverSurface(
  waterfalls: WaterfallField,
  river: RiverSample,
  scratch: WaterfallSample,
  sampleRawHeight: (x: number, z: number) => number,
  x: number,
  carvedHeight: number,
): number {
  if (river.proximity <= 0) return carvedHeight + river.incisionDepth;
  const centerline =
    sampleRawHeight(x, river.centerZ) -
    resolveRiverFallStep(waterfalls, river, scratch, x, river.centerZ);
  return Math.max(centerline, carvedHeight);
}
