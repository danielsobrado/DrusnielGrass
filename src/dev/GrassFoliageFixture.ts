import {
  BufferGeometry, DataTexture, Euler, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, InstancedMesh, LinearFilter, Matrix4, NoColorSpace, Quaternion,
  RGBAFormat, UnsignedByteType, Vector3, type CanvasTexture,
} from "three/webgpu";
import { WorldDetailFoliageMaterial } from "../world/grass/WorldDetailFoliageMaterial";
import type { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import type { WorldDetailFoliageAtlas } from "../world/grass/WorldDetailFoliageAtlasFactory";
import { GRASS_ACCENT_SPECIES, GRASS_MAX_ACCENT_TINTS } from "../grass/biome/GrassAccentSpecies";
import { GRASS_MAX_BIOMES } from "../grass/biome/GrassBiomeProfile";
import { prepareGrassNodeGeometry } from "../grass/materials/GrassNodeGeometry";
import {
  getGrassWindNoiseTexture, GRASS_WIND_NOISE_SCALE, GRASS_WIND_NOISE_SPEED,
} from "../grass/wind/WindNoiseTexture";

const CELL_RESOLUTION = 24;
const CELL_PADDING = 2;
const CELL_SIZE = CELL_RESOLUTION + CELL_PADDING * 2;
const VARIANT_ROWS = 4;
const COLUMNS = Math.max(...GRASS_ACCENT_SPECIES.map(species => species.index)) + 1;
const ATLAS_WIDTH = COLUMNS * CELL_SIZE;
const ATLAS_HEIGHT = VARIANT_ROWS * CELL_SIZE;
const INSTANCES_PER_AXIS = 11;
const FIELD_SPACING = 0.85;

export type GrassFoliageVariant = "desktop" | "compact";

function hash01(index: number, salt: number): number {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/**
 * A deterministic stand-in for the baked accent atlas.
 *
 * Cells differ per species and per variant row so a wrong cell shows up as a
 * difference, the alpha profile crosses the cutout inside every cell so the
 * discard and the understory edge term are both reached, and the blue channel
 * ramps so the petal tint path is driven rather than left at zero.
 */
export function createFoliageAtlasTexture(): DataTexture {
  const data = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let y = 0; y < ATLAS_HEIGHT; y++) {
    for (let x = 0; x < ATLAS_WIDTH; x++) {
      const cellX = Math.floor(x / CELL_SIZE), cellY = Math.floor(y / CELL_SIZE);
      const insideX = x - cellX * CELL_SIZE - CELL_PADDING;
      const insideY = y - cellY * CELL_SIZE - CELL_PADDING;
      const offset = (y * ATLAS_WIDTH + x) * 4;
      if (insideX < 0 || insideY < 0 || insideX >= CELL_RESOLUTION || insideY >= CELL_RESOLUTION) {
        continue;
      }
      const u = (insideX + 0.5) / CELL_RESOLUTION, v = (insideY + 0.5) / CELL_RESOLUTION;
      const leaf = Math.abs(Math.sin((u + cellX * 0.23) * 9.1));
      const alpha = Math.max(0, Math.min(1,
        (1 - Math.abs(u - 0.5) * 1.9) * (0.35 + v * 0.75) * (0.55 + leaf * 0.6)));
      data[offset] = Math.round(v * 255 * alpha);
      data[offset + 1] = Math.round(leaf * 255 * alpha);
      data[offset + 2] = Math.round(Math.max(0, v - 0.55) * 2 * 255 * alpha);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new DataTexture(data, ATLAS_WIDTH, ATLAS_HEIGHT, RGBAFormat, UnsignedByteType);
  texture.name = "grass-foliage-comparison-atlas";
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** The three-row card the accent field builds, so a fern bends through itself. */
function createCardGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [], uvs: number[] = [];
  for (let row = 0; row <= 2; row++) {
    const v = row / 2;
    positions.push(-0.5, v, 0, 0.5, v, 0);
    uvs.push(0, v, 1, v);
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
  return geometry;
}

export function createFoliageAtlas(): WorldDetailFoliageAtlas {
  return {
    texture: createFoliageAtlasTexture() as unknown as CanvasTexture,
    canvas: undefined as unknown as HTMLCanvasElement,
    species: GRASS_ACCENT_SPECIES,
    columns: COLUMNS,
    variantRows: VARIANT_ROWS,
    cellResolution: CELL_RESOLUTION,
    padding: CELL_PADDING,
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
  };
}

/**
 * A receding patch of accents covering every species, variant row and tint.
 *
 * Rows run away from the camera so the species-staggered distance fade, the
 * distance-loosened cutout and the understory detail fade all resolve
 * differently across the same draw.
 */
export function createFoliageField(): InstancedMesh {
  const count = INSTANCES_PER_AXIS * INSTANCES_PER_AXIS;
  const card = createCardGeometry();
  const geometry = new InstancedBufferGeometry();
  for (const [name, attribute] of Object.entries(card.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  if (card.index) geometry.setIndex(card.index);
  const variation = new Float32Array(count * 4);
  const coverage = new Float32Array(count);
  const biome = new Float32Array(count);
  const accent = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    for (let channel = 0; channel < 4; channel++) {
      variation[index * 4 + channel] = hash01(index, channel);
    }
    coverage[index] = 0.55 + hash01(index, 7) * 0.45;
    biome[index] = Math.floor(hash01(index, 11) * GRASS_MAX_BIOMES);
    const species = GRASS_ACCENT_SPECIES[index % GRASS_ACCENT_SPECIES.length].index;
    const variantRow = Math.floor(hash01(index, 13) * VARIANT_ROWS);
    const tint = Math.floor(hash01(index, 17) * GRASS_MAX_ACCENT_TINTS);
    accent[index] = species * 32 + variantRow * 8 + tint;
  }
  geometry.setAttribute("instanceVariation", new InstancedBufferAttribute(variation, 4));
  geometry.setAttribute("instanceCoverage", new InstancedBufferAttribute(coverage, 1));
  geometry.setAttribute("instanceBiome", new InstancedBufferAttribute(biome, 1));
  geometry.setAttribute("instanceAccent", new InstancedBufferAttribute(accent, 1));
  geometry.instanceCount = count;
  const mesh = new InstancedMesh(geometry, undefined, count);
  const matrix = new Matrix4(), rotation = new Quaternion();
  const position = new Vector3(), scale = new Vector3();
  for (let index = 0; index < count; index++) {
    const column = index % INSTANCES_PER_AXIS, row = Math.floor(index / INSTANCES_PER_AXIS);
    position.set((column - (INSTANCES_PER_AXIS - 1) / 2) * FIELD_SPACING,
      hash01(index, 19) * 0.05, -row * FIELD_SPACING - 1.5);
    rotation.setFromEuler(new Euler(0, hash01(index, 23) * Math.PI * 2, 0));
    scale.set(0.4 + hash01(index, 29) * 0.3, 0.35 + hash01(index, 31) * 0.4,
      0.4 + hash01(index, 37) * 0.3);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  prepareGrassNodeGeometry(geometry);
  return mesh;
}

export function createFoliageState(atlas: WorldDetailFoliageAtlas,
  variant: GrassFoliageVariant,
  context: WorldNodeMaterialContext): WorldDetailFoliageMaterial {
  const material = new WorldDetailFoliageMaterial(atlas,
    { baseColor: "#273f22", tipColor: "#83a96b", dryColor: "#a8a06a", rootDarkening: 0.55,
      normalUp: 0.45, ambientBoost: 0.12, backlightStrength: 0.16 },
    { directionX: 0.8, directionZ: 0.35, strength: 0.14, gustScale: 0.08, gustSpeed: 0.65,
      flutterStrength: 0.035, flutterSpeed: 3.4 },
    { fadeDistance: 7, fadeTransition: 2, fadeStagger: 3, lodBandJitterRatio: 0.5,
      noiseWind: variant === "desktop" },
    context);
  const uniforms = material.shaderUniforms;
  uniforms.uTime.value = 5.75;
  uniforms.uWindNoise.value = getGrassWindNoiseTexture();
  uniforms.uWindNoiseScale.value = GRASS_WIND_NOISE_SCALE;
  uniforms.uWindNoiseSpeed.value = GRASS_WIND_NOISE_SPEED;
  material.setDensityScale(0.9);
  return material;
}
