import { InterleavedBufferAttribute, type BufferGeometry } from "three/webgpu";
import {
  STONE_BYTE_STRIDE, STONE_COLOR_OFFSET, STONE_NORMAL_OFFSET, STONE_SHORT_STRIDE,
} from "./StoneRenderPacking";

/** The four-component views the portable path binds, over the shipped bytes. */
export const STONE_PACKED_NORMAL = "stonePackedNormal";
export const STONE_PACKED_GROWTH = "stonePackedGrowth";
export const STONE_PACKED_COLOR = "stonePackedColor";
export const STONE_PACKED_GROWTH_CHANNELS = "stonePackedGrowthChannels";
export const STONE_PACKED_COLONY_COLOR = "stonePackedColonyColor";
export const STONE_PACKED_SURFACE = "stonePackedSurface";

/**
 * Rebinds a stone batch for the node renderer.
 *
 * WebGPU has no three-component 8- or 16-bit vertex format — only two- and
 * four-component ones — and requires a four-component attribute to start on a
 * four-byte boundary. The shipped packing stores normals, the growth position
 * and three colours as three-component normalized attributes, so binding it
 * unchanged fails pipeline creation outright with "vertex format not supported".
 *
 * Nothing about the data changes here. The same two interleaved streams are
 * re-viewed through four-component windows that do land on legal boundaries,
 * and the surface nodes reassemble the channels from them, so the batch keeps
 * its forty bytes per vertex and its three vertex streams. The original
 * three-component attributes are left in place for the WebGL path, which binds
 * them happily; a node material simply never references them.
 */
export function prepareStoneNodeGeometry(geometry: BufferGeometry): void {
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  if (!(normal instanceof InterleavedBufferAttribute)
    || !(color instanceof InterleavedBufferAttribute)) {
    throw new Error("Stone node geometry expects the packed interleaved stone layout.");
  }
  const shorts = normal.data, bytes = color.data;
  if (shorts.stride !== STONE_SHORT_STRIDE || bytes.stride !== STONE_BYTE_STRIDE) {
    throw new Error("Stone node geometry expects the shipped packing strides.");
  }
  // Shorts: normal.xyz plus the growth position's x, then its y and z. Reading
  // four shorts from offset three would run past the twelve-byte stride, so the
  // growth position arrives split and the nodes put it back together.
  geometry.setAttribute(STONE_PACKED_NORMAL,
    new InterleavedBufferAttribute(shorts, 4, STONE_NORMAL_OFFSET, true));
  geometry.setAttribute(STONE_PACKED_GROWTH,
    new InterleavedBufferAttribute(shorts, 2, STONE_SHORT_STRIDE - 2, true));
  // Bytes: four aligned windows over the sixteen-byte stride.
  geometry.setAttribute(STONE_PACKED_COLOR,
    new InterleavedBufferAttribute(bytes, 4, STONE_COLOR_OFFSET, true));
  geometry.setAttribute(STONE_PACKED_GROWTH_CHANNELS,
    new InterleavedBufferAttribute(bytes, 4, 4, true));
  geometry.setAttribute(STONE_PACKED_COLONY_COLOR,
    new InterleavedBufferAttribute(bytes, 4, 8, true));
  geometry.setAttribute(STONE_PACKED_SURFACE,
    new InterleavedBufferAttribute(bytes, 4, 12, true));
  // The lighting model reads `normal` itself, so that one is replaced rather
  // than added: three truncates the four-component view back to a vec3.
  geometry.setAttribute("normal",
    new InterleavedBufferAttribute(shorts, 4, STONE_NORMAL_OFFSET, true));
}
