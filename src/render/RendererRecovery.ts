import type { ActualBackend } from "./RendererCapabilities";
import type { RendererRequest } from "./RendererSession";

export interface RendererRecoveryOwner<State> {
  capture(): State;
  release(): void;
  restart(backend: RendererRequest, state: State): Promise<void>;
  onFailure(error: Error): void;
}

/** Coalesces loss events and limits reconstruction to two attempts per session. */
export class RendererRecovery<State> {
  private pending?: Promise<void>;
  private attempts = 0;
  private disposed = false;
  constructor(private readonly owner: RendererRecoveryOwner<State>) {}

  recover(request: RendererRequest, actual: ActualBackend): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.pending) return this.pending;
    // Publish before capture/release: either can synchronously raise another loss.
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
    this.pending = pending;
    void this.reconstruct(request, actual).then(
      () => { this.pending = undefined; resolve(); },
      error => { this.pending = undefined; reject(error); },
    );
    return pending;
  }

  private async reconstruct(request: RendererRequest, actual: ActualBackend): Promise<void> {
    const failures: string[] = [];
    const message = (error: unknown) => error instanceof Error ? error.message : String(error);
    const release = () => {
      try { this.owner.release(); return true; }
      catch (error) { failures.push(`cleanup: ${message(error)}`); return false; }
    };
    const report = (reason = "Renderer recovery failed.") => {
      if (!this.disposed) this.owner.onFailure(new Error(`${reason} ${failures.join("; ")}`.trim()));
    };
    if (this.attempts >= 2) {
      release(); report("Renderer recovery budget exhausted. Reload to retry."); return;
    }
    let state: State;
    try { state = this.owner.capture(); }
    catch (error) { failures.push(`capture: ${message(error)}`); release(); report(); return; }
    if (!release()) { report(); return; }
    const backends: RendererRequest[] = [actual === "webgpu" ? "webgpu" : "webgl"];
    if (request === "auto" && actual === "webgpu") backends.push("webgl");
    for (const backend of backends) {
      if (this.disposed || this.attempts >= 2) break;
      this.attempts++;
      try { await this.owner.restart(backend, state); }
      catch (error) {
        failures.push(`${backend}: ${message(error)}`);
        if (!release()) break;
        continue;
      }
      if (this.disposed) release();
      return;
    }
    report();
  }

  dispose(): void { this.disposed = true; }
}
