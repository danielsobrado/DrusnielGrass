import {
  DataTexture, Euler, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry,
  InstancedMesh, Matrix4, Quaternion, RGBAFormat, UnsignedByteType, Vector3,
} from "three/webgpu";
import { GrassNearMaterial } from "../grass/materials/GrassNearMaterial";
import { getGrassWindNoiseTexture, GRASS_WIND_NOISE_SCALE, GRASS_WIND_NOISE_SPEED } from "../grass/wind/WindNoiseTexture";
import { GRASS_MAX_BIOMES } from "../grass/biome/GrassBiomeProfile";
import { prepareGrassNodeGeometry } from "../grass/materials/GrassNodeGeometry";

/**
 * The four material configurations the blade shader actually ships as.
 *
 * The two island variants are not a device profile: the island regression scene
 * resolves LOD from one scene-wide threshold rather than per-blade camera
 * distance, and the mid layer inverts that threshold to keep the blades the
 * near layer drops. That branch is compiled, not switched at runtime, so it
 * needs its own comparison or it is never verified at all.
 */
export type GrassComparisonVariant = "desktop" | "compact" | "islandNear" | "islandMid";

/**
 * The deterministic blade field both grass renderer checks are built on.
 *
 * It is one instanced source triangle with the production attribute set, laid
 * out so the LOD keep test, the sub-pixel clamp, the trail and the contact disc
 * all resolve differently across the field rather than uniformly.
 */
