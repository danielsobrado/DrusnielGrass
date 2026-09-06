import { buildStonePolyhedron, type StonePolygon, type StoneVec3 } from "./StoneClipper";
import {
  addStoneFractureRelief,
  STONE_CUT_RELIEF_MAX,
} from "./StoneFractureRelief";
import { calculateStonePolygonAreaAndNormal } from "./StoneMeshTopology";
import { STONE_ARCHETYPE_IDS } from "./StoneRecipe";
import { resolveQualityStoneRecipe } from "./StoneShapeQuality";

const SEEDS_PER_ARCHETYPE = 64;
const DISPLACEMENT_EPSILON = 1e-9;
const EFFECTIVE_RELIEF_EPSILON = 1e-5;
const RELIEF_BOUND_EPSILON = 1e-6;
const MINIMUM_FACE_AREA_RATIO = 0.5;
const MINIMUM_NORMAL_DOT = 0.65;

interface PointSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface FaceSnapshot {
  readonly corners: number;
  readonly area: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
}

function fail(message: string): never {
  throw new Error(`[stone-relief] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function isStructuralCut(face: StonePolygon): boolean {
  return face.role === "cut" && face.planeId.startsWith("cut:");
}

function snapshotPoints(polygons: readonly StonePolygon[]): Map<StoneVec3, PointSnapshot> {
  const points = new Map<StoneVec3, PointSnapshot>();
  for (const polygon of polygons) {
    for (const point of polygon.points) {
      if (!points.has(point)) {
        points.set(point, { x: point.x, y: point.y, z: point.z });
      }
    }
  }
  return points;
}

function snapshotFaces(polygons: readonly StonePolygon[]): FaceSnapshot[] {
  return polygons.map((face) => {
    const [area, normalX, normalY, normalZ] =
      calculateStonePolygonAreaAndNormal(face);
    return {
      corners: face.points.length,
      area,
      normalX,
      normalY,
      normalZ,
    };
  });
}

/** Regression coverage for the post-clip structural-rim deformation pass. */
export function verifyStoneRelief(): string {
  let cutBodies = 0;
  let cutFaces = 0;
  let movedRimPoints = 0;

  for (const archetype of STONE_ARCHETYPE_IDS) {
    for (let variant = 0; variant < SEEDS_PER_ARCHETYPE; variant += 1) {
      const seed = (variant * 2654435761 + archetype.length * 131) >>> 0;
      const recipe = resolveQualityStoneRecipe(archetype, seed);
      const polygons = buildStonePolyhedron(recipe, false);
      const structuralCuts = polygons.filter(isStructuralCut);
      if (structuralCuts.length === 0) continue;

      cutBodies += 1;
      cutFaces += structuralCuts.length;
      const rimPoints = new Set<StoneVec3>();
      for (const face of structuralCuts) {
        for (const point of face.points) rimPoints.add(point);
      }
      const pointsBefore = snapshotPoints(polygons);
      const facesBefore = snapshotFaces(polygons);

      const relieved = addStoneFractureRelief(polygons, recipe);
      assert(
        relieved === polygons && relieved.length === facesBefore.length,
        `${archetype}:${seed} relief changed the polygon container or face count.`,
      );

      for (let index = 0; index < relieved.length; index += 1) {
        const face = relieved[index];
        const before = facesBefore[index];
        assert(
          face.points.length === before.corners,
          `${archetype}:${seed}:${face.planeId} relief changed topology.`,
        );
        const [area, normalX, normalY, normalZ] =
          calculateStonePolygonAreaAndNormal(face);
        assert(
          area >= before.area * MINIMUM_FACE_AREA_RATIO,
          `${archetype}:${seed}:${face.planeId} relief collapsed face area ${before.area.toFixed(6)} -> ${area.toFixed(6)}.`,
        );
        const normalDot =
          normalX * before.normalX +
          normalY * before.normalY +
          normalZ * before.normalZ;
        assert(
          normalDot >= MINIMUM_NORMAL_DOT,
          `${archetype}:${seed}:${face.planeId} relief overturned its face normal (${normalDot.toFixed(3)}).`,
        );
      }

      for (const [point, before] of pointsBefore) {
        const dx = point.x - before.x;
        const dy = point.y - before.y;
        const dz = point.z - before.z;
        const displacement = Math.hypot(dx, dy, dz);
        assert(
          Math.abs(dy) <= DISPLACEMENT_EPSILON,
          `${archetype}:${seed} relief moved a point vertically by ${dy}.`,
        );
        if (!rimPoints.has(point)) {
          assert(
            displacement <= DISPLACEMENT_EPSILON,
            `${archetype}:${seed} relief leaked onto a non-cut point by ${displacement}.`,
          );
          continue;
        }
        assert(
          displacement <= STONE_CUT_RELIEF_MAX + RELIEF_BOUND_EPSILON,
          `${archetype}:${seed} cut relief ${displacement.toFixed(6)} exceeded ${STONE_CUT_RELIEF_MAX}.`,
        );
        if (before.y <= DISPLACEMENT_EPSILON) {
          assert(
            displacement <= DISPLACEMENT_EPSILON,
            `${archetype}:${seed} relief moved a ground-contact point.`,
          );
        } else if (displacement > EFFECTIVE_RELIEF_EPSILON) {
          movedRimPoints += 1;
        }
      }
    }
  }

  assert(cutBodies > 0 && cutFaces > 0, "No accepted structural cuts were exercised.");
  assert(movedRimPoints > 0, "Structural cuts were present but no rim relief was applied.");
  return `${cutBodies} cut bodies · ${cutFaces} cut faces · ${movedRimPoints} relieved rim points`;
}
