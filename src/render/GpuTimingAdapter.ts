import type { WebGPURenderer } from "three/webgpu";
import type { RendererCapabilities } from "./RendererCapabilities";
import type { GpuFrameTimingStats } from "../runtime/GpuFrameTimer";

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
    return { status: this.status, sampleCount: sorted.length,
      medianMs: sorted[Math.floor((sorted.length - 1) * 0.5)],
      p95Ms: sorted[Math.ceil((sorted.length - 1) * 0.95)] };
  }

  dispose(): void { this.disposed = true; this.samples.length = 0; }
}
