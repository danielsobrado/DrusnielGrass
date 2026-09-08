import {
  BufferGeometry, DataTexture, Euler, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, InstancedMesh, LinearMipmapLinearFilter, LinearFilter, Matrix4,
  NoColorSpace, Quaternion, RGBAFormat, UnsignedByteType, Vector3, type CanvasTexture,
} from "three/webgpu";
import { WorldGrassImpostorMaterial } from "../world/grass/WorldGrassImpostorMaterial";
import type { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import type { WorldGrassImpostorAtlas } from "../world/grass/WorldGrassImpostorAtlasFactory";
import { prepareGrassNodeGeometry } from "../grass/materials/GrassNodeGeometry";
import { GRASS_MAX_BIOMES } from "../grass/biome/GrassBiomeProfile";
import {
  getGrassWindNoiseTexture, GRASS_WIND_NOISE_SCALE, GRASS_WIND_NOISE_SPEED,
} from "../grass/wind/WindNoiseTexture";

const VIEWS_PER_AXIS = 4;
const SUBPATCHES_PER_AXIS = 2;
const FRAME_RESOLUTION = 28;
const PADDING = 2;
const CELL_SIZE = FRAME_RESOLUTION + PADDING * 2;
const ATLAS_SIZE = SUBPATCHES_PER_AXIS * VIEWS_PER_AXIS * CELL_SIZE;
const CARD_RADIUS = 0.6;
const CENTER_HEIGHT = 0.55;
const INSTANCES_PER_AXIS = 9;
const FIELD_SPACING = 3.2;

export type GrassImpostorVariant = "desktop" | "compact";

function hash01(index: number, salt: number): number {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/**
 * A deterministic stand-in for the baked atlas.
 *
 * The production atlas is CPU canvas work that this check does not exercise;
 * what both implementations must agree on is how a packed frame is addressed
 * and filtered. Frames differ per view and per subpatch so a wrong page or cell
 * index shows up as a difference rather than as the same blade twice, and the
 * alpha profile crosses the cutoff inside every frame so the stochastic and
 * hard alpha paths are both reached.
 */
export function createImpostorAtlasTexture(): DataTexture {
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let y = 0; y < ATLAS_SIZE; y++) {
    for (let x = 0; x < ATLAS_SIZE; x++) {
      const cellX = Math.floor(x / CELL_SIZE), cellY = Math.floor(y / CELL_SIZE);
      const insideX = x - cellX * CELL_SIZE - PADDING;
      const insideY = y - cellY * CELL_SIZE - PADDING;
      const offset = (y * ATLAS_SIZE + x) * 4;
      if (insideX < 0 || insideY < 0 || insideX >= FRAME_RESOLUTION || insideY >= FRAME_RESOLUTION) {
        continue;
      }
      const u = (insideX + 0.5) / FRAME_RESOLUTION, v = (insideY + 0.5) / FRAME_RESOLUTION;
      const blade = Math.abs(Math.sin((u + cellX * 0.31) * 11.7)) * 0.5
        + Math.abs(Math.sin((v + cellY * 0.17) * 5.3)) * 0.5;
      const coverage = Math.max(0, 1 - Math.abs(u - 0.5) * 2.1) * (0.35 + v * 0.65);
      const alpha = Math.min(1, coverage * (0.6 + blade * 0.8));
      // Premultiplied by coverage, as the baker writes it: the shader divides
      // the colour back out by alpha before resolving the palette.
      data[offset] = Math.round(v * 255 * alpha);
      data[offset + 1] = Math.round(blade * 255 * alpha);
      data[offset + 2] = Math.round(0.5 * 255 * alpha);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new DataTexture(data, ATLAS_SIZE, ATLAS_SIZE, RGBAFormat, UnsignedByteType);
  texture.name = "grass-impostor-comparison-atlas";
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Four subpatch quads, the layout the atlas factory builds. */
function createCardGeometry(): BufferGeometry {
  const positions: number[] = [], uvs: number[] = [];
  const offsets: number[] = [], indices: number[] = [], subpatchIndices: number[] = [];
  const centers = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  for (const [subpatch, center] of centers.entries()) {
    const vertexOffset = positions.length / 3;
    positions.push(-CARD_RADIUS, -CARD_RADIUS, 0, CARD_RADIUS, -CARD_RADIUS, 0,
      CARD_RADIUS, CARD_RADIUS, 0, -CARD_RADIUS, CARD_RADIUS, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let vertex = 0; vertex < 4; vertex++) {
      offsets.push(center[0], center[1]);
      subpatchIndices.push(subpatch);
    }
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2,
      vertexOffset, vertexOffset + 2, vertexOffset + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("grassSubpatchOffset", new Float32BufferAttribute(offsets, 2));
  geometry.setAttribute("grassSubpatchIndex", new Float32BufferAttribute(subpatchIndices, 1));
  geometry.setIndex(indices);
  return geometry;
}

export function createImpostorAtlas(): WorldGrassImpostorAtlas {
  return {
    texture: createImpostorAtlasTexture() as unknown as CanvasTexture,
    geometry: createCardGeometry(),
    centerHeight: CENTER_HEIGHT,
    radius: CARD_RADIUS * 3,
    cardRadius: CARD_RADIUS,
    viewsPerAxis: VIEWS_PER_AXIS,
    subpatchesPerAxis: SUBPATCHES_PER_AXIS,
    frameResolution: FRAME_RESOLUTION,
    padding: PADDING,
    atlasSize: ATLAS_SIZE,
  };
}

/**
 * A receding grid of patches.
 *
 * The rows run away from the camera so the same draw covers cards that are
 * large on screen, cards inside the minification ramp and cards past the hard
 * cut, which is where the view blending, alpha and coverage paths differ.
 */
export function createImpostorField(atlas: WorldGrassImpostorAtlas): InstancedMesh {
  const count = INSTANCES_PER_AXIS * INSTANCES_PER_AXIS;
  const geometry = new InstancedBufferGeometry();
  for (const [name, attribute] of Object.entries(atlas.geometry.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  if (atlas.geometry.index) geometry.setIndex(atlas.geometry.index);
  const variation = new Float32Array(count * 4);
  const coverage = new Float32Array(count);
  const biome = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    for (let channel = 0; channel < 4; channel++) {
      variation[index * 4 + channel] = hash01(index, channel);
    }
    coverage[index] = 0.5 + hash01(index, 11) * 0.5;
    biome[index] = Math.floor(hash01(index, 13) * GRASS_MAX_BIOMES);
  }
  geometry.setAttribute("instanceVariation", new InstancedBufferAttribute(variation, 4));
  geometry.setAttribute("instanceCoverage", new InstancedBufferAttribute(coverage, 1));
  geometry.setAttribute("instanceBiome", new InstancedBufferAttribute(biome, 1));
  geometry.instanceCount = count;
  const mesh = new InstancedMesh(geometry, undefined, count);
  const matrix = new Matrix4(), rotation = new Quaternion();
  const position = new Vector3(), scale = new Vector3();
  for (let index = 0; index < count; index++) {
    const column = index % INSTANCES_PER_AXIS, row = Math.floor(index / INSTANCES_PER_AXIS);
    position.set((column - (INSTANCES_PER_AXIS - 1) / 2) * FIELD_SPACING,
      hash01(index, 17) * 0.4 - 0.2, -row * FIELD_SPACING - 4);
    rotation.setFromEuler(new Euler(0, hash01(index, 19) * Math.PI * 2, 0));
    scale.set(1 + hash01(index, 23) * 0.5, 0.85 + hash01(index, 29) * 0.5,
      1 + hash01(index, 31) * 0.5);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  prepareGrassNodeGeometry(geometry);
  return mesh;
}

export function createImpostorState(atlas: WorldGrassImpostorAtlas,
  variant: GrassImpostorVariant,
  context: WorldNodeMaterialContext): WorldGrassImpostorMaterial {
  const material = new WorldGrassImpostorMaterial(atlas,
    { baseColor: "#273f22", tipColor: "#83a96b", dryColor: "#a8a06a", rootDarkening: 0.55,
      normalUp: 0.45, ambientBoost: 0.12, backlightStrength: 0.16 },
    { directionX: 0.8, directionZ: 0.35, strength: 0.14, gustScale: 0.08, gustSpeed: 0.65,
      flutterStrength: 0.035, flutterSpeed: 3.4 },
    { nearMaxDistance: 8, midMaxDistance: 16, farMaxDistance: 44, hysteresisDistance: 2,
      transitionDistance: 3 },
    18, 34, variant === "desktop", 1, variant === "desktop", context);
  const uniforms = material.shaderUniforms;
  uniforms.uTime.value = 9.25;
  uniforms.uWindNoise.value = getGrassWindNoiseTexture();
  uniforms.uWindNoiseScale.value = GRASS_WIND_NOISE_SCALE;
  uniforms.uWindNoiseSpeed.value = GRASS_WIND_NOISE_SPEED;
  uniforms.uArtDensityScale.value = 1;
  return material;
}
