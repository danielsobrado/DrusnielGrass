import * as THREE from "three";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
import type { TerrainLandform } from "./TerrainLandformField";
import type { HydrologySample } from "../hydrology/HydrologyField";
import type { WorldConfig } from "../WorldConfig";
import {
  ECOLOGY_ALPINE_FADE,
  ECOLOGY_BASE_RAINFALL,
  ECOLOGY_CANOPY_EXPOSURE_LOSS,
  ECOLOGY_CANOPY_LITTER_FERTILITY,
  ECOLOGY_CANOPY_MULCH_RETENTION,
  ECOLOGY_CURVATURE_DRY,
  ECOLOGY_CURVATURE_WET,
  ECOLOGY_EXPOSURE_AMBIENT,
  ECOLOGY_EXPOSURE_DRY,
  ECOLOGY_EXPOSURE_WET,
  ECOLOGY_FERTILITY_CEILING,
  ECOLOGY_FERTILITY_DISTURBANCE,
  ECOLOGY_FERTILITY_FLOOR,
  ECOLOGY_FERTILITY_MOISTURE_EXPONENT,
  ECOLOGY_ROCK_CONVEXITY,
  ECOLOGY_ROCK_SLOPE_FULL,
  ECOLOGY_ROCK_SLOPE_START,
  ECOLOGY_ROCK_SOIL_BURIAL,
  ECOLOGY_SLOPE_SHED,
  ECOLOGY_WATER_SUPPLY,
} from "./WorldEcologyTuning";

/**
 * The world's ecological state at a point.
 *
 * This is the layer everything visible is supposed to be derived from — ground
 * colour, grass density and height, stone exposure, and later flowers and
 * litter. The point of routing them all through one sampler is not tidiness: it
 * is that a landscape reads as real when its features agree with each other,
 * and features can only agree if they are consequences of the same cause. A
 * stone-strewn patch that is also the dry, sun-facing, thin-soiled patch looks
 * deliberate; the same stones scattered independently look like scatter.
 *
 * Every value is a pure function of world position and the terrain seed, so the
 * field is identical at every LOD and on every machine. Nothing here is
 * simulated over time or accumulated between frames.
 */
export interface WorldEcologySample {
  /** Water available to plants, after landform, slope, and sun have had their say. */
  moisture: number;
  /** Soil depth and richness: what has come to rest and stayed. */
  fertility: number;
  /** Insolation from surface aspect against the world sun. */
  exposure: number;
  /** Trampling and traffic; 1 on a bare tread, 0 in untouched country. */
  disturbance: number;
  /** Exposed stone and gravel at the surface. */
  rockiness: number;
  /**
   * Sky blocked by whatever stands over this point, from crowns and nothing
   * else.
   *
   * Distinct from a low `exposure`, and the distinction is the point. A
   * shaded aspect is open ground that happens to face away from the sun; it
   * still catches rain and receives nothing from above. Ground under a crown
   * is sheltered, mulched, and continuously fed litter, and the plants that
   * win there — ferns, broadleaf rosettes — are not the plants that win on a
   * cool slope. Keeping this its own channel is what lets the accent layer
   * tell those two habitats apart.
   */
  shade: number;
}

export function createEcologySample(): WorldEcologySample {
  return {
    moisture: 0,
    fertility: 0,
    exposure: 0,
    disturbance: 0,
    rockiness: 0,
    shade: 0,
  };
}

const SUN = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

/**
 * Derives ecology from terrain, hydrology, and traffic.
 *
 * Deliberately takes its inputs rather than sampling them: the callers that
 * matter — terrain chunk vertices, grass placement, stone placement — already
 * hold the height, hydrology, and traffic for the point they are working on,
 * and re-sampling them here would triple the cost of the hot paths this layer
 * is meant to feed. Measured, removing that duplication took the ecology's cost
 * on a terrain vertex from +44% to +11%.
 */
export class WorldEcologyField {
  private readonly alpineStart: number;
  private readonly alpineEnd: number;

  constructor(config: WorldConfig) {
    const ceiling = config.grassMaxAltitude;
    this.alpineEnd = ceiling;
    this.alpineStart = ceiling - Math.abs(ceiling) * ECOLOGY_ALPINE_FADE - 20;
  }

