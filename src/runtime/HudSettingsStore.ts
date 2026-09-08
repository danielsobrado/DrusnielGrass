import {
  CHARACTER_IDS, DEFAULT_CHARACTER, DEFAULT_GRASS_SILHOUETTE, DEFAULT_WEATHER_PRESET,
  GRASS_SILHOUETTE_IDS, QUALITY_IDS, WEATHER_PRESET_IDS, resolveCatalogId,
  type CharacterId, type GrassSilhouetteId, type QualityId, type WeatherPresetId,
} from "../world/experience/WorldExperienceCatalog";

export interface HudSettings {
  invertHorizontalMovement: boolean;
  weather: WeatherPresetId;
  shape: GrassSilhouetteId;
  character: CharacterId;
  /** Absent means "let the runtime profile decide", which is not a quality. */
  quality?: QualityId;
  renderScale: number;
  masterVolume: number;
  ambientVolume: number;
  effectsVolume: number;
}

const STORAGE_KEY = "drusniel-world-hud-settings";

/**
 * The stored schema version.
 *
 * Bumped only when an existing field changes meaning. Adding a field does not
 * need it: an old document simply lacks the key and takes the default, which is
 * what every reader below does anyway.
 */
export const HUD_SETTINGS_VERSION = 2;

export const MINIMUM_RENDER_SCALE = 0.5;
export const MAXIMUM_RENDER_SCALE = 1;

const DEFAULT_SETTINGS: Readonly<HudSettings> = Object.freeze({
  invertHorizontalMovement: false,
  weather: DEFAULT_WEATHER_PRESET,
  shape: DEFAULT_GRASS_SILHOUETTE,
  character: DEFAULT_CHARACTER,
  quality: undefined,
  renderScale: 1,
  masterVolume: 0.8,
  ambientVolume: 0.7,
  effectsVolume: 0.9,
});

/**
 * The user's persisted preferences.
 *
 * Every field is validated on the way in. Stored settings are the one input
 * that arrives from a previous version of the software, so a value that no
 * longer exists — a weather preset that was renamed, a quality tier that was
 * removed — has to fall back rather than propagate into a system that will do
 * something undefined with it. Unknown stored fields are ignored rather than
 * rejected, so a document written by a newer build still loads here.
 */
class HudSettingsStore {
  private settings = readStoredSettings();

  getInvertHorizontalMovement(): boolean {
    return this.settings.invertHorizontalMovement;
  }

  setInvertHorizontalMovement(enabled: boolean): void {
    this.update({ invertHorizontalMovement: enabled });
  }

  getWeather(): WeatherPresetId {
    return this.settings.weather;
  }

  setWeather(weather: WeatherPresetId): void {
    this.update({ weather });
  }

  getShape(): GrassSilhouetteId {
    return this.settings.shape;
  }

  setShape(shape: GrassSilhouetteId): void {
    this.update({ shape });
  }

  getCharacter(): CharacterId {
    return this.settings.character;
  }

  setCharacter(character: CharacterId): void {
    this.update({ character });
  }

  /** Undefined means the runtime profile chooses; that is not a quality tier. */
  getQuality(): QualityId | undefined {
    return this.settings.quality;
  }

  setQuality(quality: QualityId | undefined): void {
    this.update({ quality });
  }

  getRenderScale(): number {
    return this.settings.renderScale;
  }

  setRenderScale(scale: number): void {
    this.update({ renderScale: clampRenderScale(scale) });
  }

  getMasterVolume(): number {
    return this.settings.masterVolume;
  }

  getAmbientVolume(): number {
    return this.settings.ambientVolume;
  }

  getEffectsVolume(): number {
    return this.settings.effectsVolume;
  }

  setVolumes(volumes: Partial<
  Pick<HudSettings, "masterVolume" | "ambientVolume" | "effectsVolume">
  >): void {
    this.update({
      masterVolume: volumes.masterVolume === undefined
        ? this.settings.masterVolume : clampUnit(volumes.masterVolume),
      ambientVolume: volumes.ambientVolume === undefined
        ? this.settings.ambientVolume : clampUnit(volumes.ambientVolume),
      effectsVolume: volumes.effectsVolume === undefined
        ? this.settings.effectsVolume : clampUnit(volumes.effectsVolume),
    });
  }

  /** The whole validated set, for a settings panel to render from. */
  snapshot(): Readonly<HudSettings> {
    return Object.freeze({ ...this.settings });
  }

  private update(changes: Partial<HudSettings>): void {
    const next = { ...this.settings, ...changes };
    if (isUnchanged(this.settings, next)) {
      return;
    }
    this.settings = next;
    persistSettings(next);
  }
}

export const hudSettingsStore = new HudSettingsStore();

/** Exported for the settings verifier, which must exercise the real decoder. */
export function decodeHudSettings(raw: unknown): HudSettings {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    invertHorizontalMovement: raw.invertHorizontalMovement === true,
    weather: resolveCatalogId(WEATHER_PRESET_IDS, asString(raw.weather))
      ?? DEFAULT_SETTINGS.weather,
    shape: resolveCatalogId(GRASS_SILHOUETTE_IDS, asString(raw.shape))
      ?? DEFAULT_SETTINGS.shape,
    character: resolveCatalogId(CHARACTER_IDS, asString(raw.character))
      ?? DEFAULT_SETTINGS.character,
    // An absent quality is meaningful — the profile decides — so an invalid one
    // falls back to absent rather than to a tier nobody chose.
    quality: resolveCatalogId(QUALITY_IDS, asString(raw.quality)),
    renderScale: typeof raw.renderScale === "number"
      ? clampRenderScale(raw.renderScale) : DEFAULT_SETTINGS.renderScale,
    masterVolume: readUnit(raw.masterVolume, DEFAULT_SETTINGS.masterVolume),
    ambientVolume: readUnit(raw.ambientVolume, DEFAULT_SETTINGS.ambientVolume),
    effectsVolume: readUnit(raw.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
  };
}

function readStoredSettings(): HudSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    return decodeHudSettings(JSON.parse(raw));
  } catch {
    // Unavailable, blocked or corrupt storage all mean the same thing here:
    // this session runs on defaults rather than not running.
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: HudSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: HUD_SETTINGS_VERSION, ...settings }),
    );
  } catch {
    // Persistent storage is optional, and a quota failure must not interrupt
    // play; the setting still applies for this session.
  }
}

function isUnchanged(current: HudSettings, next: HudSettings): boolean {
  return (Object.keys(next) as (keyof HudSettings)[])
    .every((key) => current[key] === next[key]);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readUnit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampUnit(value) : fallback;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampRenderScale(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.renderScale;
  }
  return Math.min(MAXIMUM_RENDER_SCALE, Math.max(MINIMUM_RENDER_SCALE, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
