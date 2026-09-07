import { Color, Vector4, type WebGPURenderer } from "three/webgpu";

/** Synchronous offscreen work must return every borrowed raster state, even on failure. */
export function withRendererState<T>(renderer: WebGPURenderer, work: () => T): T {
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const viewport = renderer.getViewport(new Vector4());
  const scissor = renderer.getScissor(new Vector4());
  const scissorTest = renderer.getScissorTest();
  const color = renderer.getClearColor(new Color()), alpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear;
  try { return work(); }
  finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    renderer.setClearColor(color, alpha);
    renderer.autoClear = autoClear;
  }
}
