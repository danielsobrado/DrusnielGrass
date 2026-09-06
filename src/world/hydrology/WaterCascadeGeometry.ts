import * as THREE from "three";
import type { CascadeSite } from "./WaterCascadeSites";
import {
  CASCADE_SILL_DRY_HEIGHT,
  resolveCascadeSill,
} from "./WaterCascadeSill";
import {
  WATERFALL_FACE_LENGTH,
  WATERFALL_PLUNGE_LENGTH,
} from "./WaterfallTuning";

/**
 * Across the lip and down the fall. Coarse on purpose: a curtain is a simple
 * surface, and its whole reason for existing is to keep a vertical silhouette
 * that the terrain heightfield cannot hold, not to carry detail.
 */
const CASCADE_ACROSS_SEGMENTS = 10;
const CASCADE_DOWN_SEGMENTS = 8;
/** How far past the lip the sheet has travelled by the time it lands. */
const CASCADE_THROW_SCALE = 0.62;
/**
 * Water leaves a lip moving horizontally and only then falls, so the curtain
 * has to bulge outward at the top rather than hang straight down. Exponents
 * either side of 1 give that: travel front-loaded, descent back-loaded.
 */
const CASCADE_TRAVEL_EXPONENT = 0.58;
const CASCADE_DESCENT_EXPONENT = 1.75;
/** A curtain narrows slightly as it falls, the way a real sheet necks in. */
const CASCADE_NECK = 0.22;
/** Metres the crest row is lifted back over the sheet that feeds the fall. */
const CASCADE_CREST_LIFT = 0.45;
const CASCADE_SILL_RELIEF = 1.25;

export function createWaterCascadeGeometry(
  sites: readonly CascadeSite[],
): THREE.BufferGeometry | undefined {
  if (sites.length === 0) return undefined;

  const acrossVerts = CASCADE_ACROSS_SEGMENTS + 1;
  const downVerts = CASCADE_DOWN_SEGMENTS + 1;
  const perSite = acrossVerts * downVerts;
  const vertexCount = perSite * sites.length;
  const positions = new Float32Array(vertexCount * 3);
  const cascade = new Float32Array(vertexCount * 3);
  const crest = new Float32Array(vertexCount);
  const indices = new Uint32Array(
    CASCADE_ACROSS_SEGMENTS * CASCADE_DOWN_SEGMENTS * 6 * sites.length,
  );
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const site of sites) {
    // The lane runs along x, so the curtain spans z and falls along x.
    const throwDistance = Math.max(
      WATERFALL_FACE_LENGTH,
      site.drop * CASCADE_THROW_SCALE,
    );
    const base = vertexOffset / 3;

    for (let down = 0; down < downVerts; down += 1) {
      const fall = down / CASCADE_DOWN_SEGMENTS;
      // The crest row sits slightly above and behind the lip so the curtain
      // overlaps the sheet feeding it. Meeting it exactly leaves a hard
      // horizontal seam right where the eye is drawn.
      const crestLift = down === 0 ? CASCADE_CREST_LIFT : 0;
      const descent = Math.pow(fall, CASCADE_DESCENT_EXPONENT) * site.drop;
      const halfWidth = site.halfWidth * (1 - CASCADE_NECK * fall);
      for (let across = 0; across < acrossVerts; across += 1) {
        const lateral = (across / CASCADE_ACROSS_SEGMENTS) * 2 - 1;
        // Taken from the rock rather than invented: the sheet leaves lower
        // where the channel has notched the sill, and dries out entirely where
        // the rock stands proud, which is what parts a wide fall into chutes.
        const notch = resolveCascadeSill(site.sill, lateral);
        // Only where the water leaves the rock; below that it is in free fall.
        const sill =
          Math.max(-CASCADE_SILL_RELIEF, Math.min(CASCADE_SILL_RELIEF, notch)) *
          Math.max(0, 1 - fall * 3.2);
        // Water leaving a low notch is already faster, and throws further.
        const travel =
          Math.pow(fall, CASCADE_TRAVEL_EXPONENT) *
          throwDistance *
          (1 - Math.max(-1, Math.min(1, notch)) * 0.16);
        positions[vertexOffset] =
          site.x + site.flowSign * (travel - crestLift * 1.4);
        positions[vertexOffset + 1] =
          site.lipHeight - descent + crestLift + sill;
        positions[vertexOffset + 2] = site.z + lateral * halfWidth;
        cascade[vertexOffset] = lateral;
        cascade[vertexOffset + 1] = fall;
        cascade[vertexOffset + 2] = site.drop;
        crest[vertexOffset / 3] = notch / CASCADE_SILL_DRY_HEIGHT;
        vertexOffset += 3;
      }
    }

    for (let down = 0; down < CASCADE_DOWN_SEGMENTS; down += 1) {
      for (let across = 0; across < CASCADE_ACROSS_SEGMENTS; across += 1) {
        const topLeft = base + down * acrossVerts + across;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + acrossVerts;
        const bottomRight = bottomLeft + 1;
        indices[indexOffset] = topLeft;
        indices[indexOffset + 1] = bottomLeft;
        indices[indexOffset + 2] = topRight;
        indices[indexOffset + 3] = topRight;
        indices[indexOffset + 4] = bottomLeft;
        indices[indexOffset + 5] = bottomRight;
        indexOffset += 6;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("cascade", new THREE.BufferAttribute(cascade, 3));
  geometry.setAttribute("cascadeCrest", new THREE.BufferAttribute(crest, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  // The plunge reach downstream is where the impact foam lives; the bounds have
  // to cover it or a curtain culls out just as you walk into its spray.
  const box = geometry.boundingBox;
  if (box) {
    box.expandByScalar(WATERFALL_PLUNGE_LENGTH * 0.5);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    geometry.boundingSphere = sphere;
  }
  return geometry;
}
