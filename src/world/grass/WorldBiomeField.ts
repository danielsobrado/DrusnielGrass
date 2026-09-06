import {
  GRASS_BIOME_PROFILES,
  type GrassBiomeProfile,
} from "../../grass/biome/GrassBiomeProfile";

/**
 * Where a biome is, in world space.
 *
 * Deliberately shaped like {@link ../../grass/GrassFieldVariation}: build-time
 * only, world-space, pure functions, no per-frame cost. The v1 implementation
 * below is low-frequency value noise sliced into regions with a soft border;
 * an authored or worldgen biome map replaces it behind the same signature, and
 * everything downstream is already correct when that happens.
 *
 * Two rules keep borders natural without costing anything at draw time:
 *
 * - The species pick is **per-blade dithered, not blended**. A blade at blend
 *   `t` belongs to the neighbouring biome with probability `t`, decided by a
 *   hash of its own root position. That is the interleaving a real
 *   meadow/steppe edge has, it is deterministic in world space so it cannot
 *   pop, and every blade ends up carrying exactly one biome row.
 * - Density is **lerped continuously**, so the bare-ground fraction ramps
 *   smoothly even where the two species interleave.
 *
 * Macro dryness and vigour stay global: they are sampled from the same
 * functions on both sides of a border, so a dry crown crosses a biome edge
 * without a seam.
 */

/**
 * Metres per region cell.
 *
 * A biome has to be something you travel through, not something you walk
 * across: at 90 m the field changed species every ten metres or so, which reads
 * as patchy discolouration rather than as regions. 180 m keeps a biome large
 * enough to walk through while still letting an elevated 50–120 m view catch a
 * meadow/steppe or alpine edge inside the 280 m grass horizon.
 */
const BIOME_PERIOD = 180;
/**
 * Weight of the second octave. It ragged-edges the borders; too much of it and
 * the region boundaries dissolve back into per-metre churn.
 */
const BIOME_FINE_WEIGHT = 0.35;
const BIOME_SEED = 0x3b_9a_ca_07;
/**
 * Half-width of the soft border, in units of the rank-transformed field. The
 * field is uniform after the transform below, so this is directly the share of
 * the world spent inside border bands; the bands' width on the ground follows
 * the field's local gradient and therefore scales with `BIOME_PERIOD`.
 * At 180 m, 0.05 keeps a mixed fringe of roughly 15–25 m rather than a drawn
 * species line.
 */
const BIOME_BORDER_WIDTH = 0.05;
const BIOME_PICK_SEED = 0x85_eb_ca_6b;
/** Samples used to build the rank transform. One-time, at module load. */
const RANK_SAMPLES = 2048;

export interface GrassBiomeSample {
  /** Dominant biome row at this position. */
  indexA: number;
  /** Neighbouring row inside the border band; equals `indexA` outside it. */
  indexB: number;
  /** Fraction of blades that belong to `indexB`, in [0, 0.5]. */
  blend: number;
}

export function createGrassBiomeSample(): GrassBiomeSample {
  return { indexA: 0, indexB: 0, blend: 0 };
}

function hashLattice(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const fractionX = x - cellX;
  const fractionZ = z - cellZ;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightZ = fractionZ * fractionZ * (3 - 2 * fractionZ);
  const corner00 = hashLattice(cellX, cellZ, seed);
  const corner10 = hashLattice(cellX + 1, cellZ, seed);
  const corner01 = hashLattice(cellX, cellZ + 1, seed);
  const corner11 = hashLattice(cellX + 1, cellZ + 1, seed);
  const lower = corner00 + (corner10 - corner00) * weightX;
  const upper = corner01 + (corner11 - corner01) * weightX;
  return lower + (upper - lower) * weightZ;
}

/**
 * A world-space hash in [0, 1) quantised to centimetres, so two blades at the
 * same root always decide the same way regardless of which representation is
 * asking. This is what makes the border interleave identical at every LOD.
 */
function positionHash(x: number, z: number, seed: number): number {
  return hashLattice(Math.round(x * 100), Math.round(z * 100), seed);
}

function rawField(x: number, z: number): number {
  // Two octaves so region edges are ragged rather than smooth ellipses, the
  // same trick the macro fields use.
  const coarse = valueNoise(x / BIOME_PERIOD, z / BIOME_PERIOD, BIOME_SEED);
  const fine = valueNoise(
    (x * 2.3) / BIOME_PERIOD,
    (z * 2.3) / BIOME_PERIOD,
    BIOME_SEED ^ 0x9e3779b9,
  );
  return (coarse + fine * BIOME_FINE_WEIGHT) / (1 + BIOME_FINE_WEIGHT);
}

