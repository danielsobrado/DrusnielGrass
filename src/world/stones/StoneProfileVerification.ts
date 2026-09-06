import {
  buildStonePlanes,
  PROFILE_GROUND_CLEARANCE,
  type StonePlane,
} from "./StoneClipper";
import { resolveStoneProfileHeights } from "./StoneProfile";
import { resolveStoneRecipe, STONE_ARCHETYPE_IDS } from "./StoneRecipe";

const SEEDS_PER_ARCHETYPE = 120;
const PLANE_TOLERANCE = 2e-5;
const MINIMUM_HEIGHT_GAP = 0.059;

function fail(message: string): never {
  throw new Error(`[stones-profile] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function planeDistance(
  plane: StonePlane,
  x: number,
  y: number,
  z: number,
): number {
  return plane.nx * x + plane.ny * y + plane.nz * z - plane.constant;
}

/** Ensures the clipper consumes the same effective ring profile the scorer sees. */
export function verifyStoneProfiles(): string {
  let profilesChecked = 0;
  let capstonesChecked = 0;
  let capstoneUpperRatio = 0;
  let capstoneUpperSamples = 0;
  let weatheredUpperRatio = 0;
  let weatheredUpperSamples = 0;
  let groundedPlanes = 0;
  let boulderBodyTurnProfiles = 0;
  let boulderBodyTurnGaps = 0;
  let boulderBodyTurnPlanes = 0;

  for (const archetype of STONE_ARCHETYPE_IDS) {
    for (let seed = 0; seed < SEEDS_PER_ARCHETYPE; seed += 1) {
      const recipe = resolveStoneRecipe(archetype, seed);
      const rings = recipe.profileRings;
      assert(rings.length === 5, `${archetype}:${seed} must have five profile rings.`);
      const planes = buildStonePlanes(recipe);
      const planesById = new Map(planes.map((plane) => [plane.id, plane]));
      const isCapstone = recipe.silhouetteVariant === "capstone";
      const hasBoulderBodyTurn = archetype === "boulder";
      if (hasBoulderBodyTurn) boulderBodyTurnProfiles += 1;
      if (isCapstone) {
        capstonesChecked += 1;
        const topPlanes = planes.filter((plane) => plane.role === "top");
        const roofBreakAngle =
          topPlanes.length === 2
            ? Math.acos(
                Math.min(
                  1,
                  Math.max(
                    -1,
                    topPlanes[0].nx * topPlanes[1].nx +
                      topPlanes[0].ny * topPlanes[1].ny +
                      topPlanes[0].nz * topPlanes[1].nz,
                  ),
                ),
              )
            : Number.POSITIVE_INFINITY;
        assert(
          archetype === "boulder" || archetype === "slab" || archetype === "outcrop",
          `${archetype}:${seed} selected an unsupported capstone silhouette.`,
        );
        assert(
          recipe.topBevelHeight <= 0.150001 &&
            topPlanes.length === 2 &&
            roofBreakAngle <= 0.2,
          `${archetype}:${seed} capstone lost its short bevel or shallow paired roof.`,
        );
      }

      for (let side = 0; side < recipe.sideAngles.length; side += 1) {
        const heights = resolveStoneProfileHeights(rings, side);
        assert(
          heights.length === rings.length,
          `${archetype}:${seed}:${side} profile height count changed.`,
        );
        for (let ring = 0; ring < rings.length; ring += 1) {
          assert(
            rings[ring].radii.length === recipe.sideAngles.length &&
              rings[ring].heightOffsets.length === recipe.sideAngles.length,
            `${archetype}:${seed}:${ring} profile ring width is inconsistent.`,
          );
          assert(
            Number.isFinite(heights[ring]),
            `${archetype}:${seed}:${side}:${ring} has a non-finite height.`,
          );
          if (ring > 0) {
            assert(
              heights[ring] - heights[ring - 1] >= MINIMUM_HEIGHT_GAP,
              `${archetype}:${seed}:${side} profile rings collapsed vertically.`,
            );
            if (hasBoulderBodyTurn) boulderBodyTurnGaps += 1;
          }
        }

        const angle = recipe.sideAngles[side];
        const directionX = Math.cos(angle);
        const directionZ = Math.sin(angle);
        if (archetype === "boulder" || archetype === "slab" || archetype === "outcrop") {
          const shoulder = rings[rings.length - 3];
          const top = rings[rings.length - 1];
          const shoulderSupport =
            shoulder.radii[side] +
            directionX * shoulder.centerX +
            directionZ * shoulder.centerZ;
          const topSupport =
            top.radii[side] +
            directionX * top.centerX +
            directionZ * top.centerZ;
          if (isCapstone) {
            capstoneUpperRatio += topSupport / shoulderSupport;
            capstoneUpperSamples += 1;
          } else {
            weatheredUpperRatio += topSupport / shoulderSupport;
            weatheredUpperSamples += 1;
          }
        }
        for (let segment = 0; segment < rings.length - 1; segment += 1) {
          const plane = planesById.get(`profile:${segment}:${side}`);
          assert(
            plane !== undefined,
            `${archetype}:${seed}:${side}:${segment} profile plane is missing.`,
          );
          const lower = rings[segment];
          const upper = rings[segment + 1];
          const lowerX = lower.centerX + directionX * lower.radii[side];
          const lowerZ = lower.centerZ + directionZ * lower.radii[side];
          const upperX = upper.centerX + directionX * upper.radii[side];
          const upperZ = upper.centerZ + directionZ * upper.radii[side];
          const lowerSigned = planeDistance(
            plane,
            lowerX,
            heights[segment],
            lowerZ,
          );
          const upperSigned = planeDistance(
            plane,
            upperX,
            heights[segment + 1],
            upperZ,
          );
          // A plane may never pass inside its own ring points; that is the
          // clipper silently eating authored mass and is always a bug.
          assert(
            lowerSigned <= PLANE_TOLERANCE &&
              upperSigned <= PLANE_TOLERANCE,
            `${archetype}:${seed}:${side}:${segment} plane cuts inside the profile (${lowerSigned}/${upperSigned}).`,
          );
          // Outward divergence is legitimate in exactly one case: the clipper
          // grounds a segment whose downward extrapolation would slice the
          // contact polygon away. Such a plane is pushed out to tangency with
          // ring 0 and stops cutting. Anything else must match the profile.
          const contactSupport =
            rings[0].radii[side] +
            directionX * rings[0].centerX +
            directionZ * rings[0].centerZ;
          // The stored plane is normalized, which rescales `constant`. The
          // horizontal part of the profile normal was unit before that, so
          // dividing by it recovers the support the profile authored.
          const horizontal = Math.hypot(plane.nx, plane.nz);
          const groundSupport =
            horizontal > 1e-9 ? plane.constant / horizontal : plane.constant;
          const grounded =
            segment > 0 &&
            Math.abs(
              groundSupport - (contactSupport + PROFILE_GROUND_CLEARANCE),
            ) <= PLANE_TOLERANCE;
          assert(
            grounded ||
              (Math.abs(lowerSigned) <= PLANE_TOLERANCE &&
                Math.abs(upperSigned) <= PLANE_TOLERANCE),
            `${archetype}:${seed}:${side}:${segment} plane diverges from profile without grounding (${lowerSigned}/${upperSigned}).`,
          );
          if (grounded) groundedPlanes += 1;
          if (hasBoulderBodyTurn) boulderBodyTurnPlanes += 1;
        }
      }
      profilesChecked += 1;
    }
  }

  assert(capstonesChecked > 0, "Capstone silhouette family was not exercised.");
  assert(
    boulderBodyTurnProfiles === SEEDS_PER_ARCHETYPE &&
      boulderBodyTurnGaps > 0 &&
      boulderBodyTurnPlanes > 0,
    "Boulder body-turn profiles did not receive ring-gap and profile-plane coverage.",
  );
  const averageCapstoneUpperRatio = capstoneUpperRatio / capstoneUpperSamples;
  const averageWeatheredUpperRatio = weatheredUpperRatio / weatheredUpperSamples;
  assert(
    capstoneUpperSamples > 0 &&
      weatheredUpperSamples > 0 &&
      averageCapstoneUpperRatio >= averageWeatheredUpperRatio + 0.08,
    `Capstone roofs must remain materially broader than weathered roofs (${averageCapstoneUpperRatio.toFixed(3)} vs ${averageWeatheredUpperRatio.toFixed(3)}).`,
  );

  return `${profilesChecked} layered profiles · ${capstonesChecked} capstones · ${groundedPlanes} grounded`;
}
