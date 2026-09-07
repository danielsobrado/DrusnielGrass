import { BufferAttributeNode, InstancedInterleavedBuffer, type InstancedBufferAttribute, type InstancedMesh, type Node, type NodeBuilder } from "three/webgpu";
import { OnObjectUpdate, nodeObject } from "three/tsl";

/**
 * The per-instance transform, as its four columns.
 *
 * Three applies instancing itself in `NodeMaterial.setupPosition`, but it does
 * that by assigning `positionLocal`/`normalLocal` and exposes no accessor for
 * the matrix it used. Grass needs the matrix itself: the blade root, the three
 * basis columns and their scales drive wind, trail bending, LOD distance and
 * the sub-pixel width clamp, exactly as the GLSL vertex chunks did through
 * `instanceMatrix`. Re-deriving it from an already deformed vertex is not
 * possible, so this mirrors three's own interleaved-attribute construction.
 *
 * Three picks a uniform buffer instead below its own buffer limit, so for small
 * meshes this is a second view of the same array rather than the same GPU
 * buffer. The data is identical either way; removing the duplication needs an
 * upstream accessor and is recorded as remaining migration work.
 *
 * Node builder state is cached per instanced mesh — `RenderObject`'s material
 * cache key includes the object uuid — so capturing this object's buffer is
 * what three's own instance node does and stays correct for a shared material.
 * Callers must therefore resolve the columns inside a `Fn`, which is where the
 * builder, and with it the concrete mesh, is available.
 */
type InstanceColumns = [Node<"vec4">, Node<"vec4">, Node<"vec4">, Node<"vec4">];

// Keyed by the mesh's own attribute, so a graph that resolves the transform
// more than once — a material and a comparison view of the same blade, say —
// declares one set of vertex attributes rather than four more.
const instanceColumns = new WeakMap<InstancedBufferAttribute, { mirror: InstancedInterleavedBuffer; columns: InstanceColumns }>();

export function instanceMatrixColumns(builder: NodeBuilder): InstanceColumns {
  const object = builder.object as InstancedMesh;
  const matrices = object.instanceMatrix as InstancedBufferAttribute | undefined;
  if (matrices?.isInstancedBufferAttribute !== true) {
    throw new Error("Grass node materials require an instanced mesh with an instance matrix attribute.");
  }
  let entry = instanceColumns.get(matrices);
  if (!entry) {
    const mirror = new InstancedInterleavedBuffer(matrices.array as Float32Array, 16, 1);
    mirror.version = matrices.version;
    // Built directly rather than through `instancedBufferAttribute`: in r185.1
    // that helper only applies the instanced flag on its whole-matrix branch
    // and drops it for an explicit component type, which binds the columns per
    // vertex instead of per instance and collapses every blade onto one.
    const columnOf = (offset: number) => nodeObject(
      new BufferAttributeNode<"vec4">(mirror, "vec4", 16, offset).setUsage(matrices.usage).setInstanced(true));
    entry = { mirror, columns: [columnOf(0), columnOf(4), columnOf(8), columnOf(12)] };
    instanceColumns.set(matrices, entry);
  }
  const mirror = entry.mirror;
  // Streaming rewrites blade transforms in place. Without this the mirrored
  // buffer would upload once and keep the first tile's placement forever.
  // Registered per graph, not per buffer: every material that draws the mesh
  // has to carry the sync, or one of them uploads stale transforms.
  OnObjectUpdate(() => {
    mirror.clearUpdateRanges();
    for (const range of matrices.updateRanges) mirror.updateRanges.push(range);
    if (mirror.version !== matrices.version) mirror.version = matrices.version;
  });
  return entry.columns;
}
