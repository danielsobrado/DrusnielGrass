/**
 * What a renderer can say about the hardware it is running on.
 *
 * The isolation HUD read these straight off a WebGL context, which is fine
 * while there is one renderer and impossible once there are two. The awkward
 * part is that the two backends cannot answer the same questions: WebGL exposes
 * a context-wide depth-buffer size and per-shader-stage float precision, and
 * WebGPU has neither concept — depth format is chosen per render target, and
 * WGSL has no precision qualifiers at all.
 *
 * So this reports honestly rather than uniformly. A field a backend cannot
 * answer comes back undefined and the HUD prints "n/a"; nothing is fabricated
 * to keep the shape rectangular. A plausible-looking depth-bits number invented
 * for WebGPU would be worse than an absent one, because the entire purpose of
 * this panel is to be believed when something is wrong.
 */

/** A classic `WebGLRenderer`, which reaches its context directly. */
interface ContextRenderer {
  getContext(): WebGLRenderingContext | WebGL2RenderingContext;
}

/** Adapter identity, where the browser exposes it. Absent is normal, not an error. */
interface AdapterInfoLike {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

/**
 * The device members this reads, declared structurally.
 *
 * The project does not depend on `@webgpu/types`, and the capability probe
 * already names the handful of device members it needs the same way. Declaring
 * only what is read keeps that consistent and keeps the surface honest.
 */
interface DeviceLike {
  limits: { maxTextureDimension2D: number; maxVertexAttributes: number };
  adapterInfo?: AdapterInfoLike;
}

/** A node renderer, which reaches its context or device through its backend. */
interface BackendRenderer {
  backend: {
    isWebGLBackend?: boolean;
    isWebGPUBackend?: boolean;
    gl?: WebGL2RenderingContext;
    device?: DeviceLike;
  };
}

export type DebuggableRenderer = ContextRenderer | BackendRenderer;

export interface RendererDebugInfo {
  backend: "webgl2" | "webgpu";
  version: string;
  renderer: string;
  vendor: string;
  /** WebGL only: WebGPU chooses a depth format per target, not per context. */
  depthBits?: number;
  maxTextureSize: number;
  maxVertexAttribs: number;
  /** WebGL only: WGSL has no precision qualifiers, so every float is f32. */
  vertexHighp?: string;
  fragmentHighp?: string;
}

function resolveGl(renderer: DebuggableRenderer):
WebGLRenderingContext | WebGL2RenderingContext | undefined {
  const backend = (renderer as BackendRenderer).backend;
  if (backend) return backend.isWebGLBackend ? backend.gl : undefined;
  const context = (renderer as ContextRenderer).getContext?.();
  return context ?? undefined;
}

function describePrecision(format: WebGLShaderPrecisionFormat | null): string {
  return format ? `p${format.precision} [${format.rangeMin},${format.rangeMax}]` : "unavailable";
}

function readWebGlDebugInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): RendererDebugInfo {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as
    | { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number }
    | null;
  return {
    backend: "webgl2",
    version: String(gl.getParameter(gl.VERSION)),
    renderer: String(gl.getParameter(
      debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    vendor: String(gl.getParameter(debugInfo ? debugInfo.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
    depthBits: Number(gl.getParameter(gl.DEPTH_BITS)),
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    maxVertexAttribs: Number(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)),
    vertexHighp: describePrecision(gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT)),
    fragmentHighp: describePrecision(
      gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)),
  };
}

function readWebGpuDebugInfo(device: DeviceLike): RendererDebugInfo {
  const adapter = device.adapterInfo;
  const named = [adapter?.device, adapter?.architecture].filter(Boolean).join(" ");
  return {
    backend: "webgpu",
    version: adapter?.description ? `WebGPU (${adapter.description})` : "WebGPU",
    renderer: named.length > 0 ? named : "unavailable",
    vendor: adapter?.vendor && adapter.vendor.length > 0 ? adapter.vendor : "unavailable",
    maxTextureSize: device.limits.maxTextureDimension2D,
    maxVertexAttribs: device.limits.maxVertexAttributes,
  };
}

export function readRendererDebugInfo(renderer: DebuggableRenderer): RendererDebugInfo {
  const gl = resolveGl(renderer);
  if (gl) return readWebGlDebugInfo(gl);
  const device = (renderer as BackendRenderer).backend?.device;
  if (device) return readWebGpuDebugInfo(device);
  throw new Error("Renderer exposes neither a WebGL context nor a WebGPU device.");
}

/**
 * The last error the driver reported, where the backend has such a thing.
 *
 * WebGL's `getError` is a synchronous per-call flag, which is what makes it
 * usable once a frame from a HUD. WebGPU has no equivalent: its validation
 * arrives asynchronously through error scopes and the uncaptured-error event,
 * and draining a scope every frame would both stall and change what is being
 * measured. This says "unsupported" there rather than reporting a clean state
 * it never checked.
 */
export function readRendererError(renderer: DebuggableRenderer): string {
  const gl = resolveGl(renderer);
  if (!gl) return "unsupported";
  const error = gl.getError();
  return error === gl.NO_ERROR ? "NO_ERROR" : `0x${error.toString(16)}`;
}
