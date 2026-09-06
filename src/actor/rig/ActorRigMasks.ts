/**
 * Blend masks are plain per-bone weight buffers.
 *
 * There is no global mask vocabulary: a humanoid profile may build an
 * "upperBody" mask and a quadruped profile a "frontLimbs" mask, and shared pose
 * code only ever sees a `Float32Array` of length `boneCount`. Masks are built
 * once at definition time and never rebuilt in a frame.
 */
export interface ActorMaskRequest {
  /** Bones whose subtrees receive the mask weight. */
  readonly roots: readonly number[];
  /** Whether descendants of each root are included. Defaults to true. */
  readonly includeDescendants?: boolean;
  /** Weight written for included bones. Defaults to 1. */
  readonly weight?: number;
  /** Bones excluded after the roots are expanded, with their subtrees. */
  readonly exclude?: readonly number[];
}

/**
 * Builds a mask buffer from bone subtrees.
 *
 * `parents` must be topologically ordered (every parent index below its child),
 * which the rig builder guarantees, so one forward pass propagates weights.
 */
export function buildActorMask(
  parents: Int32Array,
  request: ActorMaskRequest,
): Float32Array {
  const boneCount = parents.length;
  const mask = new Float32Array(boneCount);
  const included = new Uint8Array(boneCount);
  const includeDescendants = request.includeDescendants !== false;
  const weight = request.weight ?? 1;
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
    throw new Error("Actor mask weight must be finite and within 0..1.");
  }

  for (const root of request.roots) {
    if (!Number.isInteger(root) || root < 0 || root >= boneCount) {
      throw new Error(`Actor mask root ${root} is out of range.`);
    }
    included[root] = 1;
  }
  if (includeDescendants) {
    for (let bone = 0; bone < boneCount; bone += 1) {
      const parent = parents[bone];
      if (parent >= 0 && included[parent] === 1) {
        included[bone] = 1;
      }
    }
  }

  if (request.exclude !== undefined) {
    const excluded = new Uint8Array(boneCount);
    for (const bone of request.exclude) {
      if (!Number.isInteger(bone) || bone < 0 || bone >= boneCount) {
        throw new Error(`Actor mask exclusion ${bone} is out of range.`);
      }
      excluded[bone] = 1;
    }
    for (let bone = 0; bone < boneCount; bone += 1) {
      const parent = parents[bone];
      if (parent >= 0 && excluded[parent] === 1) {
        excluded[bone] = 1;
      }
    }
    for (let bone = 0; bone < boneCount; bone += 1) {
      if (excluded[bone] === 1) {
        included[bone] = 0;
      }
    }
  }

  for (let bone = 0; bone < boneCount; bone += 1) {
    mask[bone] = included[bone] === 1 ? weight : 0;
  }
  return mask;
}

/** A mask covering every bone at full weight. */
export function buildActorFullBodyMask(boneCount: number): Float32Array {
  return new Float32Array(boneCount).fill(1);
}
