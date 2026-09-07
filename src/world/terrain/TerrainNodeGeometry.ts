import { InterleavedBuffer, InterleavedBufferAttribute, type BufferGeometry } from "three/webgpu";

const TERRAIN_ATTRIBUTES = [
  ["terrainPath", 4], ["terrainEcology", 4], ["terrainEnvironment", 4],
  ["terrainBiome", 4], ["terrainCommunityGround", 4], ["terrainStoneInfluence", 4],
  ["terrainStoneOcclusionCenter", 2], ["terrainStoneOcclusion", 1],
] as const;

/** Call once before a chunk's first node-renderer upload. Eight custom buffers
 * become one, keeping the complete terrain below WebGPU's eight-buffer floor.
 * Attribute names and values remain compatible with the legacy renderer.
 */
export function prepareTerrainNodeGeometry(geometry: BufferGeometry): void {
  const count = geometry.getAttribute("position").count;
  let stride = 0;
  for (const [name, size] of TERRAIN_ATTRIBUTES) {
    const attribute = geometry.getAttribute(name);
    if (!attribute || attribute.count !== count || attribute.itemSize !== size) {
      throw new Error(`Invalid terrain attribute ${name}; expected ${count} vertices of size ${size}.`);
    }
    stride += size;
  }
  const data = new Float32Array(count * stride);
  let offset = 0;
  for (const [name, size] of TERRAIN_ATTRIBUTES) {
    const attribute = geometry.getAttribute(name);
    for (let vertex = 0; vertex < count; vertex++) {
      for (let component = 0; component < size; component++) {
        data[vertex * stride + offset + component] = attribute.getComponent(vertex, component);
      }
    }
    offset += size;
  }
  const buffer = new InterleavedBuffer(data, stride);
  offset = 0;
  for (const [name, size] of TERRAIN_ATTRIBUTES) {
    geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
    offset += size;
  }
}