/**
 * Sorted samples of {@link rawField}, used to turn it into a uniform variable.
 *
 * A sum of value-noise octaves is strongly bell-shaped: slicing it into equal
 * intervals gave the middle biome two thirds of the world and the outer two a
 * sixth each, which is the opposite of what the profiles ask for. Ranking the
 * field against its own distribution makes it uniform, so a biome's share of
 * the world is exactly its `worldShare` — whatever the noise's shape, and
 * without hand-tuned thresholds that would silently rot if the noise changed.
 *
 * Built once at module load from a deterministic lattice; 2 048 samples is
 * about 8 000 hashes and resolves shares to well under a percent.
 */
const RANK_TABLE = (() => {
  const samples = new Float64Array(RANK_SAMPLES);
  const stride = Math.ceil(Math.sqrt(RANK_SAMPLES));
  // A prime-ish step keeps the lattice from aligning with the noise period.
  const step = BIOME_PERIOD * 0.618;
  for (let index = 0; index < RANK_SAMPLES; index += 1) {
    const column = index % stride;
    const row = Math.floor(index / stride);
    samples[index] = rawField(column * step, row * step);
  }
  return samples.sort();
})();

/** The field's value at (x, z), remapped to a uniform variable in [0, 1). */
function uniformField(x: number, z: number): number {
  const value = rawField(x, z);
  let low = 0;
  let high = RANK_TABLE.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (RANK_TABLE[middle] <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return Math.min(0.999999, low / RANK_TABLE.length);
}

/** Cumulative upper edge of each biome's slice of the uniform field. */
const BIOME_BOUNDARIES = (() => {
  const total = GRASS_BIOME_PROFILES.reduce(
    (sum, profile) => sum + profile.worldShare,
    0,
  );
  const boundaries: number[] = [];
  let cumulative = 0;
  for (const profile of GRASS_BIOME_PROFILES) {
    cumulative += profile.worldShare / total;
    boundaries.push(cumulative);
  }
  boundaries[boundaries.length - 1] = 1;
  return boundaries;
})();

/** Which biomes compete at this world position, and how strongly. */
export function sampleGrassBiome(
  x: number,
  z: number,
  target: GrassBiomeSample = createGrassBiomeSample(),
): GrassBiomeSample {
  const count = GRASS_BIOME_PROFILES.length;
  if (count <= 1) {
    target.indexA = 0;
    target.indexB = 0;
    target.blend = 0;
    return target;
  }

  const field = uniformField(x, z);
  let indexA = count - 1;
  for (let index = 0; index < count; index += 1) {
    if (field < BIOME_BOUNDARIES[index]) {
      indexA = index;
      break;
    }
  }

  const lowerEdge = indexA === 0 ? -Infinity : BIOME_BOUNDARIES[indexA - 1];
  const upperEdge =
    indexA === count - 1 ? Infinity : BIOME_BOUNDARIES[indexA];
  const belowDistance = field - lowerEdge;
  const aboveDistance = upperEdge - field;
  const edgeDistance = Math.min(belowDistance, aboveDistance);
  target.indexA = indexA;
  if (edgeDistance >= BIOME_BORDER_WIDTH) {
    target.indexB = indexA;
    target.blend = 0;
    return target;
  }

  const neighbor = belowDistance < aboveDistance ? indexA - 1 : indexA + 1;
  if (neighbor < 0 || neighbor >= count) {
    target.indexB = indexA;
    target.blend = 0;
    return target;
  }
  target.indexB = neighbor;
  target.blend = 0.5 * (1 - edgeDistance / BIOME_BORDER_WIDTH);
  return target;
}

/** The single biome row a blade rooted at (x, z) belongs to. */
export function pickGrassBiomeIndex(
  x: number,
  z: number,
  sample: GrassBiomeSample,
): number {
  if (sample.blend <= 0 || sample.indexA === sample.indexB) {
    return sample.indexA;
  }
  return positionHash(x, z, BIOME_PICK_SEED) < sample.blend
    ? sample.indexB
    : sample.indexA;
}

/**
 * Relative coverage at this position. Lerped rather than picked so bare ground
 * ramps smoothly across a border even where the species themselves interleave.
 */
export function resolveGrassBiomeDensity(sample: GrassBiomeSample): number {
  const densityA = GRASS_BIOME_PROFILES[sample.indexA].density;
  if (sample.blend <= 0 || sample.indexA === sample.indexB) {
    return densityA;
  }
  const densityB = GRASS_BIOME_PROFILES[sample.indexB].density;
  return densityA + (densityB - densityA) * sample.blend;
}

export function resolveGrassBiomeProfileAt(
  x: number,
  z: number,
): GrassBiomeProfile {
  const sample = sampleGrassBiome(x, z);
  return GRASS_BIOME_PROFILES[pickGrassBiomeIndex(x, z, sample)];
}
