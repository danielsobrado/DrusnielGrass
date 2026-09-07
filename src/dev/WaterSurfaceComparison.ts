import {
  AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight, Mesh,
  MeshBasicMaterial, PerspectiveCamera, RenderTarget, Scene, Vector2,
  WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { diffuseColor, normalView, roughness, vec3, vec4 } from "three/tsl";
import { WaterMaterialController } from "../world/hydrology/WaterMaterialController";
import { WaterSurfaceNodeMaterial } from "../world/hydrology/WaterSurfaceNodeMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import type { WorldConfig } from "../world/WorldConfig";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";
import { WaterRefractionNodePass } from "../world/hydrology/WaterRefractionNodePass";
import { WaterRefractionPass, WATER_REFRACTION_LAYER } from "../world/hydrology/WaterRefractionPass";

const GRID = 96;
const EXTENT = 24;

/** What the surface writes, isolated one at a time through the real material. */
export type WaterSurfaceChannel = "albedo" | "normal" | "alpha" | "roughness";

/**
 * A reach that carries every path the surface distinguishes.
 *
 * The meander gives both bank sides and the pool/riffle depth ratio; the first
 * band of rows drops the flow to zero so the lake regime, its exposure and its
 * shore wavelets all run; a standing ripple tilts the geometric normal so the
 * slope-energy term is not identically zero; and one stone blob with a wake
 * downstream of it exercises the interaction channel and its foam.
 */
function createWaterGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [], normals: number[] = [];
  const data: number[] = [], context: number[] = [], interaction: number[] = [];
  const indices: number[] = [];
  const height = (u: number, v: number) => Math.sin(u * 7) * 0.06 + Math.cos(v * 5) * 0.05;
  for (let row = 0; row <= GRID; row++) {
    for (let column = 0; column <= GRID; column++) {
      const u = column / GRID, v = row / GRID;
      const x = (u - 0.5) * EXTENT, z = (v - 0.5) * EXTENT;
      const centre = Math.sin(v * 3.1) * 4.5;
      const lateral = (x - centre) / 6;
      const coverage = Math.max(0, 1 - Math.abs(lateral) ** 1.6);
      const depth = coverage * (0.4 + v * 2.6);
      const bend = Math.cos(v * 3.1) * 0.9;
      const river = v > 0.22 ? Math.min(1, coverage * 1.2) : 0;
      const flow = Math.hypot(1, Math.cos(v * 3.1) * 1.4);
      const slopeX = Math.cos(u * 7) * 0.06 * 7 / EXTENT;
      const slopeZ = -Math.sin(v * 5) * 0.05 * 5 / EXTENT;
      const length = Math.hypot(slopeX, 1, slopeZ);
      positions.push(x, height(u, v), z);
      normals.push(-slopeX / length, 1 / length, -slopeZ / length);
      data.push(coverage, depth, river / flow, (river * Math.cos(v * 3.1) * 1.4) / flow);
      // The fourth channel is the normalized lake distance; inside the river it
      // is unused, and across the still band it must sweep shore to open water.
      context.push(bend, Math.max(-1, Math.min(1, lateral)), Math.sin(v * 5.7),
        Math.min(1, coverage * 1.15));
      const obstacle = Math.exp(-(((x - 2) ** 2 + z ** 2) / 2.56));
      const wake = Math.exp(-(((x - 2) / 1.2) ** 2 + ((z - 2) / 3) ** 2)) * 0.8;
      interaction.push(obstacle, wake);
      if (row < GRID && column < GRID) {
        const base = row * (GRID + 1) + column;
        indices.push(base, base + GRID + 1, base + 1, base + 1, base + GRID + 1, base + GRID + 2);
      }
    }
  }
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("waterData", new BufferAttribute(new Float32Array(data), 4));
  geometry.setAttribute("waterContext", new BufferAttribute(new Float32Array(context), 4));
  geometry.setAttribute("waterInteraction",
    new BufferAttribute(new Float32Array(interaction), 2));
  geometry.setIndex(indices);
  return geometry;
}

