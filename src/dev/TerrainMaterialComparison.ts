import { Color, DirectionalLight, Mesh, PerspectiveCamera, RenderTarget, Scene, WebGPUCoordinateSystem, type WebGPURenderer } from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { diffuseColor, normalView, vec4 } from "three/tsl";
import type { WorldConfig } from "../world/WorldConfig";
import { TerrainMaterialController } from "../world/TerrainMaterialController";
import { createRendererTerrainFixture } from "./RendererTerrainFixture";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

/** Compare raw terrain albedo, excluding changes in Three's lighting model. */
export async function compareTerrainMaterial(renderer: WebGPURenderer, config: WorldConfig, compact: boolean, mode: "albedo" | "normal" = "albedo") {
  const width = 192, height = 128;
  const scene = new Scene();
  scene.background = new Color(0);
  scene.add(new DirectionalLight());
  const fixture = createRendererTerrainFixture(scene, config, compact);
  // Isolated through the real material rather than a basic stand-in.
  // `MeshBasicNodeMaterial.setupNormal` returns the geometry normal and ignores
  // `normalNode` outright (three #28839), so a basic isolation compared an
  // unperturbed normal against the shipped perturbed one — it measured the
  // difference between the two normals, not agreement between them.
  const material = fixture.controller.material;
  material.outputNode = mode === "normal"
    ? vec4(normalView.mul(0.5).add(0.5), 1)
    : vec4(diffuseColor.rgb, 1);
  const camera = new PerspectiveCamera(45, width / height, 0.1, 500);
  camera.position.set(38, 28, 45);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const legacyCamera = camera.clone();
  const legacyController = new TerrainMaterialController(config, false, compact);
  const compile = legacyController.material.onBeforeCompile;
  legacyController.material.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      `outgoingLight = ${mode === "normal" ? "normal * 0.5 + 0.5" : "diffuseColor.rgb"};\n#include <opaque_fragment>`);
  };
  legacyController.material.dithering = false;
  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  legacyScene.add(new Mesh(fixture.mesh.geometry, legacyController.material));
  const legacy = new WebGLRenderer();
  const target = new RenderTarget(width, height);
  const legacyTarget = new WebGLRenderTarget(width, height);
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = await readRenderTargetRgba8(renderer, target);
    legacy.setRenderTarget(legacyTarget);
    legacy.render(legacyScene, legacyCamera);
    const expected = new Uint8Array(width * height * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, width, height, expected);
    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    let maximum = 0, total = 0, nonzero = 0, differing = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 0) nonzero++;
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(pixels[offset + c] - expected[((flip ? height - y - 1 : y) * width + x) * 4 + c]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    return { mode, width, height, maximum, mean: total / (width * height * 3), differing, nonzero, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([fixture, legacyController, target, legacyTarget, legacy]);
  }
}
