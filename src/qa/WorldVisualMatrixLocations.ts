import { WORLD_SUN_DIRECTION } from "../app/WorldEnvironmentTuning";
import {
  createHydrologySample,
  type HydrologySample,
} from "../world/hydrology/HydrologyField";
import {
  pickGrassBiomeIndex,
  sampleGrassBiome,
} from "../world/grass/WorldBiomeField";
import { sampleStoneGrassClearance } from "../world/stones/StoneClearance";
import type { TerrainField } from "../world/TerrainField";

export interface WorldVisualPoint {
  x: number;
  y: number;
  z: number;
  waterDepth: number;
  waterCoverage: number;
  riverCoverage: number;
  lakeCoverage: number;
  flowX: number;
  flowZ: number;
  moisture: number;
  fertility: number;
  exposure: number;
  rockiness: number;
  disturbance: number;
  slope: number;
  pathMask: number;
  stoneClearance: number;
  /**
   * Clearance re-probed with a wide radius. Plain `stoneClearance` only reads
   * below 1 directly under a footprint, and footprints are metres across while
   * this search steps 16 m — so no pose could ever be aimed at a stone
   * formation, and the stone plan's visual review had nothing to look at.
   */
  stoneVicinity: number;
  waterProximity: number;
  biomeIndex: number;
  riverMorphology: number;
  riverBend: number;
  riverLateral: number;
  riverFallDrop: number;
  riverFallStep: number;
}

export interface WorldVisualLocations {
  meadow: WorldVisualPoint;
  waterEdge: WorldVisualPoint;
  pathEdge: WorldVisualPoint;
  rocky: WorldVisualPoint;
  stoneFormation: WorldVisualPoint;
  slope: WorldVisualPoint;
  dry: WorldVisualPoint;
  steppe: WorldVisualPoint;
  alpine: WorldVisualPoint;
  riverShallow: WorldVisualPoint;
  riverMedium: WorldVisualPoint;
  lakeDeep: WorldVisualPoint;
  shore: WorldVisualPoint;
  wetBank: WorldVisualPoint;
  stoneWake: WorldVisualPoint;
  kneeDeep: WorldVisualPoint;
  waistDeep: WorldVisualPoint;
  riverPool: WorldVisualPoint;
  riverRiffle: WorldVisualPoint;
  riverStraight: WorldVisualPoint;
  riverInsideBend: WorldVisualPoint;
  riverOutsideBend: WorldVisualPoint;
  waterfall: WorldVisualPoint;
}

const SEARCH_RADIUS = 480;
/**
 * Wide enough that a 16 m search step cannot step over a formation, and small
 * enough that neighbouring clusters do not merge into one indistinct blob.
 */
const STONE_VICINITY_PROBE_RADIUS = 9;
/**
 * Covers the coarse grid's worst-case miss, stepped fine enough to hit a
 * footprint. A clearing disc is only about a metre across for a mid-sized
 * stone, so a 2 m step walks straight over most of them and the refinement
 * finds nothing.
 */
const STONE_REFINE_SPAN = 14;
const STONE_REFINE_STEP = 0.75;

const SEARCH_STEP = 16;
const SUN_HORIZONTAL = Math.hypot(WORLD_SUN_DIRECTION[0], WORLD_SUN_DIRECTION[2]);
export const WORLD_SUN_XZ = {
  x: WORLD_SUN_DIRECTION[0] / SUN_HORIZONTAL,
  z: WORLD_SUN_DIRECTION[2] / SUN_HORIZONTAL,
};

interface ScoredPoint {
  point: WorldVisualPoint;
  score: number;
}

/**
 * Deterministic nearby landmarks for the AAA visual-matrix captures.
 * Samples around the current streaming focus; identity is seed-stable.
 */
