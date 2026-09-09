const REVEAL_TIMEOUT_MS = 2800;
const HERO_NEAR_TILES = 4;

export interface WorldRevealState {
  readonly ready: boolean;
  readonly degraded: boolean;
  readonly message: string;
}

export type WorldRevealListener = (state: WorldRevealState) => void;

/** Owns readiness and the single startup veil; presentation only decorates this owner. */
export class WorldRevealController {
  private readonly element: HTMLElement | null;
  private readonly listeners = new Set<WorldRevealListener>();
  private state: WorldRevealState = { ready: false, degraded: false, message: "Growing the near meadow…" };
  private revealed = false;
  private heldForStart = false;
  private timeoutHandle = 0;

  constructor() {
    this.element = document.querySelector("#world-reveal");
    if (!this.element) {
      this.revealed = true;
      this.state = { ready: true, degraded: true, message: "World ready" };
      return;
    }
    delete this.element.dataset.revealed;
    this.element.removeAttribute("aria-hidden");
    this.timeoutHandle = window.setTimeout(() => this.markReady(true), REVEAL_TIMEOUT_MS);
  }

  /** Called before the frame loop starts when the ordinary Start gate is active. */
  holdForStart(): void {
    if (!this.revealed) this.heldForStart = true;
  }

  subscribe(listener: WorldRevealListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): Readonly<WorldRevealState> {
    return this.state;
  }

  noteHeroRing(initialized: boolean, nearTiles: number): void {
    if (this.state.ready) return;
    if (!initialized) {
      this.publish({ ready: false, degraded: false, message: "Growing the near meadow…" });
      return;
    }
    if (nearTiles < HERO_NEAR_TILES) {
      this.publish({ ready: false, degraded: false, message: "Settling nearby grass…" });
      return;
    }
    this.markReady(false);
  }

  /** Releases the one startup veil. Closing a settings panel never calls this. */
  reveal(): void {
    if (this.revealed) return;
    this.revealed = true;
    this.heldForStart = false;
    window.clearTimeout(this.timeoutHandle);
    if (!this.element) return;
    this.element.dataset.revealed = "true";
    this.element.setAttribute("aria-hidden", "true");
  }

  dispose(): void {
    window.clearTimeout(this.timeoutHandle);
    this.listeners.clear();
  }

  private markReady(degraded: boolean): void {
    if (this.state.ready) return;
    window.clearTimeout(this.timeoutHandle);
    this.publish({
      ready: true,
      degraded,
      message: degraded ? "Ready — background detail is still settling" : "The meadow is ready",
    });
    if (!this.heldForStart) this.reveal();
  }

  private publish(next: WorldRevealState): void {
    if (this.state.ready === next.ready && this.state.degraded === next.degraded
      && this.state.message === next.message) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}
