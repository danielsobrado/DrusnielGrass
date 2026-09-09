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

  let result: T | undefined;
  let workError: unknown;
  let workFailed = false;
  try {
    result = work();
  } catch (error) {
    workFailed = true;
    workError = error;
  }

  let restoreError: unknown;
  let restoreFailed = false;
  const restore = (operation: () => void): void => {
    try {
      operation();
    } catch (error) {
      if (!restoreFailed) {
        restoreFailed = true;
        restoreError = error;
      }
    }
  };

  restore(() => renderer.setRenderTarget(target, face, mip));
  restore(() => renderer.setViewport(viewport));
  restore(() => renderer.setScissor(scissor));
  restore(() => renderer.setScissorTest(scissorTest));
  restore(() => renderer.setClearColor(color, alpha));
  restore(() => { renderer.autoClear = autoClear; });

  if (workFailed) {
    if (restoreFailed) {
      console.warn("[Drusniel World] Renderer state restoration also failed.", restoreError);
    }
    throw workError;
  }
  if (restoreFailed) {
    throw restoreError;
  }
  return result as T;
}