export async function findWorldVisualLocations(
  field: TerrainField,
  originX: number,
  originZ: number,
): Promise<WorldVisualLocations> {
  const hydrology = createHydrologySample();
  const best: Record<keyof WorldVisualLocations, ScoredPoint | undefined> = {
    meadow: undefined,
    waterEdge: undefined,
    pathEdge: undefined,
    rocky: undefined,
    stoneFormation: undefined,
    slope: undefined,
    dry: undefined,
    steppe: undefined,
    alpine: undefined,
    riverShallow: undefined,
    riverMedium: undefined,
    lakeDeep: undefined,
    shore: undefined,
    wetBank: undefined,
    stoneWake: undefined,
    kneeDeep: undefined,
    waistDeep: undefined,
    riverPool: undefined,
    riverRiffle: undefined,
    riverStraight: undefined,
    riverInsideBend: undefined,
    riverOutsideBend: undefined,
    waterfall: undefined,
  };

  for (let z = originZ - SEARCH_RADIUS; z <= originZ + SEARCH_RADIUS; z += SEARCH_STEP) {
    for (let x = originX - SEARCH_RADIUS; x <= originX + SEARCH_RADIUS; x += SEARCH_STEP) {
      const point = samplePoint(field, x, z, hydrology);
      consider(best, "meadow", point, meadowScore(point));
      consider(best, "waterEdge", point, waterEdgeScore(point));
      consider(best, "pathEdge", point, pathScore(point));
      consider(best, "rocky", point, rockyScore(point));
      consider(best, "stoneFormation", point, stoneFormationScore(point));
      consider(best, "slope", point, slopeScore(point));
      consider(best, "dry", point, dryScore(point));
      consider(best, "steppe", point, steppeScore(point));
      consider(best, "alpine", point, alpineScore(point));
      consider(best, "riverShallow", point, riverShallowScore(point));
      consider(best, "riverMedium", point, riverMediumScore(point));
      consider(best, "lakeDeep", point, lakeDeepScore(point));
      consider(best, "shore", point, shoreScore(point));
      consider(best, "wetBank", point, wetBankScore(point));
      consider(best, "stoneWake", point, stoneWakeScore(point));
      consider(best, "kneeDeep", point, kneeDeepScore(point));
      consider(best, "waistDeep", point, waistDeepScore(point));
      consider(best, "riverPool", point, riverPoolScore(point));
      consider(best, "riverRiffle", point, riverRiffleScore(point));
      consider(best, "riverStraight", point, riverStraightScore(point));
      consider(best, "riverInsideBend", point, riverInsideBendScore(point));
      consider(best, "riverOutsideBend", point, riverOutsideBendScore(point));
      consider(best, "waterfall", point, waterfallScore(point));
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  const origin = samplePoint(field, originX, originZ, hydrology);
  const stoneFormation = best.stoneFormation
    ? refineStoneFormation(field, best.stoneFormation.point, hydrology)
    : undefined;
  return {
    meadow: best.meadow?.point ?? origin,
    waterEdge:
      best.waterEdge?.point ?? best.wetBank?.point ?? best.shore?.point ?? origin,
    pathEdge: best.pathEdge?.point ?? origin,
    rocky: best.rocky?.point ?? origin,
    stoneFormation: stoneFormation ?? best.rocky?.point ?? origin,
    slope: best.slope?.point ?? origin,
    dry: best.dry?.point ?? best.steppe?.point ?? origin,
    steppe: best.steppe?.point ?? best.dry?.point ?? origin,
    alpine: best.alpine?.point ?? best.slope?.point ?? origin,
    riverShallow:
      best.riverShallow?.point ??
      best.kneeDeep?.point ??
      best.riverMedium?.point ??
      origin,
    riverMedium: best.riverMedium?.point ?? best.riverShallow?.point ?? origin,
    lakeDeep: best.lakeDeep?.point ?? best.riverMedium?.point ?? origin,
    shore: best.shore?.point ?? best.wetBank?.point ?? best.waterEdge?.point ?? origin,
    wetBank: best.wetBank?.point ?? best.shore?.point ?? best.waterEdge?.point ?? origin,
    stoneWake: best.stoneWake?.point ?? best.riverMedium?.point ?? origin,
    kneeDeep: best.kneeDeep?.point ?? best.riverShallow?.point ?? origin,
    waistDeep: best.waistDeep?.point ?? best.riverMedium?.point ?? origin,
    riverPool:
      best.riverPool?.point ?? best.riverMedium?.point ?? best.waistDeep?.point ?? origin,
    riverRiffle:
      best.riverRiffle?.point ??
      best.riverShallow?.point ??
      best.kneeDeep?.point ??
      origin,
    riverStraight:
      best.riverStraight?.point ?? best.riverMedium?.point ?? origin,
    riverInsideBend:
      best.riverInsideBend?.point ?? best.riverMedium?.point ?? origin,
    riverOutsideBend:
      best.riverOutsideBend?.point ?? best.riverMedium?.point ?? origin,
    waterfall: best.waterfall?.point ?? best.riverMedium?.point ?? origin,
  };
}

function samplePoint(
  field: TerrainField,
  x: number,
  z: number,
  hydrology: HydrologySample,
): WorldVisualPoint {
  const y = field.sampleHeight(x, z);
  field.sampleHydrology(x, z, y, hydrology);
  const ecologySample = field.sampleEcologyAt(x, z, y);
  const landform = field.sampleLandform(x, z, {
    convexity: 0,
    slope: 0,
    gradientX: 0,
    gradientZ: 0,
  });
  const biome = sampleGrassBiome(x, z);
  return {
    x,
    y,
    z,
    waterDepth: Math.max(0, hydrology.waterLevel - y),
    waterCoverage: hydrology.waterCoverage,
    riverCoverage: hydrology.riverCoverage,
    lakeCoverage: hydrology.lakeCoverage,
    flowX: hydrology.flowX,
    flowZ: hydrology.flowZ,
    moisture: ecologySample.moisture,
    fertility: ecologySample.fertility,
    exposure: ecologySample.exposure,
    rockiness: ecologySample.rockiness,
    disturbance: ecologySample.disturbance,
    slope: landform.slope,
    pathMask: field.samplePathGrassMask(x, z, y),
    stoneClearance: sampleStoneGrassClearance(x, z),
    stoneVicinity: sampleStoneGrassClearance(x, z, STONE_VICINITY_PROBE_RADIUS),
    waterProximity: hydrology.waterProximity,
    biomeIndex: pickGrassBiomeIndex(x, z, biome),
    riverMorphology: hydrology.riverMorphology,
    riverBend: hydrology.riverBend,
    riverLateral: hydrology.riverLateral,
    riverFallDrop: hydrology.riverFallDrop,
    riverFallStep: hydrology.riverFallStep,
  };
}

/**
 * The coarse pass can only say "a formation is within the probe radius", which
 * on a 16 m grid leaves the winning point up to ~11 m off the stones — far
 * enough that a 9 m pose frames the meadow beside them. Re-probe at 2 m with no
 * extra radius, so the peak sits on a footprint and the pose lands on the rock.
 */
function refineStoneFormation(
  field: TerrainField,
  coarse: WorldVisualPoint,
  hydrology: HydrologySample,
): WorldVisualPoint {
  let bestPoint = coarse;
  let bestScore = 0;
  let bestX = coarse.x;
  let bestZ = coarse.z;
  for (
    let z = coarse.z - STONE_REFINE_SPAN;
    z <= coarse.z + STONE_REFINE_SPAN;
    z += STONE_REFINE_STEP
  ) {
    for (
      let x = coarse.x - STONE_REFINE_SPAN;
      x <= coarse.x + STONE_REFINE_SPAN;
      x += STONE_REFINE_STEP
    ) {
      // Standing on a footprint decides it; how much other stone is nearby
      // breaks ties, so the pose settles on a cluster's anchor rather than on
      // whichever lone verge pebble the coarse pass happened to sit beside.
      const score =
        (1 - sampleStoneGrassClearance(x, z)) +
        (1 - sampleStoneGrassClearance(x, z, STONE_VICINITY_PROBE_RADIUS)) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestZ = z;
      }
    }
  }
  if (bestScore > 0) {
    bestPoint = samplePoint(field, bestX, bestZ, hydrology);
  }
  return bestPoint;
}

function consider(
  best: Record<keyof WorldVisualLocations, ScoredPoint | undefined>,
  key: keyof WorldVisualLocations,
  point: WorldVisualPoint,
  score: number,
): void {
  if (score <= 0) {
    return;
  }
  const current = best[key];
  if (!current || score > current.score) {
    best[key] = { point, score };
  }
}

function meadowScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.08 || point.pathMask < 0.72) return 0;
  return (
    (1 - point.rockiness) * 0.35 +
    point.moisture * 0.25 +
    (1 - point.disturbance) * 0.2 +
    (1 - point.slope) * 0.2
  );
}

function waterEdgeScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.28 || point.waterProximity < 0.32) return 0;
  return point.waterProximity * (1 - point.waterCoverage) * (0.4 + point.pathMask);
}

function pathScore(point: WorldVisualPoint): number {
  if (point.pathMask > 0.62 || point.waterCoverage > 0.2) return 0;
  return (1 - point.pathMask) * (1 - point.waterCoverage);
}

function rockyScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.2) return 0;
  return point.rockiness * 0.65 + (1 - point.stoneClearance) * 0.35;
}

/**
 * Aims a pose at a real stone formation. Ranked by how much clearing stone is
 * within the probe radius, so the anchor of a composed cluster wins over a lone
 * verge pebble, and grass-free ground is preferred so the stones are not buried.
 */
function stoneFormationScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.15 || point.stoneVicinity >= 1) {
    return 0;
  }
  return (1 - point.stoneVicinity) * (0.7 + point.rockiness * 0.3);
}

function slopeScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.18 || point.slope < 0.1) return 0;
  return point.slope * (1 - point.waterCoverage);
}

function dryScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.12 || point.moisture > 0.52) return 0;
  return (
    (1 - point.moisture) * 0.5 +
    point.exposure * 0.2 +
    point.rockiness * 0.2 +
    point.slope * 0.1
  );
}