/** The node side's isolation, matched one for one by the GLSL insert below. */
const NODE_OUTPUT: Record<WaterSurfaceChannel, () => ReturnType<typeof vec4>> = {
  albedo: () => vec4(diffuseColor.rgb, 1),
  normal: () => vec4(normalView.mul(0.5).add(0.5), 1),
  alpha: () => vec4(vec3(diffuseColor.a), 1),
  roughness: () => vec4(vec3(roughness), 1),
};

const LEGACY_OUTPUT: Record<WaterSurfaceChannel, string> = {
  albedo: "outgoingLight = diffuseColor.rgb;",
  normal: "outgoingLight = normal * 0.5 + 0.5;",
  alpha: "outgoingLight = vec3(diffuseColor.a);",
  roughness: "outgoingLight = vec3(roughnessFactor);",
};

/**
 * Compares one channel of the node water surface against the shipped patch.
 *
 * The surface writes four separate things into `MeshPhysicalMaterial` and any
 * one of them can be wrong while the composite still looks like water, so each
 * is isolated through the real material rather than summed into a single image.
 * The optics preset is a uniform branch on both sides, which is why quality is
 * a parameter here: the standard path and the high path are different shaders
 * in every way that matters and only one of them is exercised per run.
 *
 * The alpha run reads the value the surface computed, not what blending would
 * then do with it: both sides write it into the colour channels and force the
 * written alpha to one.
 */