  sample(
    height: number,
    landform: TerrainLandform,
    hydrology: HydrologySample,
    pathGrassMask: number,
    canopyShade: number,
    target: WorldEcologySample,
  ): WorldEcologySample {
    const slope = clamp01(landform.slope);
    const canopy = clamp01(canopyShade);
    target.shade = canopy;
    const convexity = clamp01(landform.convexity);
    const concavity = clamp01(-landform.convexity);

    // Insolation from the landform's own facing, reconstructed from its
    // gradient. The renderer's normal would answer a different question — how
    // this square metre catches light — and its micro-noise would speckle every
    // field derived from it.
    const inverseLength =
      1 /
      Math.sqrt(
        landform.gradientX * landform.gradientX +
          landform.gradientZ * landform.gradientZ +
          1,
      );
    //
    // A crown then takes back most of what the aspect delivers. It multiplies
    // rather than subtracts for the same reason every other term here does:
    // shade cannot create sunlight, and a dim northern face under a tree has to
    // stay dimmer than either cause alone would make it.
    target.exposure = clamp01(
      (ECOLOGY_EXPOSURE_AMBIENT +
        (1 - ECOLOGY_EXPOSURE_AMBIENT) *
          clamp01(
            (-landform.gradientX * SUN.x +
              SUN.y +
              -landform.gradientZ * SUN.z) *
              inverseLength,
          )) *
        (1 - ECOLOGY_CANOPY_EXPOSURE_LOSS * canopy),
    );
    target.disturbance = clamp01(1 - pathGrassMask);

    // Retention first: the share of any water arriving here that stays long
    // enough to matter. Slope sheds it, sun takes it back, and litter under a
    // crown holds on to what is left — the mulch term is separate from the
    // exposure the crown already cost, because shading the ground and covering
    // it are two different favours.
    const retention =
      (1 - ECOLOGY_SLOPE_SHED * slope) *
      lerp(ECOLOGY_EXPOSURE_WET, ECOLOGY_EXPOSURE_DRY, target.exposure) *
      (1 + ECOLOGY_CANOPY_MULCH_RETENTION * canopy);

    // Supply has two independent sources, so it takes the larger rather than
    // the sum: standing beside a river does not stack with sitting in a hollow.
    const gathering = lerp(
      ECOLOGY_CURVATURE_DRY,
      ECOLOGY_CURVATURE_WET,
      clamp01(0.5 + 0.5 * (concavity - convexity)),
    );
    const mapped =
      Math.max(hydrology.humidityBoost, hydrology.waterProximity) *
      ECOLOGY_WATER_SUPPLY;
    const supply = Math.max(ECOLOGY_BASE_RAINFALL * gathering, mapped);

    const alpineDrying =
      1 - 0.35 * smoothstep(height, this.alpineStart, this.alpineEnd);
    target.moisture = clamp01(supply * retention * alpineDrying);

    // Rock is what is left when nothing covers it. Slope and convexity strip
    // the cover; soil and moisture put it back.
    const stripped = clamp01(
      smoothstep(slope, ECOLOGY_ROCK_SLOPE_START, ECOLOGY_ROCK_SLOPE_FULL) +
        convexity * ECOLOGY_ROCK_CONVEXITY +
        smoothstep(height, this.alpineStart, this.alpineEnd) * 0.55,
    );
    const cover = clamp01(target.moisture * (1 - slope * 0.5));
    target.rockiness = clamp01(
      stripped * (1 - ECOLOGY_ROCK_SOIL_BURIAL * cover),
    );

    // Soil is an accumulation: it needs material to arrive, somewhere level for
    // it to stop, water to hold it, and nothing scraping it away again. A crown
    // supplies the first of those directly — leaf fall is material the open
    // meadow never receives — which is why the ground under a tree is the
    // richest ground in the world and grows what only rich ground grows.
    //
    // The product is then stretched across its own working range. Multiplying
    // four terms that each sit near the middle lands almost everywhere near the
    // middle, which is the same flattening that summing would cause and shows
    // up as a world of uniformly adequate soil. The remap spends the output on
    // the band the inputs actually occupy, so deep loam and thin dirt both read.
    const accumulation =
      Math.pow(target.moisture, ECOLOGY_FERTILITY_MOISTURE_EXPONENT) *
      (1 - target.rockiness) *
      (1 - ECOLOGY_FERTILITY_DISTURBANCE * target.disturbance) *
      lerp(0.45, 1, 1 - slope) *
      lerp(1, ECOLOGY_CANOPY_LITTER_FERTILITY, canopy);
    target.fertility = smoothstep(
      accumulation,
      ECOLOGY_FERTILITY_FLOOR,
      ECOLOGY_FERTILITY_CEILING,
    );

    return target;
  }
}
