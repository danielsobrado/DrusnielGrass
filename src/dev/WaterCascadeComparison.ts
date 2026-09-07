import {
  Color, Mesh, PerspectiveCamera, RenderTarget, Scene, WebGPUCoordinateSystem,
  type WebGPURenderer,
} from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { diffuseColor, vec3, vec4 } from "three/tsl";
import { WaterCascadeMaterialController } from "../world/hydrology/WaterCascadeMaterialController";
import { WaterCascadeNodeMaterial } from "../world/hydrology/WaterCascadeNodeMaterial";
import { createWaterCascadeGeometry } from "../world/hydrology/WaterCascadeGeometry";
import { CASCADE_SILL_SAMPLES } from "../world/hydrology/WaterCascadeSill";
import type { CascadeSite } from "../world/hydrology/WaterCascadeSites";
import type { WorldConfig } from "../world/WorldConfig";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

/** Colour and alpha are separate writes into the shipped material's fragment. */
export type WaterCascadeChannel = "albedo" | "alpha";

/**
 * Two falls built through the real geometry builder.
 *
 * Using the shipped builder rather than a hand-rolled quad is the point: the
 * `cascade` and `cascadeCrest` attributes are a contract between the geometry
 * and the shader, and a port that reads them differently is exactly what this
 * has to catch. The two drops are far apart so the fall-progress mapping is
 * exercised at both ends of its range, and the two sill profiles straddle the
 * centreline in opposite directions, so both the heavier-below-zero and the
 * thinning-above-zero branches of the sill weighting run across each lip.
 */
function createCascadeGeometry() {
  const sill = (bias: number) => {
    const values = new Float32Array(CASCADE_SILL_SAMPLES);
    for (let index = 0; index < CASCADE_SILL_SAMPLES; index += 1) {
      values[index] = bias + Math.sin(index * 1.7) * 0.34;
    }
    return values;
  };
  const sites: CascadeSite[] = [
    { x: -6, z: 0, drop: 3.2, halfWidth: 2.4, flowSign: 1, lipHeight: 6,
      discharge: 4, sill: sill(-0.38) },
    { x: 6, z: 0, drop: 14, halfWidth: 3.6, flowSign: -1, lipHeight: 12,
      discharge: 9, sill: sill(0.22) },
  ];
  return createWaterCascadeGeometry(sites);
}

/**
 * Compares the node cascade against the shipped GLSL patch.
 *
 * The curtain writes an albedo and an alpha, and the alpha is what carries the
 * whole silhouette — the strand gaps, the edge falloff, the sill dissolve — so
 * it is compared in its own run rather than folded into a blended image where a
 * wrong gap and a wrong colour can cancel.
 */
export async function compareWaterCascade(renderer: WebGPURenderer, config: WorldConfig,
  channel: WaterCascadeChannel, compact: boolean) {
  const width = 256, height = 192;
  const geometry = createCascadeGeometry();
  if (!geometry) throw new Error("Cascade comparison built no geometry");
  const controller = new WaterCascadeMaterialController(config, compact);
  controller.update(7.5);
  const scene = new Scene();
  scene.background = new Color(0);
  const node = new WaterCascadeNodeMaterial(controller.shaderUniforms);
  // The curtain is unlit, so the only thing between its own two writes and the
  // frame buffer is blending — which is what the isolation removes.
  node.transparent = channel === "alpha";
  node.depthWrite = true;
  node.outputNode = channel === "alpha"
    ? vec4(vec3(diffuseColor.a), 1) : vec4(diffuseColor.rgb, 1);
  scene.add(new Mesh(geometry, node));

  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  const legacyMaterial = controller.material;
  legacyMaterial.transparent = false;
  legacyMaterial.depthWrite = true;
  const compile = legacyMaterial.onBeforeCompile;
  legacyMaterial.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      `${channel === "alpha" ? "outgoingLight = vec3(diffuseColor.a);"
        : "outgoingLight = diffuseColor.rgb;"}\ndiffuseColor.a = 1.0;\n`
      + "#include <opaque_fragment>");
  };
  legacyMaterial.needsUpdate = true;
  legacyScene.add(new Mesh(geometry, legacyMaterial));

  const camera = new PerspectiveCamera(45, width / height, 0.1, 200);
  camera.position.set(0, 6, 15);
  camera.lookAt(0, 3, 0);
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
    let maximum = 0, total = 0, nonzero = 0, legacyNonzero = 0, differing = 0;
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
      for (let component = 0; component < 3; component++) {
        const delta = Math.abs(pixels[offset + component] - expected[reference + component]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    return { channel, compact, width, height, maximum, mean: total / Math.max(shared * 3, 1),
      differing, nonzero, legacyNonzero, shared, coverageMismatch, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([node, controller, geometry, target, legacyTarget, legacy]);
  }
}
