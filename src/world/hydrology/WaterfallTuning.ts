/**
 * Knickpoint placement and profile geometry.
 *
 * Falls are placed per lane in cells along the flow axis, so at most one exists
 * per cell and the spacing never clusters. Everything here is in metres.
 */
export const WATERFALL_CELL_LENGTH = 420;
/** Keeps a lip away from a cell boundary so neighbouring cells cannot overlap. */
export const WATERFALL_CELL_MARGIN = 90;

/**
 * A small river breaks over ledges constantly; a major river almost never does.
 * Reversing this gives a landscape of water slides rather than of rivers.
 */
export const WATERFALL_STREAM_CHANCE = 0.55;
export const WATERFALL_MAJOR_CHANCE = 0.16;

export const WATERFALL_MIN_DROP = 3.6;
export const WATERFALL_MAX_DROP = 19;
/** A larger river carries a bigger step when it does break. */
export const WATERFALL_DISCHARGE_DROP_MIN = 0.72;
export const WATERFALL_DISCHARGE_DROP_MAX = 1.75;

/**
 * Horizontal extent of the face. Short on purpose — this is what makes the
 * terrain read as a ledge rather than a hill, and the cascade mesh spans it
 * regardless of what the terrain LOD does with those few metres.
 */
export const WATERFALL_FACE_LENGTH = 3.5;
/** The level reach below the fall where the plunge pool sits. */
export const WATERFALL_PLUNGE_LENGTH = 26;
/**
 * How far downstream the channel climbs back to natural ground. It has to
 * outlast the drop by an order of magnitude, or the gorge below a fall closes
 * into a pit instead of running out into ordinary river.
 */
export const WATERFALL_RECOVERY_LENGTH = 95;

/** Lateral reach of the step, as a multiple of the local channel half width. */
export const WATERFALL_CORRIDOR_SCALE = 1.5;

export function resolveWaterfallDischargeDrop(discharge: number): number {
  const amount = Math.max(0, Math.min(1, discharge));
  return (
    WATERFALL_DISCHARGE_DROP_MIN +
    (WATERFALL_DISCHARGE_DROP_MAX - WATERFALL_DISCHARGE_DROP_MIN) * amount
  );
}
