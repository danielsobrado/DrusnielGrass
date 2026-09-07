import {
  AmbientLight, Color, DataTexture, DirectionalLight, HemisphereLight,
  LinearFilter, Mesh, PerspectiveCamera, RedFormat,
  RenderTarget, RepeatWrapping, Scene, SphereGeometry, UnsignedByteType, Vector2,
  WebGPUCoordinateSystem, type BufferGeometry, type Texture, type WebGPURenderer,
} from "three/webgpu";
import { MeshLambertMaterial, WebGLRenderer, WebGLRenderTarget } from "three";
import { diffuseColor, normalView, texture as textureNode, uniform, vec4 } from "three/tsl";
import {
  createStoneRenderBuffers, createStoneRenderGeometry, STONE_BEDDING_OFFSET, STONE_BYTE_MAX,
  STONE_BYTE_STRIDE, STONE_COLOR_OFFSET, STONE_GROWTH_POSITION_OFFSET, STONE_GROWTH_SEED_OFFSET,
  STONE_INT16_NORMAL_MAX, STONE_LICHEN_COLOR_OFFSET, STONE_LICHEN_OFFSET, STONE_MOSS_COLOR_OFFSET,
  STONE_MOSS_OFFSET, STONE_NORMAL_OFFSET, STONE_SHORT_STRIDE, STONE_WET_OFFSET,
  STONE_WEATHERING_OFFSET, type StoneRenderBounds,
} from "../world/stones/StoneRenderPacking";
import { prepareStoneNodeGeometry } from "../world/stones/StoneNodeGeometry";
import {
  applyStoneCoarseSurfaceShader, applyStoneSurfaceShader, STONE_CRUST_BREAKUP,
  STONE_DRY_SHEEN_POWER, STONE_DRY_SHEEN_STRENGTH, STONE_WET_DARKEN, STONE_WET_SHEEN_POWER,
  STONE_WET_SHEEN_STRENGTH,
} from "../world/stones/StoneGrowthShader";
import {
  StoneCoarseNodeMaterial, StoneSurfaceNodeMaterial,
} from "../world/stones/StoneSurfaceNodeMaterial";
import { createStoneSurfaceAttributes } from "../world/stones/StoneSurfaceNodes";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import type { WorldConfig } from "../world/WorldConfig";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

const GRAIN_SIZE = 64;

export type StoneComparisonMode = "albedo" | "normal";
export type StoneComparisonVariant = "detail" | "coarse";

