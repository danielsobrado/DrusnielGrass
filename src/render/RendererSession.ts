import { WebGPURenderer } from "three/webgpu";
import { readRendererCapabilities, type RendererCapabilities, type ActualBackend } from "./RendererCapabilities";

export type RendererRequest = "auto" | "webgpu" | "webgl";
type RendererOptions = NonNullable<ConstructorParameters<typeof WebGPURenderer>[0]>;
type DeviceLoss = Parameters<WebGPURenderer["onDeviceLost"]>[0];
export interface RendererSession {
  readonly renderer: WebGPURenderer;
  readonly capabilities: RendererCapabilities;
  readonly diagnostics: Readonly<{ requested: RendererRequest; actual: ActualBackend; fallbackReason: string | null }>;
  subscribeDeviceLoss(listener: (info: DeviceLoss) => void): () => void;
  dispose(): void;
}

export function resolveRendererRequest(search: string, warn: (message: string) => void = console.warn): RendererRequest {
  const value = new URLSearchParams(search).get("renderer");
  if (value === "auto" || value === "webgpu" || value === "webgl") return value;
  if (value !== null) warn(`Unknown renderer "${value}"; using automatic backend selection.`);
  return "auto";
}

/** Initializes before exposing any resource factories. Each retry needs a fresh canvas. */
export async function createRendererSession({ request = "auto", options = {}, signal,
  createRenderer = (parameters) => new WebGPURenderer(parameters),
  readCapabilities = readRendererCapabilities,
}: {
  request?: RendererRequest;
  options?: RendererOptions;
  signal?: AbortSignal;
  createRenderer?: (parameters: RendererOptions) => WebGPURenderer;
  readCapabilities?: (renderer: WebGPURenderer) => RendererCapabilities;
} = {}): Promise<RendererSession> {
  signal?.throwIfAborted();
  const renderer = createRenderer({ ...options, forceWebGL: request === "webgl" });
  const previousLossHandler = renderer.onDeviceLost;
  const listeners = new Set<(info: DeviceLoss) => void>();
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    renderer.onDeviceLost = previousLossHandler;
    try { void renderer.setAnimationLoop(null); } catch { /* Partially initialized renderer. */ }
    try { renderer.dispose(); } finally {
      // Caller-supplied canvases belong to bootstrap, not this resource owner.
      if (!options.canvas) renderer.domElement.remove();
    }
  };
  try {
    await renderer.init();
    signal?.throwIfAborted();
    const capabilities = readCapabilities(renderer);
    if (request === "webgpu" && capabilities.backend !== "webgpu") {
      throw new Error("WebGPU was explicitly requested but only WebGL 2 initialized.");
    }
    if (request === "webgl" && capabilities.backend !== "webgl2") {
      throw new Error("Forced WebGL 2 initialized an unexpected backend.");
    }
    renderer.onDeviceLost = (info): void => {
      if (disposed) return;
      try { previousLossHandler.call(renderer, info); } finally {
        for (const listener of listeners) {
          try { listener(info); } catch (error) { console.error("Renderer loss listener failed.", error); }
        }
      }
    };
    return { renderer, capabilities,
      diagnostics: Object.freeze({ requested: request, actual: capabilities.backend,
        fallbackReason: request === "auto" && capabilities.backend === "webgl2"
          ? "WebGPU initialization was unavailable; Three.js selected WebGL 2." : null }),
      dispose,
      subscribeDeviceLoss(listener) {
        if (disposed) return () => {};
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    };
  } catch (error) {
    try { dispose(); } catch (cleanupError) { console.warn("Renderer rollback failed.", cleanupError); }
    throw error;
  }
}
