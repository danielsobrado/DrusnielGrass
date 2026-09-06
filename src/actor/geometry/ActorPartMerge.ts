import * as THREE from "three";

/**
 * One placed primitive inside a merged actor part.
 *
 * The caller owns `geometry` and should dispose it as soon as the merge
 * returns — the merge copies out of it and keeps no reference.
 */
export interface ActorGeometryPart {
  readonly geometry: THREE.BufferGeometry;
  /** Flat vertex colour for every vertex this primitive contributes. */
  readonly color: THREE.Color;
  /**
   * Optional per-vertex override, in part space, after placement.
   *
   * Flat colours can only mark a body in blocks, and some of what makes an
   * animal read is not blocky: a belly that pales gradually toward the
   * underside, a spine that darkens toward the top, a fawn's spots. This runs
   * once per vertex at asset-build time and writes into `target`, which starts
   * at {@link ActorGeometryPart.color}.
   */
  readonly shade?: (
    target: THREE.Color,
    x: number,
    y: number,
    z: number,
    normalY: number,
  ) => void;
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly rotationZ?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly scaleZ?: number;
}

const scratchMatrix = new THREE.Matrix4();
const scratchNormalMatrix = new THREE.Matrix3();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchScale = new THREE.Vector3();
const scratchVector = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchColor = new THREE.Color();

/**
 * Bakes a list of placed primitives into one buffer.
 *
 * Draw calls track *bones carrying geometry*, not parts, so this does not by
 * itself make an actor cheaper. What it buys is that detail stops costing draw
 * calls at all: ears, eyes, hooves, antler tines and coat markings are extra
 * primitives inside a bone's single mesh rather than extra meshes, and the whole
 * body can then share one material because colour rides on the vertices.
 *
 * The output is non-indexed `position | normal | color`. No UVs: nothing in this
 * world textures an actor, and carrying an unused attribute through every merged
 * buffer is pure memory. This runs at asset-build time only.
 */
export function mergeActorParts(
  parts: readonly ActorGeometryPart[],
): THREE.BufferGeometry {
  let vertexCount = 0;
  for (const part of parts) {
    vertexCount += countVertices(part.geometry);
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let offset = 0;
  for (const part of parts) {
    offset = writePart(part, positions, normals, colors, offset);
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

function countVertices(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index !== null) {
    return index.count;
  }
  const position = geometry.getAttribute("position");
  if (position === undefined) {
    throw new Error("An actor geometry part has no position attribute.");
  }
  return position.count;
}

/**
 * Copies one primitive into the shared buffers, transformed into part space.
 *
 * Indexed sources are expanded rather than kept indexed: the parts of one bone
 * share no vertices, so an index buffer over the merge would only add a lookup.
 */
function writePart(
  part: ActorGeometryPart,
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  offset: number,
): number {
  const geometry = part.geometry;
  const position = geometry.getAttribute("position");
  if (position === undefined) {
    throw new Error("An actor geometry part has no position attribute.");
  }
  let normal = geometry.getAttribute("normal");
  if (normal === undefined) {
    geometry.computeVertexNormals();
    normal = geometry.getAttribute("normal");
  }

  scratchPosition.set(part.x ?? 0, part.y ?? 0, part.z ?? 0);
  scratchEuler.set(
    part.rotationX ?? 0,
    part.rotationY ?? 0,
    part.rotationZ ?? 0,
  );
  scratchQuaternion.setFromEuler(scratchEuler);
  scratchScale.set(part.scaleX ?? 1, part.scaleY ?? 1, part.scaleZ ?? 1);
  scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
  scratchNormalMatrix.getNormalMatrix(scratchMatrix);
  // A mirrored part arrives with a negative determinant, which turns every
  // triangle inside out. Reversing the winding puts the surface back facing
  // outward instead of leaving an ear or a hoof rendering as a dark hole.
  const mirrored = scratchMatrix.determinant() < 0;

  const index = geometry.getIndex();
  const count = index !== null ? index.count : position.count;
  const color = part.color;
  const shade = part.shade;
  let cursor = offset;
  for (let step = 0; step < count; step += 1) {
    // Triangles arrive in threes, so swapping the second and third vertex of
    // each one is all a winding reversal takes.
    const ordered = mirrored ? reverseWithinTriangle(step) : step;
    const source = index !== null ? index.getX(ordered) : ordered;
    const target = cursor * 3;

    scratchVector
      .fromBufferAttribute(position as THREE.BufferAttribute, source)
      .applyMatrix4(scratchMatrix);
    positions[target] = scratchVector.x;
    positions[target + 1] = scratchVector.y;
    positions[target + 2] = scratchVector.z;

    scratchNormal
      .fromBufferAttribute(normal as THREE.BufferAttribute, source)
      .applyMatrix3(scratchNormalMatrix)
      .normalize();
    normals[target] = scratchNormal.x;
    normals[target + 1] = scratchNormal.y;
    normals[target + 2] = scratchNormal.z;

    if (shade === undefined) {
      colors[target] = color.r;
      colors[target + 1] = color.g;
      colors[target + 2] = color.b;
    } else {
      scratchColor.copy(color);
      shade(
        scratchColor,
        scratchVector.x,
        scratchVector.y,
        scratchVector.z,
        scratchNormal.y,
      );
      colors[target] = scratchColor.r;
      colors[target + 1] = scratchColor.g;
      colors[target + 2] = scratchColor.b;
    }
    cursor += 1;
  }
  return cursor;
}

function reverseWithinTriangle(step: number): number {
  const corner = step % 3;
  if (corner === 0) {
    return step;
  }
  return corner === 1 ? step + 1 : step - 1;
}
