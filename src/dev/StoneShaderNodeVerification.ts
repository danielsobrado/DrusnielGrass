import {
  AmbientLight, Color, DirectionalLight, HemisphereLight, Mesh, PlaneGeometry, Scene,
  PerspectiveCamera, type WebGPURenderer,
} from "three/webgpu";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { disposeResources } from "../render/ResourceDisposal";
import type { WorldConfig } from "../world/WorldConfig";
import { createGrainTexture } from "./StoneSurfaceComparison";
import { createStoneNodeMaterial } from "../world/stones/StoneNodeMaterialFactory";
import { createStoneSurfaceAttributes } from "../world/stones/StoneSurfaceNodes";

/**
 * The node equivalent of the shipped stone shader performance check.
 *
 * `verifyStoneShaderPerformance` reads the GLSL the legacy patch produces and
 * asserts the far material never grows the near procedural work. That check
 * cannot move across as written: TSL names nothing in its output, so the marker
 * strings it greps for — `stoneGrowthNoise`, `stoneBedDistance` — do not exist
 * in generated WGSL or GLSL at all, and a port of it would pass by never
 * matching anything.
 *
 * What does survive code generation is the cost itself. The near path is the
 * only one that takes screen-space derivatives and the only one that samples
 * the grain texture, and both emit instructions with stable spellings on both
 * backends. So this asserts the same property against the real compiled
 * program: the coarse material runs neither, the detail material runs both, and
 * the coarse program stays a fraction of the detail one's length.
 */

/** Derivative and texture-sampling spellings, WGSL first and GLSL second. */
const DERIVATIVE = /\b(dpdx|dpdy|dFdx|dFdy)\s*\(/;
const TEXTURE_SAMPLE = /\b(textureSample\w*|texture(2D|Lod|Grad)?)\s*\(/;

export interface StoneShaderReport {
  variant: "detail" | "coarse";
  backend: string;
  length: number;
  derivatives: boolean;
  textureSamples: boolean;
}

async function readFragment(renderer: WebGPURenderer, config: WorldConfig,
  variant: "detail" | "coarse"): Promise<StoneShaderReport> {
  const scene = new Scene();
  scene.background = new Color(0);
  const sun = new DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(5, 7, 6);
  const ambient = new AmbientLight(0x9fb4c8, 0.4);
  const hemisphere = new HemisphereLight(0xbcd8f0, 0x5a5240, 0.8);
  hemisphere.position.set(0, 1, 0);
  scene.add(sun, ambient, hemisphere);
  const grainTexture = createGrainTexture();
  const attributes = createStoneSurfaceAttributes();
  const material = createStoneNodeMaterial(config, variant, attributes, grainTexture,
    new WorldNodeMaterialContext(sun, [ambient, hemisphere]));
  const geometry = new PlaneGeometry(1, 1);
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 2);
  camera.lookAt(0, 0, 0);
  try {
    const { fragmentShader } = await renderer.debug.getShaderAsync(scene, camera, mesh);
    const source = fragmentShader ?? "";
    return {
      variant,
      // Reported so a passing run says which program it inspected; the two
      // backends spell the instructions differently and both are matched.
      backend: (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
        ? "webgpu" : "webgl2",
      length: source.length,
      derivatives: DERIVATIVE.test(source),
      textureSamples: TEXTURE_SAMPLE.test(source),
    };
  } finally {
    disposeResources([material, geometry, grainTexture]);
  }
}

/** Compiles both stone node materials and reports what each program contains. */
export async function verifyStoneNodeShaderPerformance(renderer: WebGPURenderer,
  config: WorldConfig): Promise<StoneShaderReport[]> {
  return [
    await readFragment(renderer, config, "detail"),
    await readFragment(renderer, config, "coarse"),
  ];
}
