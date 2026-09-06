import * as THREE from "three";
import {
  sampleGrassMacroDryness,
  sampleGrassMacroVigor,
} from "../../grass/GrassFieldVariation";

/**
 * The macro ecology fields, baked once into a world-space texture.
 *
 * The compact profile's alternative to sixteen integer hashes per ground
 * fragment. Integrated GPUs commonly issue integer multiplies at a quarter of
 * their float rate, so the exact GLSL mirror in {@link ./TerrainMacroFieldShader}
 * is the wrong trade there even though it is the right one on desktop.
 *
 * The resolution is chosen against the fields it carries, not against memory.
 * Vigour has a 19 m period and needs a sample at least every 9.5 m; at
 * 4 m per texel this is comfortably above that, and it is the same margin the
 * near terrain ring already has. Anything coarser would reintroduce the aliasing
 * the per-fragment evaluation exists to remove, which would make the texture
 * path a different bug rather than a cheaper implementation.
 */
export const TERRAIN_MACRO_FIELD_METRES_PER_TEXEL = 4;
const BYTE_MAX = 255;

/**
 * Texels needed to cover a world, rounded up to a power of two so the texture
 * mips cleanly. A 2048 m world lands exactly on 512.
 */
export function resolveTerrainMacroFieldSize(worldSize: number): number {
  const required = Math.ceil(worldSize / TERRAIN_MACRO_FIELD_METRES_PER_TEXEL);
  return 2 ** Math.ceil(Math.log2(Math.max(required, 2)));
}

/**
 * R: macro dryness. G: macro vigour. B and A are reserved for the community
 * selector and the soil hue field that later phases add, and are written as the
 * neutral 0.5 until then so a half-implemented phase cannot read garbage.
 *
 * Built from the same functions the CPU placement path calls, so the texture is
 * a resampling of the real field rather than a second field that happens to look
 * similar.
 */
export function createTerrainMacroFieldTexture(
  worldSize: number,
): THREE.DataTexture {
  const size = resolveTerrainMacroFieldSize(worldSize);
  const extent = size * TERRAIN_MACRO_FIELD_METRES_PER_TEXEL;
  const half = extent * 0.5;
  const data = new Uint8Array(size * size * 4);

  for (let row = 0; row < size; row += 1) {
    // Texel centres, so a linear fetch at a world position lands where the
    // field was actually evaluated rather than half a texel off it.
    const z = -half + (row + 0.5) * TERRAIN_MACRO_FIELD_METRES_PER_TEXEL;
    for (let column = 0; column < size; column += 1) {
      const x = -half + (column + 0.5) * TERRAIN_MACRO_FIELD_METRES_PER_TEXEL;
      const offset = (row * size + column) * 4;
      data[offset] = Math.round(sampleGrassMacroDryness(x, z) * BYTE_MAX);
      data[offset + 1] = Math.round(sampleGrassMacroVigor(x, z) * BYTE_MAX);
      data[offset + 2] = 128;
      data[offset + 3] = 128;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = "world-terrain-macro-field";
  texture.colorSpace = THREE.NoColorSpace;
  // The world is finite and the fields have no periodicity to preserve, so the
  // edge clamp is correct: past the world's own bounds there is nothing to wrap
  // around to.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** World extent the texture spans, in metres, for the shader's UV mapping. */
export function resolveTerrainMacroFieldExtent(worldSize: number): number {
  return (
    resolveTerrainMacroFieldSize(worldSize) *
    TERRAIN_MACRO_FIELD_METRES_PER_TEXEL
  );
}