function steppeScore(point: WorldVisualPoint): number {
  if (point.biomeIndex !== 1 || point.waterCoverage > 0.15) return 0;
  return 0.55 + (1 - point.moisture) * 0.3 + point.exposure * 0.15;
}

function alpineScore(point: WorldVisualPoint): number {
  if (point.biomeIndex !== 2 || point.waterCoverage > 0.15) return 0;
  return 0.55 + point.slope * 0.25 + (1 - point.moisture) * 0.2;
}

function riverShallowScore(point: WorldVisualPoint): number {
  if (point.riverCoverage < 0.28 || point.waterDepth < 0.08 || point.waterDepth > 1.15) {
    return 0;
  }
  return point.riverCoverage * (1 - Math.abs(point.waterDepth - 0.4));
}

function riverMediumScore(point: WorldVisualPoint): number {
  if (point.riverCoverage < 0.28 || point.waterDepth < 0.7 || point.waterDepth > 2.8) {
    return 0;
  }
  return point.riverCoverage * (1 - Math.abs(point.waterDepth - 1.5) / 1.5);
}

function lakeDeepScore(point: WorldVisualPoint): number {
  if (point.lakeCoverage < 0.32 || point.waterDepth < 1.8) return 0;
  return point.lakeCoverage * Math.min(point.waterDepth / 6, 1);
}

function shoreScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.22 || point.waterProximity < 0.55) return 0;
  return point.waterProximity * (1 - point.waterCoverage);
}

function wetBankScore(point: WorldVisualPoint): number {
  if (point.waterCoverage > 0.18 || point.waterProximity < 0.72) return 0;
  return point.waterProximity * (0.7 + point.moisture * 0.3);
}

