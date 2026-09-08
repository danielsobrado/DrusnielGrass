import type { WebGPURenderer } from "three/webgpu";
import type { RendererCapabilities } from "./RendererCapabilities";
import { percentile, type GpuFrameTimingStats } from "../runtime/GpuFrameTimer";

/** Uses the renderer's timestamp pools on either backend; never stalls a frame. */
export class GpuTimingAdapter {
  private pending = false;
  private disposed = false;
  private readonly samples: number[] = [];
  private status: GpuFrameTimingStats["status"];
  constructor(private readonly renderer: Pick<WebGPURenderer, "resolveTimestampsAsync">,
    capabilities: RendererCapabilities, enabled: boolean) {
    this.status = !enabled ? "disabled" : capabilities.gpuTiming ? "active" : "unsupported";
  }

  /**
   * Nothing to open: the backend brackets its own pass and this only resolves
   * the pool afterwards. Accepted so one timing contract covers both routes.
   */
  beginFrame(): void {}

  endFrame(): void {
    if (this.disposed || this.pending || this.status !== "active") return;
    this.pending = true;
    void this.renderer.resolveTimestampsAsync("render").then((milliseconds) => {
      if (this.disposed || milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return;
      this.samples.push(milliseconds);
      if (this.samples.length > 120) this.samples.shift();
    }).catch(() => {
      if (!this.disposed) { this.status = "unsupported"; this.samples.length = 0; }
    }).finally(() => { this.pending = false; });
  }

  getStats(): GpuFrameTimingStats {
    if (!this.samples.length) return { status: this.status, sampleCount: 0 };
    const sorted = [...this.samples].sort((a, b) => a - b);
    // The shipped timer's own rule, not a second one: its p95 index is
    // `ceil(n * 0.95) - 1`, which sits a sample below the index this used to
    // compute for most counts above nineteen — including the 120-sample ring
    // the HUD settles at, where the two disagreed on every reported frame.
    return { status: this.status, sampleCount: sorted.length,
      medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95) };
  }

  dispose(): void { this.disposed = true; this.samples.length = 0; }
}
