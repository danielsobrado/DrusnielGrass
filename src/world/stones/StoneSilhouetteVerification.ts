import { buildStonePolyhedron, type StonePolygon, type StoneVec3 } from "./StoneClipper";
import {
  measureStoneSilhouetteComplexity,
  scoreStoneRotationalSymmetry,
  scoreStoneSilhouette,
} from "./StoneSilhouetteQuality";
import { measureStoneSilhouetteStraightness } from "./StoneSilhouetteStraightness";
import {
  STONE_ARCHETYPE_IDS,
  resolveStoneRecipe,
  type StoneArchetypeId,
  type StoneRecipe,
} from "./StoneRecipe";
import {
  measureStoneMasonryWallScore,
  resolveQualityStoneRecipe,
  scoreStoneShape,
} from "./StoneShapeQuality";

/** Seeds per family. Enough to describe a population, cheap enough to gate on. */
const SEEDS = 40;

/**
 * Recorded ceilings on how radially periodic each family is allowed to be, on
 * average, after selection.
 */
const SYMMETRY_CEILING: Readonly<Record<StoneArchetypeId, number>> = {
  pebble: 0.3,
  slab: 0.22,
  block: 0.16,
  boulder: 0.12,
  shard: 0.1,
  outcrop: 0.08,
};

const SEVERE_SYMMETRY = 0.45;
const SEVERE_SYMMETRY_BUDGET = 0.04;
const SILHOUETTE_FLOOR = -0.2;
const TRANSFORM_SCORE_EPSILON = 1e-4;
/** Outlier ceilings calibrated after shallow roof articulation was introduced. */
const DOMINANT_EDGE_CEILING = 0.34;
const STRAIGHT_CHAIN_CEILING = 0.39;
/** Boulder-only ceilings measured after direction-aware candidate selection. */
const BOULDER_HORIZONTAL_CHAIN_CEILING = 0.34;
const BOULDER_VERTICAL_CHAIN_CEILING = 0.27;
const BOULDER_MASONRY_WALL_CEILING = 0.07;