function stoneWakeScore(point: WorldVisualPoint): number {
  if (point.waterCoverage < 0.22 || point.stoneClearance > 0.72) return 0;
  return point.waterCoverage * (1 - point.stoneClearance) * (0.4 + point.riverCoverage);
}

function kneeDeepScore(point: WorldVisualPoint): number {
  if (point.waterCoverage < 0.32 || point.waterDepth < 0.22 || point.waterDepth > 0.75) {
    return 0;
  }
  return point.waterCoverage * (1 - Math.abs(point.waterDepth - 0.45));
}

function waistDeepScore(point: WorldVisualPoint): number {
  if (point.waterCoverage < 0.35 || point.waterDepth < 0.6 || point.waterDepth > 1.5) {
    return 0;
  }
  return point.waterCoverage * (1 - Math.abs(point.waterDepth - 1) / 0.5);
}

function riverPoolScore(point: WorldVisualPoint): number {
  if (
    point.riverCoverage < 0.35 ||
    point.riverMorphology < 0.5 ||
    point.waterDepth < 0.7 ||
    point.lakeCoverage > 0.45
  ) {
    return 0;
  }
  return (
    point.riverCoverage * 0.35 +
    point.riverMorphology * 0.4 +
    Math.min(point.waterDepth / 2.4, 1) * 0.25
  );
}

function riverRiffleScore(point: WorldVisualPoint): number {
  if (
    point.riverCoverage < 0.35 ||
    point.riverMorphology > -0.5 ||
    point.waterDepth < 0.08 ||
    point.lakeCoverage > 0.45
  ) {
    return 0;
  }
  return (
    point.riverCoverage * 0.45 +
    -point.riverMorphology * 0.4 +
    (1 - Math.min(point.waterDepth / 2.4, 1)) * 0.15
  );
}

function riverStraightScore(point: WorldVisualPoint): number {
  if (
    point.riverCoverage < 0.35 ||
    Math.abs(point.riverBend) > 0.08 ||
    Math.abs(point.riverMorphology) > 0.25
  ) {
    return 0;
  }
  return (
    point.riverCoverage *
    (1 - Math.abs(point.riverBend) / 0.08) *
    (1 - Math.abs(point.riverMorphology) / 0.25)
  );
}

function riverInsideBendScore(point: WorldVisualPoint): number {
  const absLateral = Math.abs(point.riverLateral);
  if (
    point.riverCoverage < 0.2 ||
    Math.abs(point.riverBend) < 0.45 ||
    absLateral < 0.4 ||
    absLateral > 0.8 ||
    Math.sign(point.riverLateral) !== Math.sign(point.riverBend)
  ) {
    return 0;
  }
  return point.riverCoverage * Math.abs(point.riverBend) * (1 - Math.abs(absLateral - 0.6));
}

function riverOutsideBendScore(point: WorldVisualPoint): number {
  const absLateral = Math.abs(point.riverLateral);
  if (
    point.riverCoverage < 0.2 ||
    Math.abs(point.riverBend) < 0.45 ||
    absLateral < 0.4 ||
    absLateral > 0.8 ||
    Math.sign(point.riverLateral) === Math.sign(point.riverBend)
  ) {
    return 0;
  }
  return point.riverCoverage * Math.abs(point.riverBend) * (1 - Math.abs(absLateral - 0.6));
}

/**
 * Somewhere in the plunge reach below a knickpoint, looking back at it. The
 * face itself is only a few metres long, so a 16 m search grid steps clean over
 * it; the settled reach below is tens of metres and always gets sampled.
 */
function waterfallScore(point: WorldVisualPoint): number {
  if (point.riverFallDrop <= 0 || point.riverCoverage < 0.2) return 0;
  const settled = point.riverFallStep / point.riverFallDrop;
  if (settled < 0.75) return 0;
  return point.riverFallDrop * settled;
}
