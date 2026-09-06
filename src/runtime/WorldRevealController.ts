const REVEAL_TIMEOUT_MS = 2800;
const HERO_NEAR_TILES = 4;

/**
 * Holds a sky-matched veil over the canvas until the ultra-near grass ring is
 * resident, so the first shot is a meadow rather than a streaming hole.
 */
export class WorldRevealController {
  private readonly element: HTMLElement | null;
  private revealed = false;
  private timeoutHandle = 0;

  constructor() {
    this.element = document.querySelector("#world-reveal");
    if (!this.element) {
      this.revealed = true;
      return;
    }
    this.timeoutHandle = window.setTimeout(this.reveal, REVEAL_TIMEOUT_MS);
  }

  noteHeroRing(initialized: boolean, nearTiles: number): void {
    if (this.revealed) {
      return;
    }
    if (initialized && nearTiles >= HERO_NEAR_TILES) {
      this.reveal();
    }
  }

  dispose(): void {
    window.clearTimeout(this.timeoutHandle);
    this.element?.remove();
  }

  private readonly reveal = (): void => {
    if (this.revealed) {
      return;
    }
    this.revealed = true;
    window.clearTimeout(this.timeoutHandle);
    if (!this.element) {
      return;
    }
    this.element.dataset.revealed = "true";
    this.element.setAttribute("aria-hidden", "true");
  };
}
