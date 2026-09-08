const IRIS_CLOSE_SECONDS = 0.45;
const IRIS_OPEN_SECONDS = 0.6;
const IRIS_RADIUS_VMAX = 120;

export type WorldIrisSwap = () => void | Promise<void>;

/** Covers atomic visual cuts and coalesces rapid changes per control key. */
export class WorldIrisTransition {
  private readonly element: HTMLDivElement;
  private readonly pending = new Map<string, WorldIrisSwap>();
  private running?: Promise<void>;
  private animationFrame?: number;
  private finishAnimation?: () => void;
  private radius = IRIS_RADIUS_VMAX;
  private disposed = false;

  constructor(root: HTMLElement = document.body) {
    this.element = document.createElement("div");
    this.element.className = "world-iris-overlay";
    this.element.setAttribute("aria-hidden", "true");
    this.setRadius(this.radius);
    root.appendChild(this.element);
  }

  run(swap: WorldIrisSwap, key = "default"): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pending.set(key, swap);
    this.running ??= this.drain().finally(() => { this.running = undefined; });
    return this.running;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelAnimation();
    this.pending.clear();
    this.element.remove();
  }

  private async drain(): Promise<void> {
    while (this.pending.size > 0 && !this.disposed) {
      const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      if (!reducedMotion) await this.animate(0, IRIS_CLOSE_SECONDS);
      try {
        while (this.pending.size > 0 && !this.disposed) await this.commitNext();
      } finally {
        if (!reducedMotion && !this.disposed) await this.animate(IRIS_RADIUS_VMAX, IRIS_OPEN_SECONDS);
      }
    }
  }

  private async commitNext(): Promise<void> {
    const next = this.pending.entries().next().value as [string, WorldIrisSwap] | undefined;
    if (!next) return;
    this.pending.delete(next[0]);
    try {
      await next[1]();
    } catch (error) {
      console.error("[Drusniel World] Iris transition swap failed; reopening.", error);
    }
  }

  private animate(target: number, seconds: number): Promise<void> {
    this.cancelAnimation();
    const from = this.radius;
    if (from === target || this.disposed) return Promise.resolve();
    const startedAt = performance.now();
    const durationMs = seconds * 1000;
    return new Promise((resolve) => {
      this.finishAnimation = resolve;
      const tick = (now: number): void => {
        if (this.disposed) { resolve(); return; }
        const raw = Math.min(1, (now - startedAt) / durationMs);
        this.setRadius(from + (target - from) * power4InOut(raw));
        if (raw < 1) {
          this.animationFrame = requestAnimationFrame(tick);
        } else {
          this.animationFrame = undefined;
          this.finishAnimation = undefined;
          resolve();
        }
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }

  private cancelAnimation(): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.finishAnimation?.();
    this.finishAnimation = undefined;
  }

  private setRadius(radius: number): void {
    this.radius = radius;
    this.element.style.setProperty("--world-iris-radius", `${radius}vmax`);
  }
}

export function power4InOut(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t < 0.5 ? 8 * t ** 4 : 1 - ((-2 * t + 2) ** 4) / 2;
}
