import { hudSettingsStore } from "../runtime/HudSettingsStore";
import type { WorldRevealController, WorldRevealState } from "../runtime/WorldRevealController";

export interface WorldLoadingPresentationOptions {
  readonly bypassStartGate: boolean;
  readonly setModalOverlay: (open: boolean) => void;
  readonly onStartAccepted?: () => void;
}

/** Decorates the existing reveal owner; it never creates a second startup veil. */
export class WorldLoadingPresentation {
  private readonly element = document.querySelector<HTMLElement>("#world-reveal");
  private readonly startButton = document.createElement("button");
  private readonly status = document.createElement("p");
  private readonly progress = document.createElement("progress");
  private readonly sound = document.createElement("input");
  private detach?: () => void;
  private disposed = false;
  private blockedInput = false;
  private startAccepted = false;

  constructor(
    private readonly reveal: WorldRevealController,
    private readonly options: WorldLoadingPresentationOptions,
  ) {
    try {
      const startGateAvailable = this.element !== null && !options.bypassStartGate;
      if (startGateAvailable) {
        reveal.holdForStart();
        this.blockedInput = true;
        options.setModalOverlay(true);
        document.documentElement.dataset.worldStartGate = "true";
      }
      if (this.element) this.build();
      this.detach = reveal.subscribe(this.handleState);
    } catch (error) {
      this.releaseInput();
      this.startButton.removeEventListener("click", this.handleStart);
      this.sound.removeEventListener("change", this.handleSoundChange);
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseInput();
    this.detach?.();
    this.detach = undefined;
    this.startButton.removeEventListener("click", this.handleStart);
    this.sound.removeEventListener("change", this.handleSoundChange);
  }

  private build(): void {
    if (!this.element) return;
    this.element.classList.add("world-loading-presentation");
    this.element.textContent = "";

    const content = document.createElement("div");
    content.className = "world-loading-card";
    const eyebrow = document.createElement("span");
    eyebrow.className = "world-loading-eyebrow";
    eyebrow.textContent = "DRUSNIEL WORLD";
    const title = document.createElement("h1");
    title.textContent = "The wilds are waking";
    this.progress.className = "world-loading-progress";
    this.progress.removeAttribute("value");
    this.progress.max = 1;
    this.status.className = "world-loading-status";
    this.status.setAttribute("aria-live", "polite");
    content.append(eyebrow, title, this.progress, this.status);

    if (!this.options.bypassStartGate) {
      const soundLabel = document.createElement("label");
      soundLabel.className = "world-loading-sound";
      this.sound.type = "checkbox";
      this.sound.checked = hudSettingsStore.getSoundEnabled();
      this.sound.addEventListener("change", this.handleSoundChange);
      soundLabel.append(this.sound, document.createTextNode(" Enable sound when available"));

      this.startButton.type = "button";
      this.startButton.className = "world-loading-start";
      this.startButton.textContent = "Enter the world";
      this.startButton.disabled = true;
      this.startButton.addEventListener("click", this.handleStart);
      content.append(soundLabel, this.startButton);
    }

    this.element.appendChild(content);
  }

  private readonly handleState = (state: WorldRevealState): void => {
    if (this.disposed) return;
    this.status.textContent = state.message;
    if (!state.ready) return;
    this.progress.value = 1;
    if (this.options.bypassStartGate || !this.element) {
      if (!this.options.bypassStartGate) this.acceptStartGate();
      // Automated captures are silent by policy without rewriting user preferences.
      this.releaseInput();
      this.reveal.reveal();
      return;
    }
    this.startButton.disabled = false;
    this.startButton.focus();
  };

  private readonly handleSoundChange = (): void => {
    hudSettingsStore.setSoundEnabled(this.sound.checked);
  };

  private readonly handleStart = (): void => {
    if (!this.reveal.getState().ready) return;
    hudSettingsStore.setSoundEnabled(this.sound.checked);
    this.acceptStartGate();
    this.startButton.disabled = true;
    this.releaseInput();
    this.reveal.reveal();
  };

  private acceptStartGate(): void {
    if (this.startAccepted) return;
    this.startAccepted = true;
    try {
      this.options.onStartAccepted?.();
    } catch (error) {
      console.warn("[Drusniel World] Start acceptance callback failed.", error);
    }
  }

  private releaseInput(): void {
    if (!this.blockedInput) return;
    this.blockedInput = false;
    delete document.documentElement.dataset.worldStartGate;
    try {
      this.options.setModalOverlay(false);
    } catch (error) {
      console.warn("[Drusniel World] Modal input release failed.", error);
    }
  }
}