export async function compareWaterSurface(renderer: WebGPURenderer, config: WorldConfig,
  channel: WaterSurfaceChannel, quality: number, capturedRefraction = false) {
  const width = 256, height = 192;
  const geometry = createWaterGeometry();
  const controller = new WaterMaterialController(config, false);
  controller.update(7.5);
  // Through the controller's own setter, so the run also proves that the one
  // owner writes both the GLSL material's roughness and the node path's mirror
  // of it, and both optics presets, from a single call.
  controller.setLiveVisuals({ ...config, waterQuality: quality });
  const sun = new DirectionalLight(0xfff0d8, 2.1);
  sun.position.set(6, 9, 4);
  const ambient = new AmbientLight(0x9fb4c8, 0.5);
  const scene = new Scene();
  scene.background = new Color(0);
  scene.add(sun, ambient);
  const context = new WorldNodeMaterialContext(sun, [ambient]);
  const node = new WaterSurfaceNodeMaterial(controller.shaderUniforms, context);
  // Ordered dithering is an output detail both materials apply from the
  // fragment coordinate, and its pattern is not what this compares.
  node.dithering = false;
  // `NodeMaterial.setupDiffuseColor` applies the OPAQUE clamp — alpha forced to
  // one for a non-transparent material — inside its own setup, so an opaque
  // node material has already lost the alpha by the time `outputNode` reads it.
  // The GLSL path clamps in `<opaque_fragment>`, which is after the insert
  // point, which is why the legacy side can stay opaque and this one cannot.
  // Blending is harmless here: the output node writes alpha one over black.
  node.transparent = channel === "alpha";
  node.depthWrite = true;
  node.outputNode = NODE_OUTPUT[channel]();
  scene.add(new Mesh(geometry, node));

  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  const legacySun = new DirectionalLight(0xfff0d8, 2.1);
  legacySun.position.set(6, 9, 4);
  legacyScene.add(legacySun, new AmbientLight(0x9fb4c8, 0.5));
  const legacyMaterial = controller.material;
  legacyMaterial.dithering = false;
  legacyMaterial.transparent = false;
  legacyMaterial.depthWrite = true;
  const compile = legacyMaterial.onBeforeCompile;
  legacyMaterial.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      `${LEGACY_OUTPUT[channel]}\ndiffuseColor.a = 1.0;\n#include <opaque_fragment>`);
  };
  legacyMaterial.needsUpdate = true;
  legacyScene.add(new Mesh(geometry, legacyMaterial));

  const camera = new PerspectiveCamera(45, width / height, 0.1, 200);
  camera.position.set(0, 9, 17);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const legacy = new WebGLRenderer();
  const target = new RenderTarget(width, height);
  const legacyTarget = new WebGLRenderTarget(width, height);
  const previous = renderer.getRenderTarget();
  const previousSize = renderer.getSize(new Vector2());
  const previousPixelRatio = renderer.getPixelRatio();
  const capture = new WaterRefractionNodePass(0.5);
  const legacyCapture = new WaterRefractionPass(0.5);
  const captureScene = new Scene();
  const captureGeometry = new BoxGeometry(10, 0.5, 10);
  const captureMaterials = [new MeshBasicMaterial({ color: 0xe83916 }),
    new MeshBasicMaterial({ color: 0x164fe8 })];
  // Different colours at opposite ends expose a vertically mirrored lookup.
  // Empty space around these boxes also exercises the depth-coverage guard.
  for (let i = 0; i < 2; i++) {
    const box = new Mesh(captureGeometry, captureMaterials[i]);
    box.position.set(i ? 3 : -3, -1, i ? 6 : -6);
    box.layers.set(WATER_REFRACTION_LAYER);
    captureScene.add(box);
  }
  try {
    renderer.setRenderTarget(target);
    // Compile while optional samplers are empty, as happens before the first
    // high-quality capture or after changing quality at runtime.
    renderer.render(scene, camera);
    const control = capturedRefraction ? await readRenderTargetRgba8(renderer, target) : undefined;
    if (capturedRefraction) {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      legacy.setSize(width, height, false);
      capture.render(renderer, captureScene, camera);
      controller.shaderUniforms.tWaterRefraction.value = capture.texture;
      controller.shaderUniforms.tWaterRefractionDepth.value = capture.depthTexture;
      controller.shaderUniforms.uWaterRefractionSize.value.set(width, height);
      node.syncTextures();
      renderer.render(scene, camera);
    }
    const pixels = await readRenderTargetRgba8(renderer, target);
    let captureDiffering = 0;
    if (capturedRefraction) {
      legacyCapture.render(legacy, captureScene, camera);
      controller.shaderUniforms.tWaterRefraction.value = legacyCapture.texture;
      controller.shaderUniforms.tWaterRefractionDepth.value = legacyCapture.depthTexture;
      const raw = await readRenderTargetRgba8(renderer, capture.renderTarget!);
      const rawExpected = new Uint8Array(raw.length);
      legacy.readRenderTargetPixels(legacyCapture.renderTarget!, 0, 0, width / 2, height / 2, rawExpected);
      for (let y = 0; y < height / 2; y++) for (let x = 0; x < width / 2; x++) {
        const a = (y * width / 2 + x) * 4;
        const b = ((renderer.coordinateSystem === WebGPUCoordinateSystem ? height / 2 - y - 1 : y)
          * width / 2 + x) * 4;
        if ([0, 1, 2].some(c => Math.abs(raw[a + c] - rawExpected[b + c]) > 1)) captureDiffering++;
      }
    }
    legacy.setRenderTarget(legacyTarget);
    legacy.render(legacyScene, camera.clone());
    const expected = new Uint8Array(width * height * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, width, height, expected);
    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    let maximum = 0, total = 0, nonzero = 0, legacyNonzero = 0, differing = 0;
    let shared = 0, coverageMismatch = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const reference = ((flip ? height - y - 1 : y) * width + x) * 4;
      const lit = pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 0;
      const legacyLit = expected[reference] + expected[reference + 1] + expected[reference + 2] > 0;
      if (lit) nonzero++;
      if (legacyLit) legacyNonzero++;
      // The surface discards below a coverage threshold, so the two sides must
      // first agree about which fragments exist at all.
      if (lit !== legacyLit) { coverageMismatch++; continue; }
      if (!lit) continue;
      shared++;
      for (let component = 0; component < 3; component++) {
        const delta = Math.abs(pixels[offset + component] - expected[reference + component]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    let refractionChanged = 0;
    if (control) for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(...[0, 1, 2].map((c) => Math.abs(pixels[i + c] - control[i + c]))) > 1) {
        refractionChanged++;
      }
    }
    return { channel, quality, capturedRefraction, refractionChanged, captureDiffering,
      width, height, maximum, mean: total / Math.max(shared * 3, 1),
      differing, nonzero, legacyNonzero, shared, coverageMismatch, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    renderer.setPixelRatio(previousPixelRatio);
    renderer.setSize(previousSize.x, previousSize.y, false);
    disposeResources([node, controller, geometry, target, legacyTarget, legacy,
      capture, legacyCapture, captureGeometry, ...captureMaterials]);
  }
}