function percentile(values: readonly number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

function fail(message: string): never {
  throw new Error(`[stone-silhouette] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

/** Mirrors the post-clip transform in generateStoneMesh. */
function shippedBody(recipe: StoneRecipe): StonePolygon[] {
  const body = buildStonePolyhedron(recipe, false);
  const seen = new Set<StoneVec3>();
  for (const polygon of body) {
    for (const point of polygon.points) {
      if (seen.has(point)) continue;
      seen.add(point);
      const shearedX = point.x + recipe.leanX * point.y;
      const shearedZ = point.z + recipe.leanZ * point.y;
      point.x = recipe.width * shearedX;
      point.y = recipe.height * point.y;
      point.z = recipe.depth * shearedZ;
    }
  }
  return body;
}

/** Regression for the scorer bug where post-clip transforms were invisible. */
function verifyPostClipTransformAffectsScore(): void {
  const base = resolveStoneRecipe("boulder", 0x51f0e5);
  const transformed: StoneRecipe = {
    ...base,
    height: base.height * 0.68,
    depth: base.depth * 1.24,
    leanX: base.leanX + 0.21,
    leanZ: base.leanZ - 0.13,
  };
  const delta = Math.abs(scoreStoneShape(transformed) - scoreStoneShape(base));
  assert(
    delta > TRANSFORM_SCORE_EPSILON,
    "Stone quality scoring ignored the post-clip anisotropic scale/shear transform.",
  );
}

/** Population contract plus non-gating diagnostics for outline complexity. */
export function verifyStoneSilhouetteQuality(): string {
  verifyPostClipTransformAffectsScore();

  let silhouetteTotal = 0;
  let rawCornerTotal = 0;
  let meaningfulCornerTotal = 0;
  let maximumMeaningfulCorners = 0;
  let dominantEdgeTotal = 0;
  let dominantEdgeWorst = 0;
  let straightChainTotal = 0;
  let straightChainWorst = 0;
  let horizontalChainTotal = 0;
  let horizontalChainWorst = 0;
  let verticalChainTotal = 0;
  let verticalChainWorst = 0;
  const meanStraightChains: number[] = [];
  const worstStraightChains: number[] = [];
  const boulderMeanHorizontalChains: number[] = [];
  const boulderWorstHorizontalChains: number[] = [];
  const boulderMeanVerticalChains: number[] = [];
  const boulderWorstVerticalChains: number[] = [];
  const boulderMasonryWalls: number[] = [];
  let bodies = 0;
  let severe = 0;

  for (const archetype of STONE_ARCHETYPE_IDS) {
    let symmetryTotal = 0;
    for (let variant = 0; variant < SEEDS; variant += 1) {
      const seed = (variant * 2654435761 + archetype.length * 97) >>> 0;
      const faces = shippedBody(resolveQualityStoneRecipe(archetype, seed));
      const symmetry = scoreStoneRotationalSymmetry(faces);
      const complexity = measureStoneSilhouetteComplexity(faces);
      const straightness = measureStoneSilhouetteStraightness(faces);
      symmetryTotal += symmetry;
      rawCornerTotal += complexity.meanRawCorners;
      meaningfulCornerTotal += complexity.meanMeaningfulCorners;
      maximumMeaningfulCorners = Math.max(
        maximumMeaningfulCorners,
        complexity.maximumMeaningfulCorners,
      );
      dominantEdgeTotal += straightness.meanDominantEdgeShare;
      dominantEdgeWorst = Math.max(
        dominantEdgeWorst,
        straightness.worstDominantEdgeShare,
      );
      straightChainTotal += straightness.meanStraightChainShare;
      straightChainWorst = Math.max(
        straightChainWorst,
        straightness.worstStraightChainShare,
      );
      horizontalChainTotal += straightness.meanHorizontalChainShare;
      horizontalChainWorst = Math.max(
        horizontalChainWorst,
        straightness.worstHorizontalChainShare,
      );
      verticalChainTotal += straightness.meanVerticalChainShare;
      verticalChainWorst = Math.max(
        verticalChainWorst,
        straightness.worstVerticalChainShare,
      );
      meanStraightChains.push(straightness.meanStraightChainShare);
      worstStraightChains.push(straightness.worstStraightChainShare);
      if (archetype === "boulder") {
        boulderMeanHorizontalChains.push(straightness.meanHorizontalChainShare);
        boulderWorstHorizontalChains.push(straightness.worstHorizontalChainShare);
        boulderMeanVerticalChains.push(straightness.meanVerticalChainShare);
        boulderWorstVerticalChains.push(straightness.worstVerticalChainShare);
        boulderMasonryWalls.push(measureStoneMasonryWallScore(faces));
      }
      if (symmetry > SEVERE_SYMMETRY) severe += 1;
      silhouetteTotal += scoreStoneSilhouette(faces);
      bodies += 1;
    }
    const mean = symmetryTotal / SEEDS;
    assert(
      mean <= SYMMETRY_CEILING[archetype],
      `${archetype} averages ${mean.toFixed(3)} rotational symmetry, over its ${SYMMETRY_CEILING[archetype]} ceiling.`,
    );
  }

  const silhouette = silhouetteTotal / bodies;
  assert(
    silhouette >= SILHOUETTE_FLOOR,
    `Population silhouette score fell to ${silhouette.toFixed(3)}, under the ${SILHOUETTE_FLOOR} floor.`,
  );
  assert(
    dominantEdgeWorst <= DOMINANT_EDGE_CEILING,
    `A projected edge occupies ${dominantEdgeWorst.toFixed(3)} of its outline, over the ${DOMINANT_EDGE_CEILING} ceiling.`,
  );
  assert(
    straightChainWorst <= STRAIGHT_CHAIN_CEILING,
    `A projected straight chain occupies ${straightChainWorst.toFixed(3)} of its outline, over the ${STRAIGHT_CHAIN_CEILING} ceiling.`,
  );
  const boulderHorizontalWorst = Math.max(...boulderWorstHorizontalChains);
  const boulderVerticalWorst = Math.max(...boulderWorstVerticalChains);
  const boulderMasonryWorst = Math.max(...boulderMasonryWalls);
  assert(
    boulderHorizontalWorst <= BOULDER_HORIZONTAL_CHAIN_CEILING,
    `A boulder horizontal chain occupies ${boulderHorizontalWorst.toFixed(3)} of its outline, over the ${BOULDER_HORIZONTAL_CHAIN_CEILING} ceiling.`,
  );
  assert(
    boulderVerticalWorst <= BOULDER_VERTICAL_CHAIN_CEILING,
    `A boulder vertical chain occupies ${boulderVerticalWorst.toFixed(3)} of its outline, over the ${BOULDER_VERTICAL_CHAIN_CEILING} ceiling.`,
  );
  assert(
    boulderMasonryWorst <= BOULDER_MASONRY_WALL_CEILING,
    `A boulder masonry wall scored ${boulderMasonryWorst.toFixed(3)}, over the ${BOULDER_MASONRY_WALL_CEILING} ceiling.`,
  );
  const severeShare = severe / bodies;
  assert(
    severeShare <= SEVERE_SYMMETRY_BUDGET,
    `${severe}/${bodies} bodies are severely periodic, over the ${(SEVERE_SYMMETRY_BUDGET * 100).toFixed(0)}% budget.`,
  );

  const boulderHorizontalMean =
    boulderMeanHorizontalChains.reduce((sum, value) => sum + value, 0) /
    boulderMeanHorizontalChains.length;
  const boulderVerticalMean =
    boulderMeanVerticalChains.reduce((sum, value) => sum + value, 0) /
    boulderMeanVerticalChains.length;
  const boulderMasonryMean =
    boulderMasonryWalls.reduce((sum, value) => sum + value, 0) /
    boulderMasonryWalls.length;
  const directionalDiagnostics =
    `direction h ${(horizontalChainTotal / bodies).toFixed(3)}/${horizontalChainWorst.toFixed(3)} ` +
    `v ${(verticalChainTotal / bodies).toFixed(3)}/${verticalChainWorst.toFixed(3)} | ` +
    `boulder h ${boulderHorizontalMean.toFixed(3)}/${percentile(boulderWorstHorizontalChains, 0.9).toFixed(3)}/${boulderHorizontalWorst.toFixed(3)} ` +
    `v ${boulderVerticalMean.toFixed(3)}/${percentile(boulderWorstVerticalChains, 0.9).toFixed(3)}/${boulderVerticalWorst.toFixed(3)} ` +
    `wall ${boulderMasonryMean.toFixed(3)}/${percentile(boulderMasonryWalls, 0.9).toFixed(3)}/${boulderMasonryWorst.toFixed(3)} | `;

  return (
    directionalDiagnostics +
    `silhouette ${silhouette.toFixed(3)} · ${severe}/${bodies} periodic · ` +
    `corners ${(rawCornerTotal / bodies).toFixed(1)}→${(meaningfulCornerTotal / bodies).toFixed(1)} (max ${maximumMeaningfulCorners}) · ` +
    `straight edge ${(dominantEdgeTotal / bodies).toFixed(3)}/${dominantEdgeWorst.toFixed(3)} · ` +
    `chain ${(straightChainTotal / bodies).toFixed(3)}/${straightChainWorst.toFixed(3)} ` +
    `(p90 ${percentile(meanStraightChains, 0.9).toFixed(3)}/${percentile(worstStraightChains, 0.9).toFixed(3)}) · transformed-body guard`
  );
}
