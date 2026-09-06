export interface HudSettings {
  invertHorizontalMovement: boolean;
}

const STORAGE_KEY = "drusniel-world-hud-settings";
const DEFAULT_SETTINGS: Readonly<HudSettings> = Object.freeze({
  invertHorizontalMovement: false,
});

class HudSettingsStore {
  private settings = readStoredSettings();

  getInvertHorizontalMovement(): boolean {
    return this.settings.invertHorizontalMovement;
  }

  setInvertHorizontalMovement(enabled: boolean): void {
    if (this.settings.invertHorizontalMovement === enabled) {
      return;
    }
    this.settings = { ...this.settings, invertHorizontalMovement: enabled };
    persistSettings(this.settings);
  }
}

export const hudSettingsStore = new HudSettingsStore();

function readStoredSettings(): HudSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      invertHorizontalMovement: parsed.invertHorizontalMovement === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: HudSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistent storage is optional; the setting still applies this session.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
