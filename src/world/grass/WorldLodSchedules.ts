import type { GrassArtDirection } from "../../grass/GrassArtDirection";
import { GRASS_MID_DENSITY_FALLOFF } from "../../grass/GrassLodTuning";
import type { WorldConfig } from "../WorldConfig";
import {
  DETAIL_FOLIAGE_FADE_DISTANCE,
  DETAIL_FOLIAGE_FADE_TRANSITION,
} from "./WorldDetailFoliageField";

/**
 * Every camera-distance schedule in the renderer, in one place.
 *
 * The meadow's most visible defect was a band crossing the hillside, and its
 * cause was not any one fade being wrong. Six unrelated schedules -- three on
 * the ground, three in the vegetation -- had all been keyed to the grass
 * preset's near (28 m) and mid (54 m) distances. Individually each was smooth
 * and dithered. Stacked on the same two radii they read as one hard edge.
 *
 * Separating them fixes the frame. Keeping them separated is what this registry
 * is for: a seventh schedule added later would otherwise be free to land on an
 * existing edge, and nothing would notice until someone looked at a hillside.
 * `verify-lod-band-separation` reads this list, models the composite response,
 * and refuses a build whose profile steps.
 *
 * Adding a distance-keyed `smoothstep` to a shader without registering it here
 * is a build failure, not a style problem.
 */
export const enum LodScheduleClass {
  /**
   * Changes the mean colour of a pixel that goes on existing. The dangerous
   * class: no amount of stochastic dither hides a ramp between two colours, and
   * two of these overlapping is a visible band by construction.
   */
  MeanAlbedo,
  /** Changes how many blades or cards exist. */
  Coverage,
  /**
   * Changes detail amplitude around a preserved mean. Exempt from separation:
   * the grass micro-detail fade is deliberately shared by all five near and mid
   * layers, because giving each its own schedule is what produced an earlier
   * brightness ring at 6-7 m. What these must prove instead is that their mean
   * really is preserved.
   */
  DetailPreserved,
}

export interface LodSchedule {
  key: string;
  /** Metres at which the transition begins. */
  start: number;
  /** Metres at which it completes. */
  end: number;
  scheduleClass: LodScheduleClass;
  /**
   * True only when the runtime applies `GrassLodBanding` to this schedule.
   * Registry verification must model the shader that actually ships; applying
   * synthetic wander to a raw camera-distance schedule can hide a collision the
   * renderer itself would still draw.
   */
  worldSpaceJitter?: boolean;
  /**
   * True when this schedule's effect on the composite response is cancelled:
   * either a partner layer picks the population up, or the survivors are
   * widened and recoloured to repay the area the thinning gave up.
   *
   * Neutral schedules still belong in the registry -- the composite model has to
   * know they exist to prove they cancel -- but they are exempt from pairwise
   * separation, because two layers handing one population between them at the
   * same radius is the correct design, not a collision.
   */
  neutral: boolean;
  /** The layer that picks this one's population up, where there is one. */
  handoffPartner?: string;
}

/**
 * Resolves the shipped schedule set.
 *
 * Distances come from world config and the active art preset rather than being
 * restated, so the registry cannot describe a world the renderer is not drawing.
 */
