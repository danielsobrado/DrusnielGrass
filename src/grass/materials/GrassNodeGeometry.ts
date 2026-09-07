import { InstancedInterleavedBuffer, InterleavedBuffer, InterleavedBufferAttribute, type BufferGeometry } from "three/webgpu";

const VERTEX_FIELDS = [
  ["grassProgress", 1], ["grassPhase", 1], ["grassBladeShade", 1], ["grassBladeWidth", 1],
  ["grassSubpatchOffset", 2], ["grassSubpatchIndex", 1],
] as const;
const INSTANCE_FIELDS = [
  ["instanceVariation", 4], ["instanceShape", 4], ["instanceCoverage", 1], ["instanceBiome", 1],
  ["instanceAccent", 1],
] as const;

function pack(geometry: BufferGeometry, fields: readonly (readonly [string, number])[],
  instanced: boolean): void {
  const present = fields.filter(([name]) => geometry.getAttribute(name));
  if (present.length < 2) return;
  const count = geometry.getAttribute(present[0][0]).count;
  let stride = 0;
  for (const [name, size] of present) {
    const attribute = geometry.getAttribute(name);
    if (attribute.count !== count || attribute.itemSize !== size) {
      throw new Error(`Invalid grass attribute ${name}; expected ${count} entries of size ${size}.`);
    }
    stride += size;
  }
  const data = new Float32Array(count * stride);
  let offset = 0;
  for (const [name, size] of present) {
    const attribute = geometry.getAttribute(name);
    for (let entry = 0; entry < count; entry++) {
      for (let component = 0; component < size; component++) {
        data[entry * stride + offset + component] = attribute.getComponent(entry, component);
      }
    }
    offset += size;
  }
  const buffer = instanced ? new InstancedInterleavedBuffer(data, stride) : new InterleavedBuffer(data, stride);
  offset = 0;
  for (const [name, size] of present) {
    geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
    offset += size;
  }
}

/**
 * Call once before a blade geometry's first node-renderer upload.
 *
 * A near blade carries position, normal and uv, four per-vertex blade fields,
 * four per-instance fields and the instance transform. As separate buffers that
 * is twelve, well over WebGPU's eight-buffer floor, and once the instance
 * matrix is a vertex attribute it also passes WebGL 2's sixteen attribute
 * locations. Packing the blade fields and the instance fields into one buffer
 * each brings the blade to six buffers and fifteen locations without renaming
 * an attribute or changing a single value, so the legacy material keeps
 * rendering the same geometry unchanged.
 *
 * Attributes shared between geometries are packed per geometry, so callers that
 * share instance buffers across tiles must pack the shared source once and
 * assign the result, rather than calling this per tile.
 */
export function prepareGrassNodeGeometry(geometry: BufferGeometry): void {
  pack(geometry, VERTEX_FIELDS, false);
  pack(geometry, INSTANCE_FIELDS, true);
}
