import { type QuadMesh, type RenderTarget, type WebGPURenderer } from "three/webgpu";
import { withRendererState } from "./RendererStateScope";

/** A raster pass borrows renderer state and always returns it to its caller. */
export function renderNodePass(renderer: WebGPURenderer, target: RenderTarget, quad: QuadMesh): void {
  withRendererState(renderer, () => {
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, target.width, target.height);
    renderer.setScissorTest(false);
    renderer.autoClear = false;
    renderer.clear(true, false, false);
    quad.render(renderer);
  });
}
