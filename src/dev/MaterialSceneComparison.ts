import { RenderTarget, WebGPUCoordinateSystem, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { withRendererState } from "../render/RendererStateScope";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

/** Caller owns scenes/materials; this helper owns only renderer/target resources. */
export async function compareMaterialScenes(renderer: WebGPURenderer, scene: Scene, legacyScene: Scene, camera: PerspectiveCamera, width = 192, height = 128) {
  const legacy = new WebGLRenderer();
  const target = new RenderTarget(width, height), legacyTarget = new WebGLRenderTarget(width, height);
  const legacyCamera = camera.clone();
  camera.aspect = legacyCamera.aspect = width / height;
  camera.updateProjectionMatrix(); legacyCamera.updateProjectionMatrix();
  try {
    withRendererState(renderer, () => {
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissorTest(false);
      renderer.autoClear = true;
      renderer.render(scene, camera);
    });
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
    return { width, height, maximum, mean: total / (width * height * 3), differing, nonzero, flippedRows: flip };
  } finally { disposeResources([target, legacyTarget, legacy]); }
}
