import {
  AmbientLight, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, RenderTarget, Scene,
  WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { WorldGrassImpostorNodeMaterial } from "../world/grass/WorldGrassImpostorNodeMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";
import {
  createImpostorAtlas, createImpostorField, createImpostorState, type GrassImpostorVariant,
} from "./GrassImpostorFixture";

/**
 * The same three sources both implementations sum, in the same order.
 *
 * The sun sits beyond the cards rather than behind the camera, so the
 * transmission term is actually driven: with the light behind the viewer it
 * evaluates to zero on both sides and the comparison would agree about nothing.
 */
function createLights(): { sun: DirectionalLight; ambient: AmbientLight; hemisphere: HemisphereLight } {
  const sun = new DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(5, 8, -30);
  const ambient = new AmbientLight(0x9fb4c8, 0.55);
  const hemisphere = new HemisphereLight(0xbdd7ee, 0x4a5236, 0.7);
  hemisphere.position.set(0, 1, 0);
  return { sun, ambient, hemisphere };
}

/**
 * Compares the node impostor card against the shipped GLSL material.
 *
 * Unlike the blades, the cards light themselves in the vertex stage, so this
 * comparison covers the complete output: billboard orientation, the
 * hemi-octahedral view selection and atlas addressing, the minification,
 * alpha and coverage dithers with their discards, the palette, ambient,
 * hemisphere and directional irradiance, and the transmission term.
 */
export async function compareGrassImpostorMaterial(renderer: WebGPURenderer,
  variant: GrassImpostorVariant) {
  const width = 288, height = 192;
  const atlas = createImpostorAtlas();
  const state = createImpostorState(atlas, variant);
  const mesh = createImpostorField(atlas);
  const legacyMesh = createImpostorField(atlas);
  const { sun, ambient, hemisphere } = createLights();
  const scene = new Scene();
  scene.background = new Color(0);
  scene.add(sun, ambient, hemisphere);
  scene.updateMatrixWorld(true);
  const context = new WorldNodeMaterialContext(sun, [ambient, hemisphere]);
  const nodeMaterial = new WorldGrassImpostorNodeMaterial(`grass-impostor-node-${variant}`,
    state.shaderUniforms, state.nodeFeatures, context);
  mesh.material = nodeMaterial;
  scene.add(mesh);

  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  const legacyLights = createLights();
  legacyScene.add(legacyLights.sun, legacyLights.ambient, legacyLights.hemisphere);
  legacyMesh.material = state.material;
  legacyScene.add(legacyMesh);

  const camera = new PerspectiveCamera(50, width / height, 0.1, 200);
  camera.position.set(0, 1.6, 4.5);
  camera.lookAt(0, 0.6, -14);
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
    // A card decides its own coverage stochastically, so the two renders are
    // compared as two questions: do the same pixels survive the discards, and
    // where both survive, is the shading the same.
    let maximum = 0, total = 0, nonzero = 0, differing = 0, legacyNonzero = 0;
    let shared = 0, coverageMismatch = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const reference = ((flip ? height - y - 1 : y) * width + x) * 4;
      const lit = pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 0;
      const legacyLit = expected[reference] + expected[reference + 1] + expected[reference + 2] > 0;
      if (lit) nonzero++;
      if (legacyLit) legacyNonzero++;
      if (lit !== legacyLit) { coverageMismatch++; continue; }
      if (!lit) continue;
      shared++;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(pixels[offset + channel] - expected[reference + channel]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    return { variant, width, height, maximum, mean: total / Math.max(shared * 3, 1),
      differing, nonzero, legacyNonzero, shared, coverageMismatch, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([nodeMaterial, state, mesh.geometry, legacyMesh.geometry, mesh, legacyMesh,
      target, legacyTarget, legacy]);
  }
}
