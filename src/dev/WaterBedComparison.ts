import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DirectionalLight, Mesh, PerspectiveCamera,
  RenderTarget, Scene, WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { diffuseColor, vec4 } from "three/tsl";
import { WaterBedMaterialController } from "../world/hydrology/WaterBedMaterialController";
import { createWaterBedLegacyMaterial } from "../world/hydrology/WaterBedLegacyMaterial";
import { WaterBedNodeMaterial } from "../world/hydrology/WaterBedNodeMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import type { WorldConfig } from "../world/WorldConfig";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

const GRID = 96;
const EXTENT = 24;

/**
 * A reach that carries every regime the bed distinguishes.
 *
 * Coverage falls off towards both banks so the stipple margin is reached, depth
 * runs from a shallow riffle to a pool deeper than the reference so both sides
 * of the depth ratio resolve, flow swings through a bend so the bank split is
 * non-zero on both sides, and one corner drops the flow to zero so the still
 * basin path runs as well.
 */
function createWaterGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [], normals: number[] = [];
  const data: number[] = [], context: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= GRID; row++) {
    for (let column = 0; column <= GRID; column++) {
      const u = column / GRID, v = row / GRID;
      const x = (u - 0.5) * EXTENT, z = (v - 0.5) * EXTENT;
      // The channel meanders across the patch; distance from its centre line
      // drives coverage, depth and the lateral offset the bank split reads.
      const centre = Math.sin(v * 3.1) * 4.5;
      const lateral = (x - centre) / 6;
      const coverage = Math.max(0, 1 - Math.abs(lateral) ** 1.6);
      const depth = coverage * (0.4 + v * 2.6);
      const bend = Math.cos(v * 3.1) * 0.9;
      const river = v > 0.12 ? Math.min(1, coverage * 1.2) : 0;
      const flow = Math.hypot(1, Math.cos(v * 3.1) * 1.4);
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      data.push(coverage, depth, river / flow, (river * Math.cos(v * 3.1) * 1.4) / flow);
      context.push(bend, Math.max(-1, Math.min(1, lateral)), Math.sin(v * 5.7), 0);
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
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Compares the node river bed against the shipped GLSL patch.
 *
 * The bed decides its own coverage through two hard discards and a screen-space
 * stipple, so the comparison asks the same two questions the other cutout
 * materials do: do the same pixels survive, and where both survive, is the
 * colour the same. Both are strict on both backends — the stipple reads the
 * fragment coordinate through the flip that makes it agree with `gl_FragCoord`,
 * so the same margin pixels dissolve rather than an equivalent set.
 */
export async function compareWaterBed(renderer: WebGPURenderer, config: WorldConfig,
  compact: boolean) {
  const width = 256, height = 192;
  const geometry = createWaterGeometry();
  const controller = new WaterBedMaterialController(config, compact);
  controller.update(7.5);
  const sun = new DirectionalLight(0xfff0d8, 2.1);
  sun.position.set(6, 9, 4);
  const ambient = new AmbientLight(0x9fb4c8, 0.5);
  const scene = new Scene();
  scene.background = new Color(0);
  scene.add(sun, ambient);
  const context = new WorldNodeMaterialContext(sun, [ambient]);
  const node = new WaterBedNodeMaterial(controller.shaderUniforms, context);
  // Ordered dithering is an output detail both materials apply from the
  // fragment coordinate, and its pattern is not what this compares. Left on, it
  // puts a plus or minus one on a quarter of the reach and buries the colour.
  node.dithering = false;
  // Isolated through the real material: the bed's albedo is the whole port, and
  // the two lighting models are not what this is measuring.
  node.outputNode = vec4(diffuseColor.rgb, 1);
  scene.add(new Mesh(geometry, node));

  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  const legacySun = new DirectionalLight(0xfff0d8, 2.1);
  legacySun.position.set(6, 9, 4);
  legacyScene.add(legacySun, new AmbientLight(0x9fb4c8, 0.5));
  // Built from the controller's own table; production draws the node material.
  const legacyMaterial = createWaterBedLegacyMaterial(controller.shaderUniforms);
  legacyMaterial.dithering = false;
  const compile = legacyMaterial.onBeforeCompile;
  legacyMaterial.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      "outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>");
  };
  legacyScene.add(new Mesh(geometry, legacyMaterial));

  const camera = new PerspectiveCamera(45, width / height, 0.1, 200);
  camera.position.set(0, 9, 17);
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
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(pixels[offset + channel] - expected[reference + channel]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    return { compact, width, height, maximum, mean: total / Math.max(shared * 3, 1), differing,
      nonzero, legacyNonzero, shared, coverageMismatch, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([node, legacyMaterial, controller, geometry, target, legacyTarget, legacy]);
  }
}