export function resolveLodSchedules(
  config: WorldConfig,
  direction: Pick<
    GrassArtDirection,
    "nearDistance" | "midDistance" | "farDistance" | "transitionDistance"
  >,
): readonly LodSchedule[] {
  const transition = direction.transitionDistance;
  return [
    {
      // Segmented blades give way to the one-triangle population that continues
      // outward from the same roots with the same seed salt. Nothing leaves.
      key: "ultra-near-detail",
      start:
        config.grassUltraNearDistance - config.grassUltraNearTransitionDistance,
      end:
        config.grassUltraNearDistance + config.grassUltraNearTransitionDistance,
      scheduleClass: LodScheduleClass.Coverage,
      neutral: true,
      handoffPartner: "near-density-boost",
    },
    {
      // Where the doubled blade population genuinely ends. One of the few
      // schedules that removes coverage with nothing standing behind it.
      key: "near-density-boost",
      start:
        config.grassNearDensityBoostDistance -
        config.grassNearDensityBoostTransition,
      end:
        config.grassNearDensityBoostDistance +
        config.grassNearDensityBoostTransition,
      scheduleClass: LodScheduleClass.Coverage,
      neutral: false,
    },
    {
      key: "near-base-to-bridge",
      start:
        config.grassNearBridgeDistance - config.grassNearBridgeTransitionDistance,
      end:
        config.grassNearBridgeDistance + config.grassNearBridgeTransitionDistance,
      scheduleClass: LodScheduleClass.Coverage,
      neutral: true,
      handoffPartner: "near-to-mid",
    },
    {
      key: "near-to-mid",
      start: direction.nearDistance - transition,
      end: direction.nearDistance + transition,
      scheduleClass: LodScheduleClass.Coverage,
      neutral: true,
      handoffPartner: "near-base-to-bridge",
    },
    {
      // Thins the mid population, then widens the survivors and pays the
      // invented coverage back in colour, which is what keeps the field's mean
      // brightness where the LOD parity gate expects it.
      key: "mid-density-falloff",
      start: GRASS_MID_DENSITY_FALLOFF.start,
      end: GRASS_MID_DENSITY_FALLOFF.end,
      scheduleClass: LodScheduleClass.Coverage,
      neutral: true,
    },
    {
      key: "detail-foliage-fade",
      start: DETAIL_FOLIAGE_FADE_DISTANCE - DETAIL_FOLIAGE_FADE_TRANSITION,
      end: DETAIL_FOLIAGE_FADE_DISTANCE + DETAIL_FOLIAGE_FADE_TRANSITION,
      scheduleClass: LodScheduleClass.Coverage,
      worldSpaceJitter: true,
      neutral: false,
    },
    {
      key: "mid-to-far",
      start: direction.midDistance - transition,
      end: direction.midDistance + transition,
      scheduleClass: LodScheduleClass.Coverage,
      neutral: true,
    },
    {
      key: "far-to-terrain",
      start: direction.farDistance - transition,
      end: direction.farDistance + transition,
      scheduleClass: LodScheduleClass.Coverage,
      neutral: false,
    },
    {
      key: "grass-micro-shading",
      start: config.grassMicroDetailFadeStart,
      end: config.grassMicroDetailFadeEnd,
      scheduleClass: LodScheduleClass.DetailPreserved,
      neutral: true,
    },
    {
      key: "terrain-micro-detail",
      start: config.terrainMicroDetailStart,
      end: config.terrainMicroDetailEnd,
      scheduleClass: LodScheduleClass.DetailPreserved,
      worldSpaceJitter: true,
      neutral: true,
    },
    {
      key: "terrain-meso-detail",
      start: config.terrainMesoDetailStart,
      end: config.terrainMesoDetailEnd,
      scheduleClass: LodScheduleClass.DetailPreserved,
      worldSpaceJitter: true,
      neutral: true,
    },
    {
      // The one schedule in the renderer that moves the mean colour of ground
      // that goes on being ground.
      key: "terrain-canopy-merge",
      start: config.terrainCanopyMergeStart,
      end: config.terrainCanopyMergeEnd,
      scheduleClass: LodScheduleClass.MeanAlbedo,
      worldSpaceJitter: true,
      neutral: false,
    },
  ];
}

/** Minimum edge separation, in metres, between two schedules of given classes. */
export function resolveMinimumEdgeSeparation(
  a: LodScheduleClass,
  b: LodScheduleClass,
): number {
  if (
    a === LodScheduleClass.MeanAlbedo &&
    b === LodScheduleClass.MeanAlbedo
  ) {
    return 12;
  }
  if (a === LodScheduleClass.MeanAlbedo || b === LodScheduleClass.MeanAlbedo) {
    return 8;
  }
  // Four metres because that is the width of the window the composite profile
  // is measured over: two edges closer than that land inside one measurement
  // and cannot be told apart from a single steeper step.
  return 4;
}
