import * as THREE from "three";
import type { ActorGeometryPart } from "../../actor/geometry/ActorPartMerge";
import { DEER_PALETTE } from "./DeerPalette";

const HALF_TURN = Math.PI * 0.5;

const HIDE = new THREE.Color(DEER_PALETTE.hide);
const FACE = new THREE.Color(DEER_PALETTE.face);
const DORSAL = new THREE.Color(DEER_PALETTE.dorsal);
const HOOF = new THREE.Color(DEER_PALETTE.hoof);
const TAIL_FLASH = new THREE.Color(DEER_PALETTE.tailFlash);

/**
 * The parts of a deer that hang off the body: legs, hooves and tail.
 *
 * Separate from the trunk because they are built once and reused by every bone
 * that needs them — one leg segment serves the left and the right side, and one
 * hoof serves all four feet — where the body, neck and head are each unique.
 */
export function buildTailSegment(
  topRadius: number,
  bottomRadius: number,
  length: number,
): ActorGeometryPart[] {
  return [
    {
      geometry: new THREE.CylinderGeometry(bottomRadius, topRadius, length, 8, 2),
      color: DORSAL,
      rotationX: -HALF_TURN,
      z: -length * 0.5,
      shade: (target, _x, _y, _z, normalY) => {
        // The white underside is the whole point of a deer's tail: it is the
        // signal that flashes when one of them decides to leave.
        if (normalY < 0.1) {
          target.lerpColors(DORSAL, TAIL_FLASH, smooth((0.1 - normalY) / 1.1));
        }
      },
    },
  ];
}

/**
 * One limb segment: a taper with a joint swell at its top.
 *
 * Deer legs are thin, and thin tapered cylinders butted end to end read as a
 * pipe. The swell gives the elbow and hock somewhere to be.
 */
export function buildLimbSegment(
  topRadius: number,
  bottomRadius: number,
  length: number,
  jointRadius: number,
): ActorGeometryPart[] {
  const shade: ActorGeometryPart["shade"] = (target, _x, y) => {
    // Legs darken toward the ground, which is both true of deer and useful: it
    // stops four pale sticks from drawing the eye away from the body.
    const low = THREE.MathUtils.clamp(-y / Math.max(length, 0.001), 0, 1);
    target.lerpColors(HIDE, FACE, smooth(low));
  };
  return [
    {
      geometry: new THREE.CylinderGeometry(topRadius, bottomRadius, length, 9, 2),
      color: HIDE,
      y: -length * 0.5,
      shade,
    },
    // A joint, not a knob: barely wider than the limb and flattened, so it
    // suggests bone under skin instead of a ball bearing.
    {
      geometry: new THREE.SphereGeometry(jointRadius, 9, 7),
      color: HIDE,
      scaleX: 0.82,
      scaleY: 0.72,
      shade,
    },
  ];
}

/** A cloven hoof: two toes and a dewclaw, all in one dark buffer. */
export function buildHoof(): ActorGeometryPart[] {
  const parts: ActorGeometryPart[] = [];
  for (const side of [-1, 1] as const) {
    parts.push({
      geometry: new THREE.CylinderGeometry(0.02, 0.024, 0.058, 6),
      color: HOOF,
      x: side * 0.013,
      y: -0.026,
      z: 0.012,
      rotationX: 0.16,
    });
  }
  parts.push({
    geometry: new THREE.SphereGeometry(0.014, 6, 5),
    color: HOOF,
    y: -0.006,
    z: -0.022,
  });
  return parts;
}

function smooth(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}