const BLADE_HALF_WIDTH = 0.021;
const BLADE_HEIGHT = 0.42;
const INSTANCES_PER_AXIS = 22;
const FIELD_HALF_EXTENT = 1.25;
function hash01(index: number, salt: number): number {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** One source triangle, exactly the topology the near layers instance. */
export function createBladeGeometry(): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(
    [-BLADE_HALF_WIDTH, 0, 0, BLADE_HALF_WIDTH, 0, 0, 0, BLADE_HEIGHT, 0], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("grassProgress", new Float32BufferAttribute([0, 0, 1], 1));
  geometry.setAttribute("grassPhase", new Float32BufferAttribute([0.5, 0.5, 0.5], 1));
  geometry.setAttribute("grassBladeShade", new Float32BufferAttribute([0.42, 0.42, 0.42], 1));
  geometry.setAttribute("grassBladeWidth", new Float32BufferAttribute(
    [BLADE_HALF_WIDTH, BLADE_HALF_WIDTH, BLADE_HALF_WIDTH], 1));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

/** Deterministic placement, variation, silhouette and biome rows. */
/** A complete, independently owned blade field. */
export function createGrassField(): InstancedMesh {
  return createInstances(createBladeGeometry());
}

export function createInstances(geometry: InstancedBufferGeometry): InstancedMesh {
  const count = INSTANCES_PER_AXIS * INSTANCES_PER_AXIS;
  const variation = new Float32Array(count * 4);
  const shape = new Float32Array(count * 4);
  const coverage = new Float32Array(count);
  const biome = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    for (let channel = 0; channel < 4; channel++) {
      variation[index * 4 + channel] = hash01(index, channel);
      shape[index * 4 + channel] = hash01(index, 8 + channel);
    }
    // Instance variation y scales the wind bend, so it must not sit at zero for
    // the whole field or the deformation comparison would test a still meadow.
    variation[index * 4 + 1] = 0.6 + hash01(index, 17) * 0.6;
    coverage[index] = 0.55 + hash01(index, 21) * 0.45;
    biome[index] = Math.floor(hash01(index, 23) * GRASS_MAX_BIOMES);
  }
  geometry.setAttribute("instanceVariation", new InstancedBufferAttribute(variation, 4));
  geometry.setAttribute("instanceShape", new InstancedBufferAttribute(shape, 4));
  geometry.setAttribute("instanceCoverage", new InstancedBufferAttribute(coverage, 1));
  geometry.setAttribute("instanceBiome", new InstancedBufferAttribute(biome, 1));
  // An InstancedBufferGeometry defaults to an infinite instance count, which
  // the node backends reject outright at draw time.
  geometry.instanceCount = count;
  const mesh = new InstancedMesh(geometry, undefined, count);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  for (let index = 0; index < count; index++) {
    const column = index % INSTANCES_PER_AXIS;
    const row = Math.floor(index / INSTANCES_PER_AXIS);
    const spacing = (FIELD_HALF_EXTENT * 2) / (INSTANCES_PER_AXIS - 1);
    position.set(-FIELD_HALF_EXTENT + column * spacing + (hash01(index, 31) - 0.5) * spacing * 0.6,
      0, -FIELD_HALF_EXTENT + row * spacing + (hash01(index, 37) - 0.5) * spacing * 0.6);
    rotation.setFromEuler(new Euler(0, hash01(index, 41) * Math.PI * 2, 0));
    // Non-uniform instance scale is what makes the inverse-scale correction on
    // the blade-plane normal observable at all.
    scale.set(0.82 + hash01(index, 43) * 0.5, 0.7 + hash01(index, 47) * 0.75,
      0.82 + hash01(index, 53) * 0.5);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  // Both implementations draw the packed geometry, so the packing itself stays
  // inside what the comparison verifies rather than beside it.
  prepareGrassNodeGeometry(geometry);
  return mesh;
}

/** A short scuff across the middle of the field, in the trail map's channels. */
export function createTrailTexture(): DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    const distance = Math.hypot((x + 0.5) / size - 0.55, (y + 0.5) / size - 0.45);
    const crush = Math.max(0, 1 - distance * 3.4);
    data[offset] = Math.round((0.5 + 0.42) * 255);
    data[offset + 1] = Math.round((0.5 - 0.24) * 255);
    data[offset + 2] = Math.round(crush * 255);
    data[offset + 3] = Math.round(Math.min(1, crush * 1.6) * 255);
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

export function configureUniforms(state: GrassNearMaterial, trailMap: DataTexture, interactive: boolean): void {
  const u = state.shaderUniforms;
  u.uGrassTime.value = 12.5;
  u.uGrassWindDirection.value.set(0.8, 0.35).normalize();
  u.uGrassWindStrength.value = 0.14;
  u.uGrassGustScale.value = 0.08;
  u.uGrassGustSpeed.value = 0.65;
  u.uGrassFlutterStrength.value = 0.035;
  u.uGrassFlutterSpeed.value = 3.4;
  u.uGrassMicroFadeRange.value.set(1.6, 3.4);
  u.uGrassNormalUpRange.value.set(0.2, 0.45);
  // A near distance inside the camera's own range is what makes the keep test
  // resolve differently across the field instead of accepting every blade.
  u.uGrassNearDistance.value = 2.5;
  u.uGrassMidDistance.value = 6;
  u.uGrassTransitionDistance.value = 0.6;
  u.uGrassArtDensityScale.value = 1;
  u.uGrassLodDensityScale.value = 0.85;
  u.uGrassShapeTipDrift.value = 0.8;
  u.uGrassSheenFadeDistance.value = 4;
  u.uGrassPixelWorldScale.value = 0.00107;
  u.uGrassWindNoise.value = getGrassWindNoiseTexture();
  u.uGrassWindNoiseScale.value = GRASS_WIND_NOISE_SCALE;
  u.uGrassWindNoiseSpeed.value = GRASS_WIND_NOISE_SPEED;
  state.setBladeHalfWidth(BLADE_HALF_WIDTH);
  // Threshold-LOD materials read these instead of the distance fades above; the
  // pair keeps blades on both sides of the near/mid split visible at once.
  state.setLodThreshold(0.5, 0.95);
  if (!interactive) return;
  u.uGrassTrailMap.value = trailMap;
  u.uGrassTrailCenter.value.set(0, 0);
  u.uGrassTrailInverseCoverage.value = 1 / 2.5;
  u.uGrassTrailStrength.value = 1;
  u.uGrassGroundShadowDisc.value.set(0.2, 0, -0.1, 0.9);
  u.uGrassGroundShadowStrength.value = 0.6;
}

export function createGrassComparisonState(variant: GrassComparisonVariant): GrassNearMaterial {
  if (variant === "desktop") {
    return new GrassNearMaterial({ name: "grass-comparison-desktop",
      cacheKey: "grass-comparison-desktop", vertexPalette: false, interactive: true,
      subPixelWidth: true, sheen: true, noiseWind: true, microWind: true, shapeVariation: true,
      ditherSeed: 0x51ed270b });
  }
  if (variant === "compact") {
    return new GrassNearMaterial({ name: "grass-comparison-compact",
      cacheKey: "grass-comparison-compact", vertexPalette: true, interactive: false,
      subPixelWidth: false, sheen: false, noiseWind: false, microWind: false,
      shapeVariation: false, instanceFreeDither: true, ditherSeed: 0x2f6e2b3 });
  }
  // The island scene's own two layers, with its legacy dither seed.
  return new GrassNearMaterial({ name: `grass-comparison-${variant}`,
    cacheKey: `grass-comparison-${variant}`, worldLod: false,
    invertLodCoverage: variant === "islandMid",
    windLodScale: variant === "islandMid" ? 0.62 : 1, ditherSeed: 0x9e3779b9 });
}

