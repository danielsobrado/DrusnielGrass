import {
  AmbientLight, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, RenderTarget, Scene,
  WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { WorldDetailFoliageNodeMaterial } from "../world/grass/WorldDetailFoliageNodeMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { GRASS_ACCENT_SPECIES, GRASS_MAX_ACCENT_SPECIES } from "../grass/biome/GrassAccentSpecies";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";
import {
  createFoliageAtlas, createFoliageField, createFoliageState, type GrassFoliageVariant,
} from "./GrassFoliageFixture";

/** The sun sits beyond the cards so the transmission term is actually driven. */
function createLights(): { sun: DirectionalLight; ambient: AmbientLight; hemisphere: HemisphereLight } {
  const sun = new DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(4, 6, -24);
  const ambient = new AmbientLight(0x9fb4c8, 0.55);
  const hemisphere = new HemisphereLight(0xbdd7ee, 0x4a5236, 0.7);
  hemisphere.position.set(0, 1, 0);
  return { sun, ambient, hemisphere };
}

export function createFoliageSpeciesWind(): Float32Array {
  const speciesWind = new Float32Array(GRASS_MAX_ACCENT_SPECIES);
  for (const species of GRASS_ACCENT_SPECIES) speciesWind[species.index] = species.windWeight;
  return speciesWind;
}

/**
 * Compares the node accent-foliage card against the shipped GLSL material.
 *
 * Like the impostors, these cards light themselves, so the comparison covers
 * the complete blended output: the species-staggered distance fade with its
 * world-space wander, the density early-out, groundcover splay, wind ramp,
 * atlas cell addressing, the distance-loosened cutout, the understory edge
 * term, the phenotype-varied petal tint, irradiance and transmission.
 */
export async function compareGrassFoliageMaterial(renderer: WebGPURenderer,
  variant: GrassFoliageVariant, singlePass: boolean) {
  const width = 288, height = 192;
  const atlas = createFoliageAtlas();
  const mesh = createFoliageField();
  const legacyMesh = createFoliageField();
  const { sun, ambient, hemisphere } = createLights();
  const scene = new Scene();
  scene.background = new Color(0);
  scene.add(sun, ambient, hemisphere);
  const context = new WorldNodeMaterialContext(sun, [ambient, hemisphere]);
  const state = createFoliageState(atlas, variant, context);
  const nodeMaterial = new WorldDetailFoliageNodeMaterial(`grass-foliage-node-${variant}`,
    state.shaderUniforms, state.nodeFeatures, createFoliageSpeciesWind(), context);
  // The shipped GLSL card, built over the same uniform table the node material
  // reads. Production draws only the node one.
  const legacyMaterial = state.createLegacyMaterial();
  if (singlePass) {
    // Compare the material, not the renderer. Three's node renderer honours the
    // two-pass back/front order for double-sided transparent materials where
    // the WebGL renderer here draws once, so with both passes live the two
    // renders can resolve a different overlapping card at the same pixel. The
    // caller measures that separately; this mode isolates the shading.
    for (const material of [nodeMaterial, legacyMaterial]) material.forceSinglePass = true;
  }
  mesh.material = nodeMaterial;
  scene.add(mesh);

  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  const legacyLights = createLights();
  legacyScene.add(legacyLights.sun, legacyLights.ambient, legacyLights.hemisphere);
  legacyMesh.material = legacyMaterial;
  legacyScene.add(legacyMesh);

  const camera = new PerspectiveCamera(50, width / height, 0.05, 60);
  camera.position.set(0, 0.55, 1.6);
  camera.lookAt(0, 0.25, -6);
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
    // The cutout decides coverage per fragment, so the two renders are compared
    // as two questions: do the same pixels survive, and where both do, is the
    // blended colour the same.
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
    return { variant, singlePass, width, height, maximum, mean: total / Math.max(shared * 3, 1),
      differing, nonzero, legacyNonzero, shared, coverageMismatch, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([nodeMaterial, legacyMaterial, state, mesh.geometry, legacyMesh.geometry,
      mesh, legacyMesh, target, legacyTarget, legacy]);
  }
}
