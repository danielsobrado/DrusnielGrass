import type { Vector3, WebGPURenderer } from "three/webgpu";
import type { WorldExperience } from "../../app/WorldExperience";
import type { WorldLightingState } from "../../render/WorldLightingState";
import {
  DEFAULT_WEATHER_PRESET,
  DEFAULT_WIND_MODEL,
  WEATHER_PRESET_IDS,
  WIND_MODEL_IDS,
  resolveCatalogId,
  type WeatherPresetId,
} from "../experience/WorldExperienceCatalog";
import {
  resolveWorldEnvironmentPreset,
  type ResolvedWorldEnvironmentPreset,
} from "./WorldEnvironmentPresetResolver";
import { WorldWindSystem } from "./WorldWindSystem";

export interface WorldWeatherSnapshot {
  readonly presetId: WeatherPresetId;
  readonly label: string;
  readonly rainIntensity: number;
  readonly windIntensity: number;
  readonly windDirectionDegrees: number;
  readonly windSimulationSpeed: number;
  readonly restBendGain: number;
}

export type WorldWeatherPresetApplied = (
  preset: ResolvedWorldEnvironmentPreset,
) => void;

/**
 * One authoritative presentation-weather owner.
 *
 * Preset changes never query or mutate ecology, terrain placement or hydrology.
 * They update render lighting/palette state plus the shared wind field, then the
 * environment phase consumes that same snapshot before anything draws.
 */
export class WorldWeatherState {
  private active: ResolvedWorldEnvironmentPreset;
  private disposed = false;

  constructor(
    private readonly lighting: WorldLightingState,
    private readonly wind: WorldWindSystem | undefined,
    initialPreset: WeatherPresetId,
    private readonly onPresetApplied: WorldWeatherPresetApplied,
  ) {
    this.active = resolveWorldEnvironmentPreset(initialPreset);
    this.applyResolved(this.active);
  }

  get windUniforms() {
    return this.wind?.uniforms;
  }

  getPresetId(): WeatherPresetId {
    return this.active.id;
  }

  getSnapshot(): Readonly<WorldWeatherSnapshot> {
    return {
      presetId: this.active.id,
      label: this.active.label,
      rainIntensity: this.active.rainIntensity,
      windIntensity: this.active.windIntensity,
      windDirectionDegrees: this.active.windDirectionDegrees,
      windSimulationSpeed: this.active.windSimulationSpeed,
      restBendGain: this.active.restBendGain,
    };
  }

  /** Returns false for an invalid or unavailable command; current state remains. */
  setPreset(value: string): boolean {
    if (this.disposed) {
      return false;
    }
    const id = resolveCatalogId(WEATHER_PRESET_IDS, value);
    if (!id) {
      return false;
    }
    if (id === this.active.id) {
      return true;
    }

    const previous = this.active;
    const next = resolveWorldEnvironmentPreset(id);
    try {
      this.applyResolved(next);
      this.active = next;
      return true;
    } catch (error) {
      try {
        this.applyResolved(previous);
        this.active = previous;
      } catch (rollbackError) {
        console.warn("[Drusniel World] Weather preset rollback failed.", rollbackError);
      }
      throw error;
    }
  }

  update(deltaSeconds: number): void {
    if (!this.disposed) {
      this.wind?.update(deltaSeconds);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.wind?.dispose();
  }

  private applyResolved(preset: ResolvedWorldEnvironmentPreset): void {
    this.lighting.apply(preset);
    if (this.wind) {
      const field = this.wind.getField();
      field.setDirectionDegrees(preset.windDirectionDegrees);
      field.setIntensity(preset.windIntensity);
      field.setNoiseScale(preset.windNoiseScale);
      field.setSimulationSpeed(preset.windSimulationSpeed);
      this.wind.uniforms.restBendGain.value = preset.restBendGain;
      this.wind.uniforms.syncFrom(field);
    }
    this.onPresetApplied(preset);
  }
}

export interface AttachWorldWeatherOptions {
  readonly renderer: WebGPURenderer;
  readonly params: URLSearchParams;
  readonly lighting: WorldLightingState;
  readonly focus: () => Vector3;
  readonly onPresetApplied: WorldWeatherPresetApplied;
}

/**
 * Fills the single weather slot with weather + wind together.
 * This avoids the T02 bug where wind occupied the slot before the actual preset
 * controller existed and guarantees they advance once in the same frame phase.
 */
export function attachWorldWeather(
  experience: WorldExperience,
  options: AttachWorldWeatherOptions,
): WorldWeatherState | undefined {
  const requestedPreset = options.params.get("weather");
  const initialPreset = resolveCatalogId(WEATHER_PRESET_IDS, requestedPreset)
    ?? DEFAULT_WEATHER_PRESET;
  if (requestedPreset !== null && requestedPreset !== initialPreset) {
    console.warn(
      `[Drusniel World] Unknown weather preset "${requestedPreset}"; using ${initialPreset}.`,
    );
  }
  const windModel = resolveCatalogId(WIND_MODEL_IDS, options.params.get("windModel"))
    ?? DEFAULT_WIND_MODEL;

  let weather: WorldWeatherState | undefined;
  experience.attach("weather", () => {
    const wind = windModel === "cinematic"
      ? new WorldWindSystem(options.renderer, options.focus)
      : undefined;
    weather = new WorldWeatherState(
      options.lighting,
      wind,
      initialPreset,
      options.onPresetApplied,
    );
    return weather;
  });
  return weather;
}
