import * as THREE from "three";
import type { ActorGeometryPart } from "../../actor/geometry/ActorPartMerge";
import { DEER_PALETTE } from "./DeerPalette";

const HALF_TURN = Math.PI * 0.5;

const FACE = new THREE.Color(DEER_PALETTE.face);
const MUZZLE = new THREE.Color(DEER_PALETTE.muzzle);
const NOSE = new THREE.Color(DEER_PALETTE.nose);
const EYE = new THREE.Color(DEER_PALETTE.eye);
const EYE_SPECK = new THREE.Color(DEER_PALETTE.eyeSpeck);
const EAR_INNER = new THREE.Color(DEER_PALETTE.earInner);
const ANTLER = new THREE.Color(DEER_PALETTE.antler);
const ANTLER_TIP = new THREE.Color(DEER_PALETTE.antlerTip);

export interface DeerHeadShape {
  /** Scales the whole skull against the body — a fawn's head is proportionally large. */
  readonly headScale: number;
  /** Muzzle length. Short on a fawn, long on a stag. */
  readonly muzzleLength: number;
  readonly antlers: boolean;
}

/**
 * The head, which is where nearly all the recognition lives.
 *
 * A viewer decides what an animal is from its head long before they read its
 * gait, and the previous body failed that test with a single box and a smaller
 * box for a nose. What is added here is cheap and specific: a tapered muzzle
 * with a wet dark tip, eyes set wide and high on the skull the way a prey
 * animal's are, a catchlight so they are not drilled holes, and — on the stag —
 * a branched antler rack that carries the silhouette on its own.
 *
 * All of it merges into the head bone's single mesh, so none of it costs a draw
 * call.
 */
export function buildDeerHeadParts(shape: DeerHeadShape): ActorGeometryPart[] {
  const scale = shape.headScale;
  const parts: ActorGeometryPart[] = [
    {
      geometry: new THREE.SphereGeometry(0.072 * scale, 12, 9),
      color: FACE,
      y: 0.012 * scale,
      z: 0.04 * scale,
      scaleX: 0.92,
      scaleZ: 1.22,
    },
    // The muzzle tapers toward the nose and darkens along its length, which is
    // what separates a deer's face from a dog's blunt one.
    {
      geometry: new THREE.CylinderGeometry(
        0.03 * scale,
        0.05 * scale,
        shape.muzzleLength,
        10,
        3,
      ),
      color: FACE,
      rotationX: HALF_TURN,
      y: -0.016 * scale,
      z: 0.09 * scale + shape.muzzleLength * 0.5,
      shade: (target, _x, _y, z) => {
        const along = THREE.MathUtils.clamp(
          (z - 0.09 * scale) / Math.max(shape.muzzleLength, 0.001),
          0,
          1,
        );
        target.lerpColors(FACE, MUZZLE, smooth(along));
      },
    },
    {
      geometry: new THREE.SphereGeometry(0.026 * scale, 8, 6),
      color: NOSE,
      y: -0.02 * scale,
      z: 0.09 * scale + shape.muzzleLength,
      scaleZ: 0.7,
    },
  ];

  for (const side of [-1, 1] as const) {
    parts.push(
      {
        geometry: new THREE.SphereGeometry(0.019 * scale, 8, 6),
        color: EYE,
        x: side * 0.058 * scale,
        y: 0.028 * scale,
        z: 0.062 * scale,
      },
      {
        geometry: new THREE.SphereGeometry(0.007 * scale, 5, 4),
        color: EYE_SPECK,
        x: side * 0.066 * scale,
        y: 0.037 * scale,
        z: 0.072 * scale,
      },
    );
  }

  if (shape.antlers) {
    for (const side of [-1, 1] as const) {
      appendAntler(parts, side, scale);
    }
  }
  return parts;
}

/**
 * One antler: a swept main beam with a brow tine and two forks off the top.
 *
 * Built from straight segments placed along an arc rather than from a curve,
 * because at any distance this is ever seen the difference is invisible and the
 * segments merge into one buffer.
 */
function appendAntler(
  parts: ActorGeometryPart[],
  side: number,
  scale: number,
): void {
  const baseX = side * 0.042 * scale;
  const baseY = 0.062 * scale;
  const baseZ = 0.03 * scale;
  const beam: readonly { readonly length: number; readonly lean: number; readonly sweep: number }[] = [
    { length: 0.1, lean: 0.18, sweep: 0.22 },
    { length: 0.095, lean: 0.34, sweep: 0.38 },
    { length: 0.08, lean: 0.52, sweep: 0.5 },
  ];

  let x = baseX;
  let y = baseY;
  let z = baseZ;
  for (let index = 0; index < beam.length; index += 1) {
    const segment = beam[index];
    const length = segment.length * scale;
    const radius = (0.014 - index * 0.003) * scale;
    parts.push({
      geometry: new THREE.CylinderGeometry(radius * 0.8, radius, length, 6),
      color: index === beam.length - 1 ? ANTLER_TIP : ANTLER,
      x: x + Math.sin(segment.sweep) * side * length * 0.5,
      y: y + Math.cos(segment.lean) * length * 0.5,
      z: z - Math.sin(segment.lean) * length * 0.25,
      rotationX: -segment.lean * 0.5,
      rotationZ: -side * segment.sweep,
    });
    x += Math.sin(segment.sweep) * side * length;
    y += Math.cos(segment.lean) * length;
    z -= Math.sin(segment.lean) * length * 0.5;

    // The brow tine comes off the first segment and points forward; the top
    // fork comes off the last and points up. Two tines is enough branching to
    // read as a rack without becoming a thicket of geometry.
    if (index === 0 || index === beam.length - 1) {
      const tineLength = (index === 0 ? 0.062 : 0.055) * scale;
      parts.push({
        geometry: new THREE.CylinderGeometry(
          0.004 * scale,
          0.009 * scale,
          tineLength,
          5,
        ),
        color: ANTLER_TIP,
        x: x + side * tineLength * 0.18,
        y: y + tineLength * (index === 0 ? 0.1 : 0.45),
        z: z + (index === 0 ? tineLength * 0.42 : -tineLength * 0.1),
        rotationX: index === 0 ? -0.95 : -0.25,
        rotationZ: -side * 0.3,
      });
    }
  }
}

/**
 * One ear, pointing up and swept outward and back.
 *
 * Mirrored by rotation rather than by a negative scale: a negative scale flips
 * the winding and the ear renders as a dark hole.
 */
export function buildDeerEarParts(
  side: number,
  scale: number,
): ActorGeometryPart[] {
  const outward = side * 0.34;
  return [
    {
      geometry: new THREE.SphereGeometry(0.048 * scale, 8, 7),
      color: FACE,
      y: 0.042 * scale,
      scaleX: 0.52,
      scaleY: 1.15,
      scaleZ: 0.24,
      rotationZ: outward,
      rotationX: -0.24,
    },
    {
      geometry: new THREE.SphereGeometry(0.038 * scale, 7, 6),
      color: EAR_INNER,
      y: 0.04 * scale,
      z: 0.008 * scale,
      scaleX: 0.44,
      scaleY: 1.05,
      scaleZ: 0.16,
      rotationZ: outward,
      rotationX: -0.24,
    },
  ];
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}