function hash01(index: number, salt: number): number {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** A deterministic stand-in for the baked grain, tiled the way the real one is. */
function createGrainTexture(): DataTexture {
  const data = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE);
  for (let y = 0; y < GRAIN_SIZE; y++) for (let x = 0; x < GRAIN_SIZE; x++) {
    const value = Math.sin(x * 0.7) * Math.cos(y * 0.53) * 0.5 + 0.5;
    data[y * GRAIN_SIZE + x] = Math.round(value * 255);
  }
  const texture = new DataTexture(data, GRAIN_SIZE, GRAIN_SIZE, RedFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One stone body carrying every baked channel, in the production packing.
 *
 * Weathering, bedding, moss, lichen and wetness all ramp across the sphere, so
 * the crust and stain thresholds, the bedding partings, the colony masks and
 * the waterline all resolve somewhere on the same body rather than needing one
 * fixture per branch. The channels go through `createStoneRenderGeometry`
 * rather than as loose float attributes: that is the layout the field ships,
 * three interleaved streams rather than thirteen buffers, and the node backends
 * bind at most eight.
 */
function createStoneGeometry(): BufferGeometry {
  const source = new SphereGeometry(1, 48, 32).toNonIndexed();
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const vertexCount = position.count;
  const buffers = createStoneRenderBuffers(vertexCount, vertexCount);
  const base = new Color("#7d7a72"), mossTone = new Color("#4f6b39");
  const lichenTone = new Color("#a8b08c");
  const byte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * STONE_BYTE_MAX);
  const short = (value: number) =>
    Math.round(Math.max(-1, Math.min(1, value)) * STONE_INT16_NORMAL_MAX);
  for (let index = 0; index < vertexCount; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    buffers.positions.set([x, y, z], index * 3);
    const shortOffset = index * STONE_SHORT_STRIDE;
    buffers.packedShorts[shortOffset + STONE_NORMAL_OFFSET] = short(normal.getX(index));
    buffers.packedShorts[shortOffset + STONE_NORMAL_OFFSET + 1] = short(normal.getY(index));
    buffers.packedShorts[shortOffset + STONE_NORMAL_OFFSET + 2] = short(normal.getZ(index));
    buffers.packedShorts[shortOffset + STONE_GROWTH_POSITION_OFFSET] = short(x * 0.5);
    buffers.packedShorts[shortOffset + STONE_GROWTH_POSITION_OFFSET + 1] = short((y + 1) * 0.5);
    buffers.packedShorts[shortOffset + STONE_GROWTH_POSITION_OFFSET + 2] = short(z * 0.5);
    const byteOffset = index * STONE_BYTE_STRIDE;
    const shade = 0.85 + hash01(index, 1) * 0.3;
    buffers.packedBytes[byteOffset + STONE_COLOR_OFFSET] = byte(base.r * shade);
    buffers.packedBytes[byteOffset + STONE_COLOR_OFFSET + 1] = byte(base.g);
    buffers.packedBytes[byteOffset + STONE_COLOR_OFFSET + 2] = byte(base.b);
    buffers.packedBytes[byteOffset + STONE_MOSS_OFFSET] = byte(Math.max(0, (y + 0.2) * 0.9));
    buffers.packedBytes[byteOffset + STONE_LICHEN_OFFSET] = byte(Math.max(0, (0.4 - y) * 0.6));
    buffers.packedBytes[byteOffset + STONE_GROWTH_SEED_OFFSET] = byte(0.37);
    buffers.packedBytes[byteOffset + STONE_MOSS_COLOR_OFFSET] = byte(mossTone.r);
    buffers.packedBytes[byteOffset + STONE_MOSS_COLOR_OFFSET + 1] = byte(mossTone.g);
    buffers.packedBytes[byteOffset + STONE_MOSS_COLOR_OFFSET + 2] = byte(mossTone.b);
    buffers.packedBytes[byteOffset + STONE_LICHEN_COLOR_OFFSET] = byte(lichenTone.r);
    buffers.packedBytes[byteOffset + STONE_LICHEN_COLOR_OFFSET + 1] = byte(lichenTone.g);
    buffers.packedBytes[byteOffset + STONE_LICHEN_COLOR_OFFSET + 2] = byte(lichenTone.b);
    // Wetness is a waterline, not a gradient: it has to cut off somewhere.
    buffers.packedBytes[byteOffset + STONE_WET_OFFSET] =
      byte(y < -0.35 ? Math.min(1, (-0.35 - y) * 2.2) : 0);
    buffers.packedBytes[byteOffset + STONE_WEATHERING_OFFSET] = byte((x + 1) / 2);
    buffers.packedBytes[byteOffset + STONE_BEDDING_OFFSET] = byte(z > 0 ? 0.8 : 0);
    buffers.indices[index] = index;
  }
  source.dispose();
  const bounds: StoneRenderBounds = {
    minimumX: -1, minimumY: -1, minimumZ: -1, maximumX: 1, maximumY: 1, maximumZ: 1,
  };
  const geometry = createStoneRenderGeometry(buffers, bounds);
  prepareStoneNodeGeometry(geometry);
  return geometry;
}

function createLights(): { sun: DirectionalLight; ambient: AmbientLight; hemisphere: HemisphereLight } {
  const sun = new DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(5, 7, 6);
  const ambient = new AmbientLight(0x9fb4c8, 0.4);
  const hemisphere = new HemisphereLight(0xbcd8f0, 0x5a5240, 0.8);
  hemisphere.position.set(0, 1, 0);
  return { sun, ambient, hemisphere };
}

/**
 * Compares the node stone surface against the shipped GLSL patch.
 *
 * Albedo covers the weathering crust and stain, the bedding partings, the moss
 * and lichen colonies with their breakup and runoff, the triplanar grain and
 * the wet darkening. Normals cover the derivative-built grain bump. The lit
 * additions the material owns — sky-side fill, ambient floor and sheen — are
 * exercised by the harness scene rather than by this isolation.
 */
export async function compareStoneSurface(renderer: WebGPURenderer, config: WorldConfig,
  variant: StoneComparisonVariant, mode: StoneComparisonMode) {
  const width = 224, height = 224;
  const geometry = createStoneGeometry();
  const grainTexture = createGrainTexture();
  const growthFadeEnd = config.stoneGrowthDetailFadeDistance;
  const growthFadeStart = growthFadeEnd * 0.55;
  const grainFadeEnd = config.stoneGrainFadeDistance;
  const grainFadeStart = grainFadeEnd * 0.6;
  const attributes = createStoneSurfaceAttributes();
  const { sun, ambient, hemisphere } = createLights();
  const scene = new Scene();
  scene.background = new Color(0);
  scene.add(sun, ambient, hemisphere);
  const context = new WorldNodeMaterialContext(sun, [ambient, hemisphere]);
  const detail = variant === "detail";
  const surface = detail
    ? new StoneSurfaceNodeMaterial("stone-node-detail", {
      crustBreakup: uniform(STONE_CRUST_BREAKUP),
      wetDarken: uniform(STONE_WET_DARKEN),
      growthDetailStrength: uniform(config.stoneGrowthDetailStrength),
      growthDetailScale: uniform(1 / config.stoneGrowthDetailSize),
      growthDetailFadeSquared: uniform(new Vector2(growthFadeStart * growthFadeStart,
        growthFadeEnd * growthFadeEnd)),
      mossStreakStrength: uniform(config.stoneMossStreakStrength),
      grain: {
        texture: textureNode(grainTexture),
        strength: uniform(config.stoneGrainStrength),
        normalStrength: uniform(config.stoneGrainNormalStrength),
        scale: uniform(1 / config.stoneGrainSize),
        fadeSquared: uniform(new Vector2(grainFadeStart * grainFadeStart,
          grainFadeEnd * grainFadeEnd)),
      },
    }, {
      wetSheenStrength: uniform(STONE_WET_SHEEN_STRENGTH),
      wetSheenPower: uniform(STONE_WET_SHEEN_POWER),
      drySheenStrength: uniform(STONE_DRY_SHEEN_STRENGTH),
      drySheenPower: uniform(STONE_DRY_SHEEN_POWER),
    }, attributes, context, true)
    : new StoneCoarseNodeMaterial("stone-node-coarse", uniform(STONE_WET_DARKEN),
      attributes, context);

  // Isolation goes through the real material, not a basic stand-in.
  // `MeshBasicNodeMaterial.setupNormal` returns the geometry normal and ignores
  // `normalNode` outright (three #28839), so a basic isolation would have
  // compared an unperturbed normal against the shipped bumped one and called
  // the difference a pass.
  surface.outputNode = mode === "normal"
    ? vec4(normalView.mul(0.5).add(0.5), 1)
    : vec4(diffuseColor.rgb, 1);
  const mesh = new Mesh(geometry, surface);
  scene.add(mesh);

  const legacyMaterial = new MeshLambertMaterial({ vertexColors: true });
  legacyMaterial.dithering = detail;
  if (detail) {
    applyStoneSurfaceShader(legacyMaterial, config, grainTexture as unknown as Texture);
  } else {
    applyStoneCoarseSurfaceShader(legacyMaterial);
  }
  const compile = legacyMaterial.onBeforeCompile;
  legacyMaterial.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      `outgoingLight = ${mode === "normal" ? "normal * 0.5 + 0.5" : "diffuseColor.rgb"};
       #include <opaque_fragment>`);
  };
  legacyMaterial.dithering = false;
  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  const legacyLights = createLights();
  legacyScene.add(legacyLights.sun, legacyLights.ambient, legacyLights.hemisphere);
  legacyScene.add(new Mesh(geometry, legacyMaterial));

  const camera = new PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(1.9, 1.3, 2.4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const legacy = new WebGLRenderer();
  const target = new RenderTarget(width, height);
  const legacyTarget = new WebGLRenderTarget(width, height);
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = await readRenderTargetRgba8(renderer, target);
    legacy.setRenderTarget(legacyTarget);
    legacy.render(legacyScene, camera.clone());
    const expected = new Uint8Array(width * height * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, width, height, expected);
    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    let maximum = 0, total = 0, nonzero = 0, differing = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const reference = ((flip ? height - y - 1 : y) * width + x) * 4;
      if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 0) nonzero++;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(pixels[offset + channel] - expected[reference + channel]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    return { variant, mode, width, height, maximum, mean: total / (width * height * 3),
      differing, nonzero, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([surface, legacyMaterial, geometry, grainTexture, target,
      legacyTarget, legacy]);
  }
}
