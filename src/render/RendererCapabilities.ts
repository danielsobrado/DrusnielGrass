import type { WebGPURenderer } from "three/webgpu";

export type ActualBackend = "webgpu" | "webgl2";
export interface RendererCapabilities {
  readonly backend: ActualBackend;
  readonly maxTextureSize: number;
  readonly maxSamples: number;
  readonly gpuTiming: boolean;
  readonly nativeCompute: boolean;
  readonly indirectDraw: boolean;
  readonly colorTargetHalfFloat: boolean;
  readonly sampledDepth: boolean;
}

// Three r185 backend probes are isolated here. No material may depend on them.
interface BackendProbe {
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
  device?: { limits: { maxTextureDimension2D: number }; features: { has(name: string): boolean } };
  gl?: WebGL2RenderingContext;
  createIndirectStorageAttribute?: unknown;
}

export function readRendererCapabilities(renderer: Pick<WebGPURenderer, "backend">): RendererCapabilities {
  const backend = renderer.backend as unknown as BackendProbe;
  if (backend.isWebGPUBackend) {
    const device = backend.device;
    if (!device) throw new Error("WebGPU renderer has no initialized device.");
    return Object.freeze({ backend: "webgpu", maxTextureSize: device.limits.maxTextureDimension2D,
      maxSamples: 4, gpuTiming: device.features.has("timestamp-query"), nativeCompute: true,
      indirectDraw: typeof backend.createIndirectStorageAttribute === "function",
      colorTargetHalfFloat: true, sampledDepth: true });
  }
  if (backend.isWebGLBackend) {
    const gl = backend.gl;
    if (!gl) throw new Error("WebGL renderer has no initialized context.");
    return Object.freeze({ backend: "webgl2", maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      maxSamples: Number(gl.getParameter(gl.MAX_SAMPLES)),
      gpuTiming: Boolean(gl.getExtension("EXT_disjoint_timer_query_webgl2")),
      nativeCompute: false, indirectDraw: false,
      // Either extension makes a half-float target renderable, and the legacy
      // trail pass accepts either. Probing only the float one would drop the
      // portable pass to bytes on a device the WebGL pass runs at half float,
      // which is a different decay floor rather than a different precision.
      colorTargetHalfFloat: Boolean(gl.getExtension("EXT_color_buffer_half_float"))
        || Boolean(gl.getExtension("EXT_color_buffer_float")), sampledDepth: true });
  }
  throw new Error("Renderer initialized an unrecognized backend.");
}
