import type { WebGPURenderer } from "three/webgpu";
import type * as THREE from "three";
import { GpuFrameTimer, type GpuFrameTimingStats } from "../runtime/GpuFrameTimer";
import { GpuTimingAdapter } from "./GpuTimingAdapter";
import { readRendererCapabilities } from "./RendererCapabilities";

/**
 * One frame-timing contract over two unrelated mechanisms.
 *
 * The WebGL timer brackets a frame with a disjoint-timer query, so it needs
 * both ends. The node renderer resolves a timestamp pool the backend already
 * opened and closed around its own pass, so it has nothing to do at the start
 * of a frame. Rather than give the diagnostics two shapes to branch on, the
 * adapter accepts the call and ignores it.
 */
export interface FrameTimingSource {
  beginFrame(): void;
  endFrame(): void;
  getStats(): GpuFrameTimingStats;
  dispose(): void;
}

/**
 * The renderer members this reads, declared structurally.
 *
 * Naming the two concrete renderer classes here would push a cast onto every
 * caller, and the callers are exactly the diagnostics being made
 * backend-agnostic. The narrowing casts below are the price, and they are
 * confined to this function.
 */
export interface TimeableRenderer {
  backend?: { trackTimestamp?: boolean };
}

/**
 * Picks the timing mechanism the renderer actually has.
 *
 * The node route needs one condition the WebGL route does not. `trackTimestamp`
 * is a backend *construction* parameter, so a renderer built without it answers
 * `resolveTimestampsAsync` with nothing, forever, while still reporting the
 * `timestamp-query` feature. Reading capability alone would leave the HUD
 * showing "active" against zero samples for the life of the session — a panel
 * whose whole value is being believed when something is wrong. The two
 * conditions are ANDed here so an untracked renderer reports "unsupported",
 * which is the truth.
 */
export function createFrameTimingSource(
  renderer: TimeableRenderer,
  enabled: boolean,
): FrameTimingSource {
  const backend = renderer.backend;
  if (!backend) return new GpuFrameTimer(renderer as THREE.WebGLRenderer, enabled);
  const capabilities = readRendererCapabilities(renderer as WebGPURenderer);
  return new GpuTimingAdapter(renderer as WebGPURenderer,
    { ...capabilities, gpuTiming: capabilities.gpuTiming && backend.trackTimestamp === true },
    enabled);
}
