/**
 * The rock sill a fall spills over, sampled from the terrain itself.
 *
 * The curtain's top edge is a straight line in the mesh, and the first attempt
 * at breaking it used a few sine terms across the lip. That removes the ruled
 * edge but invents a shape: the water spills over a profile that has nothing to
 * do with the rock underneath it, and on a lip that genuinely is flat it
 * manufactures notches that are not there.
 *
 * This reads the real thing instead. The raw, uncarved terrain is probed across
 * the lip a little upstream of the break, and each column is expressed as its
 * height relative to the centreline. Negative means the channel has cut a notch
 * there and the water leaves lower and heavier; positive means the rock stands
 * proud, and if it stands proud far enough it is simply dry — which is what
 * splits a wide fall into separate chutes rather than one even sheet.
 */

/** Odd, so one sample lands exactly on the centreline the lip height came from. */
export const CASCADE_SILL_SAMPLES = 11;

/**
 * Metres of proud rock at which a column carries no water at all. A sill this
 * far above the centreline stands above the arriving sheet, so the fall parts
 * around it.
 */
export const CASCADE_SILL_DRY_HEIGHT = 0.9;

/** Far enough upstream that the long profile has not begun to step down. */
const CASCADE_SILL_PROBE = 2.5;

/**
 * Fills `target` with each column's height relative to the centreline sill.
 *
 * `halfWidth` is the channel's, so the profile is sampled across exactly the
 * water that arrives rather than across an arbitrary span.
 */
export function sampleCascadeSill(
  sampleRawHeight: (x: number, z: number) => number,
  lipX: number,
  centerZ: number,
  halfWidth: number,
  flowSign: number,
  target: Float32Array,
): Float32Array {
  const probeX = lipX - flowSign * CASCADE_SILL_PROBE;
  const centre = sampleRawHeight(probeX, centerZ);
  const last = CASCADE_SILL_SAMPLES - 1;
  for (let index = 0; index <= last; index += 1) {
    const lateral = (index / last) * 2 - 1;
    target[index] = sampleRawHeight(probeX, centerZ + lateral * halfWidth) - centre;
  }
  return target;
}

/** The sill height at a lateral position in [-1, 1], linearly interpolated. */
export function resolveCascadeSill(sill: Float32Array, lateral: number): number {
  const last = CASCADE_SILL_SAMPLES - 1;
  const position = ((Math.max(-1, Math.min(1, lateral)) + 1) * 0.5) * last;
  const index = Math.min(last - 1, Math.floor(position));
  const fraction = position - index;
  return sill[index] + (sill[index + 1] - sill[index]) * fraction;
}
