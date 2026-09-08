import {
  AmbientLight, Color, DirectionalLight, MeshBasicNodeMaterial, PerspectiveCamera, RenderTarget,
  Scene, WebGPUCoordinateSystem, type NodeBuilder, type WebGPURenderer,
} from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget, DoubleSide } from "three";
import { mat4, positionGeometry, varying, vec4, Fn } from "three/tsl";
import { createGrassNodeUniforms } from "../grass/materials/GrassNearNodeInputs";
import { createGrassNearNodes, setupGrassPosition } from "../grass/materials/GrassNearNodes";
import { instanceMatrixColumns } from "../render/InstanceMatrixNode";
import { GrassNearNodeMaterial } from "../grass/materials/GrassNearNodeMaterial";
import { createGrassNearLegacyMaterial } from "../grass/materials/GrassNearLegacyMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";
import {
  configureUniforms, createGrassComparisonState, createGrassField, createTrailTexture,
  type GrassComparisonVariant,
} from "./GrassNearFixture";

/**
 * Deformation is compared as the offset from the undeformed instanced vertex,
 * not as an absolute position: over a 1.5-per-metre encoding one RGBA8 step is
 * 2.6 mm of blade movement, where an absolute world position over the same
 * eight bits would only resolve centimetres and hide real wind differences.
 */
const DEFORMATION_ENCODE_SCALE = 1.5;

export type GrassComparisonMode = "albedo" | "deformation" | "ambient" | "directional";

/**
 * The sun sits low, behind the field and slightly off the camera axis.
 *
 * Transmission needs light travelling through the blade towards the camera, so
 * a sun placed on the camera's own side would drive `intoSun` to zero and the
 * run would compare two black backlight terms and prove nothing. The offset in
 * x keeps the half-vector away from the degenerate `sun + view` case the sheen
 * lobe guards, which is covered separately by that guard's own branch.
 */
function createDirectionalLights() {
  const sun = new DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(2.4, 1.35, -7.5);
  return { sun, ambient: new AmbientLight(0xc3d7ed, 0.4) };
}

/**
 * Compares the node grass blade against the shipped GLSL material.
 *
 * Albedo covers the palette, biome rows, gust tip lift and contact shading;
 * deformation covers the silhouette, the LOD keep test, the sub-pixel width
 * clamp, wind and the character trail. The ambient run compares the real
 * material's lighting response without an optional directional-light context;
 * the directional run adds a sun and so covers the terms only it reaches — the
 * transmission lobe on every variant, and the waxy sheen on the one variant
 * whose feature set enables it.
 */
export async function compareGrassNearMaterial(renderer: WebGPURenderer,
  variant: GrassComparisonVariant, mode: GrassComparisonMode) {
  const width = 256, height = 176;
  const state = createGrassComparisonState(variant);
  const trailMap = createTrailTexture();
  const mesh = createGrassField();
  configureUniforms(state, trailMap, state.nodeFeatures.interactive);
  const inputs = createGrassNodeUniforms(state.shaderUniforms);
  const graph = createGrassNearNodes(inputs, state.nodeFeatures);
  // The isolation material needs the blade's own position setup: three's
  // built-in instancing would emit a second instance matrix.
  class GrassIsolationMaterial extends MeshBasicNodeMaterial {
    override setupPosition(builder: NodeBuilder) {
      return setupGrassPosition(builder, graph.position);
    }
  }
  // Both lit modes compare the shipped materials themselves rather than an
  // isolated output channel, so neither side is patched below.
  const lit = mode === "ambient" || mode === "directional";
  const lights = mode === "directional" ? createDirectionalLights() : undefined;
  const legacyLights = mode === "directional" ? createDirectionalLights() : undefined;
  const context = lights && new WorldNodeMaterialContext(lights.sun, [lights.ambient]);
  const nodeMaterial = lit
    ? new GrassNearNodeMaterial(`${mode}-comparison`, state.shaderUniforms, state.nodeFeatures, context)
    : new GrassIsolationMaterial({ side: DoubleSide, toneMapped: false });
  if (!lit) nodeMaterial.positionNode = graph.position;
  if (mode === "albedo") {
    nodeMaterial.colorNode = graph.color;
  } else if (mode === "deformation") {
    const deformation = Fn((builder: NodeBuilder) => {
      const columns = instanceMatrixColumns(builder);
      const source = mat4(columns[0], columns[1], columns[2], columns[3])
        .mul(vec4(positionGeometry, 1)).xyz;
      return graph.position.sub(source);
    })();
    nodeMaterial.colorNode = varying(deformation).mul(DEFORMATION_ENCODE_SCALE).add(0.5).clamp(0, 1);
  }

  // The shipped GLSL blade, over the state owner's own uniform table. Kept out
  // of the production bundle: only this comparison reaches it.
  const legacyMaterial = createGrassNearLegacyMaterial(state.shaderUniforms,
    state.options, { ...state.nodeFeatures });
  legacyMaterial.dithering = false;
  const compile = legacyMaterial.onBeforeCompile;
  legacyMaterial.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    if (lit) return;
    if (mode === "albedo") {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
        "outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>");
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vGrassDebug;\nvoid main() {")
      .replace("#include <project_vertex>",
        `vGrassDebug = (instanceMatrix * vec4(transformed, 1.0)).xyz -
          (instanceMatrix * vec4(position, 1.0)).xyz;\n#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "varying vec3 vGrassDebug;\nvoid main() {")
      .replace("#include <opaque_fragment>",
        `outgoingLight = clamp(vGrassDebug * ${DEFORMATION_ENCODE_SCALE.toFixed(1)} + 0.5, 0.0, 1.0);
         #include <opaque_fragment>`);
  };

  const camera = new PerspectiveCamera(45, width / height, 0.05, 40);
  camera.position.set(0, 0.62, 2.35);
  camera.lookAt(0, 0.2, 0);
  camera.updateMatrixWorld();
  const scene = new Scene();
  scene.background = new Color(0);
  mesh.material = nodeMaterial;
  scene.add(mesh);
  if (mode === "ambient") scene.add(new AmbientLight(0xc3d7ed, 0.4));
  // A light belongs to one parent, so each scene gets its own matched pair.
  if (lights) scene.add(lights.sun, lights.ambient);
  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  const legacyMesh = createGrassField();
  legacyMesh.material = legacyMaterial;
  legacyScene.add(legacyMesh);
  if (mode === "ambient") legacyScene.add(new AmbientLight(0xc3d7ed, 0.4));
  if (legacyLights) legacyScene.add(legacyLights.sun, legacyLights.ambient);
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
    disposeResources([inputs, nodeMaterial, legacyMaterial, mesh.geometry, legacyMesh.geometry, mesh, legacyMesh,
      trailMap, target, legacyTarget, legacy]);
  }
}
