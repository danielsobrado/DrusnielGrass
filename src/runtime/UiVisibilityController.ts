import { HudSettingsController } from "./HudSettingsController";

const STORAGE_KEY = "drusniel-world-hud-minimized";
const HELP_DISMISS_MS = 4500;

export class UiVisibilityController {
  private readonly button =
    document.querySelector<HTMLButtonElement>("#ui-toggle");
  private readonly settingsController = new HudSettingsController();
  private minimized = false;
  private initialized = false;
  private readonly diagnostics: boolean;
  private helpHandle = 0;

  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.diagnostics =
      params.get("diagnostics") === "1" ||
      params.get("gpuTiming") === "1" ||
      params.get("stats") === "1";
  }

  initialize(): void {
    if (!this.button || this.initialized) {
      return;
    }
    this.initialized = true;
    try {
      document.documentElement.dataset.diagnostics = this.diagnostics
        ? "true"
        : "false";
      this.minimized = this.diagnostics ? false : readStoredMinimized();
      this.apply();
      this.button.addEventListener("click", this.toggle);
      this.settingsController.initialize();
      if (!this.diagnostics) {
        this.helpHandle = window.setTimeout(this.dismissHelp, HELP_DISMISS_MS);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    window.clearTimeout(this.helpHandle);
    this.settingsController.dispose();
    if (!this.button || !this.initialized) {
      return;
    }
    this.initialized = false;
    this.button.removeEventListener("click", this.toggle);
  }

  private readonly toggle = (): void => {
    this.minimized = !this.minimized;
    if (this.minimized) {
      this.settingsController.close();
    }
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, this.minimized ? "1" : "0");
    } catch {
      // Storage is optional; the current session still works without it.
    }
  };

  private readonly dismissHelp = (): void => {
    document.documentElement.dataset.helpDismissed = "true";
  };

  private apply(): void {
    document.documentElement.dataset.uiMinimized = this.minimized
      ? "true"
      : "false";
    if (!this.button) {
      return;
    }
    this.button.textContent = this.minimized ? "HUD" : "−";
    this.button.setAttribute("aria-pressed", String(this.minimized));
    this.button.setAttribute(
      "aria-label",
      this.minimized ? "Restore interface" : "Minimize interface",
    );
    this.button.title = this.minimized
      ? "Restore interface"
      : "Minimize interface";
  }
}

function readStoredMinimized(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "0") {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}
