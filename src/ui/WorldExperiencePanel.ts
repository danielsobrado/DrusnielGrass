import "./world-experience.css";
import { hudSettingsStore, MAXIMUM_RENDER_SCALE, MINIMUM_RENDER_SCALE } from "../runtime/HudSettingsStore";
import { WEATHER_PRESET_IDS, type WeatherPresetId } from "../world/experience/WorldExperienceCatalog";
import { WORLD_SOURCE_ENVIRONMENT_PRESETS } from "../world/weather/WorldEnvironmentPresets";
import { WorldIrisTransition } from "./WorldIrisTransition";

export interface WorldExperiencePanelSnapshot {
  readonly weather: WeatherPresetId;
  readonly weatherAvailable: boolean;
  readonly windControlsAvailable: boolean;
  readonly windGain: number;
  readonly simulationSpeed: number;
  readonly renderScale: number;
  readonly interactionEnabled: boolean;
}

export interface WorldExperiencePanelHost {
  snapshot(): WorldExperiencePanelSnapshot;
  setWeatherPreset(id: WeatherPresetId): boolean;
  setWindGain(value: number): boolean;
  setSimulationSpeed(value: number): boolean;
  setRenderScale(value: number): void;
  setInteractionEnabled(enabled: boolean): void;
  setModalOverlay(open: boolean): void;
}

const WEATHER_LABELS: Readonly<Record<WeatherPresetId, string>> = Object.freeze({
  drusniel: "Drusniel",
  sunny: WORLD_SOURCE_ENVIRONMENT_PRESETS.sunny.label,
  goldenHour: WORLD_SOURCE_ENVIRONMENT_PRESETS.goldenHour.label,
  rainy: WORLD_SOURCE_ENVIRONMENT_PRESETS.rainy.label,
  windy: WORLD_SOURCE_ENVIRONMENT_PRESETS.windy.label,
  calm: WORLD_SOURCE_ENVIRONMENT_PRESETS.calm.label,
  bowed: WORLD_SOURCE_ENVIRONMENT_PRESETS.bowed.label,
  moonlight: WORLD_SOURCE_ENVIRONMENT_PRESETS.moonlight.label,
});

const WIND_MIN = 0;
const WIND_MAX = 2;
const WIND_STEP = 0.05;
const SPEED_MIN = 0;
const SPEED_MAX = 2;
const SPEED_STEP = 0.05;
const WORLD_BOUND_SETTINGS = Object.freeze([
  "weather", "wind", "speed", "renderScale", "interaction",
]);

/** Ordinary-user settings panel. Future-ticket controls are explicit, never silent no-ops. */
export class WorldExperiencePanel {
  private readonly iris = new WorldIrisTransition();
  private readonly root = document.createElement("div");
  private readonly toggle = document.createElement("button");
  private readonly panel = document.createElement("section");
  private host?: WorldExperiencePanelHost;
  private previousFocus?: HTMLElement;
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.root.className = "world-experience-root";
    this.toggle.type = "button";
    this.toggle.className = "world-experience-toggle";
    this.toggle.textContent = "Settings";
    this.toggle.setAttribute("aria-expanded", "false");
    this.toggle.setAttribute("aria-controls", "world-experience-panel");

    this.panel.id = "world-experience-panel";
    this.panel.className = "world-experience-panel";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Drusniel World settings");
    this.panel.innerHTML = this.template();
    this.root.append(this.toggle, this.panel);
    document.body.appendChild(this.root);

    this.toggle.addEventListener("click", this.handleToggle);
    this.panel.addEventListener("click", this.handleClick);
    this.panel.addEventListener("change", this.handleChange);
    this.panel.addEventListener("input", this.handleInput);
    document.addEventListener("keydown", this.handleKeyDown);
    this.sync();
  }

  attachWorld(host: WorldExperiencePanelHost): void {
    this.host = host;
    this.sync();
  }

  detachWorld(): void {
    this.close();
    this.host = undefined;
    this.sync();
  }

  close(): void { this.setOpen(false); }

  dispose(): void {
    if (!this.initialized) return;
    this.close();
    this.initialized = false;
    this.toggle.removeEventListener("click", this.handleToggle);
    this.panel.removeEventListener("click", this.handleClick);
    this.panel.removeEventListener("change", this.handleChange);
    this.panel.removeEventListener("input", this.handleInput);
    document.removeEventListener("keydown", this.handleKeyDown);
    this.root.remove();
    this.iris.dispose();
    this.host = undefined;
  }

  private template(): string {
    const weatherOptions = WEATHER_PRESET_IDS.map((id) =>
      `<option value="${id}">${WEATHER_LABELS[id]}</option>`).join("");
    return `
      <header class="world-experience-header">
        <div><span>DRUSNIEL WORLD</span><h2>Scene settings</h2></div>
        <button type="button" class="world-experience-close" data-action="close" aria-label="Close settings">×</button>
      </header>
      <div class="world-experience-scroll">
        <fieldset><legend>Weather</legend>
          <label>Atmosphere<select data-setting="weather">${weatherOptions}</select></label>
          <p class="world-experience-runtime" data-runtime-status="weather" hidden>Weather controls are unavailable; the base environment remains active.</p>
        </fieldset>
        <fieldset><legend>Grass</legend>
          <label>Wind strength<div class="world-experience-range"><input data-setting="wind" type="range" min="${WIND_MIN}" max="${WIND_MAX}" step="${WIND_STEP}"><output data-output="wind"></output></div></label>
          <label>Simulation speed<div class="world-experience-range"><input data-setting="speed" type="range" min="${SPEED_MIN}" max="${SPEED_MAX}" step="${SPEED_STEP}"><output data-output="speed"></output></div></label>
          <p class="world-experience-runtime" data-runtime-status="wind" hidden>Live wind controls require the cinematic wind model.</p>
          <label class="world-experience-check"><span>Foot interaction</span><input data-setting="interaction" type="checkbox"></label>
          ${unavailable("Grass shape", "Available after T09 grass-shape migration")}
          ${unavailable("Grass height", "Available after T09 LOD bounds")}
        </fieldset>
        <fieldset><legend>Rendering</legend>
          <label>Render scale<div class="world-experience-range"><input data-setting="renderScale" type="range" min="${MINIMUM_RENDER_SCALE}" max="${MAXIMUM_RENDER_SCALE}" step="0.05"><output data-output="renderScale"></output></div></label>
          ${unavailable("Quality", "Runtime profile remains automatic until quality restart ownership is available")}
        </fieldset>
        <fieldset><legend>Controls</legend>
          <label class="world-experience-check"><span>Invert left/right movement</span><input data-setting="invert" type="checkbox"></label>
        </fieldset>
        <fieldset><legend>Sound</legend>
          <label class="world-experience-check"><span>Enable sound when available</span><input data-setting="sound" type="checkbox"></label>
          <label>Master<div class="world-experience-range"><input data-setting="masterVolume" type="range" min="0" max="1" step="0.05"><output data-output="masterVolume"></output></div></label>
          <label>Ambient<div class="world-experience-range"><input data-setting="ambientVolume" type="range" min="0" max="1" step="0.05"><output data-output="ambientVolume"></output></div></label>
          <label>Effects<div class="world-experience-range"><input data-setting="effectsVolume" type="range" min="0" max="1" step="0.05"><output data-output="effectsVolume"></output></div></label>
          <p class="world-experience-note">Playback starts from Enter the world or the sound toggle. Capture and QA stay silent without changing this preference.</p>
        </fieldset>
        <fieldset><legend>Experience</legend>
          ${unavailable("Scenic tour", "Available in T12")}
          ${unavailable("Grass painter", "Available in T10–T11")}
          ${unavailable("Character", "Available in T13")}
        </fieldset>
        <fieldset><legend>Help</legend>
          <p class="world-experience-help">Click the world to look · WASD move · Shift run · Space jump · F reset · M map · Escape closes this panel.</p>
        </fieldset>
      </div>`;
  }

  private readonly handleToggle = (): void => this.setOpen(this.panel.hidden);
  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest<HTMLElement>("[data-action=\"close\"]")) this.close();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || this.panel.hidden) return;
    event.preventDefault();
    this.close();
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const setting = target.dataset.setting;
    if (setting === "weather" && target instanceof HTMLSelectElement) {
      const id = target.value as WeatherPresetId;
      void this.iris.run(() => {
        try {
          if (!this.host?.setWeatherPreset(id)) {
            throw new Error(`Weather preset ${id} was rejected.`);
          }
          hudSettingsStore.setWeather(id);
        } finally {
          this.sync();
        }
      }, "weather");
    } else if (setting === "interaction" && target instanceof HTMLInputElement) {
      hudSettingsStore.setInteractionEnabled(target.checked);
      this.host?.setInteractionEnabled(target.checked);
    } else if (setting === "invert" && target instanceof HTMLInputElement) {
      hudSettingsStore.setInvertHorizontalMovement(target.checked);
    } else if (setting === "sound" && target instanceof HTMLInputElement) {
      hudSettingsStore.setSoundEnabled(target.checked);
    }
  };

  private readonly handleInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "range") return;
    const value = Number(target.value);
    if (!Number.isFinite(value)) return;
    const setting = target.dataset.setting;
    if (setting === "wind" && !this.host?.setWindGain(value)) {
      this.sync();
      return;
    }
    if (setting === "speed" && !this.host?.setSimulationSpeed(value)) {
      this.sync();
      return;
    }
    if (setting === "renderScale") {
      hudSettingsStore.setRenderScale(value);
      this.host?.setRenderScale(value);
    }
    if (
      setting === "masterVolume" ||
      setting === "ambientVolume" ||
      setting === "effectsVolume"
    ) {
      hudSettingsStore.setVolumes({ [setting]: value });
    }
    this.setOutput(setting, value);
  };

  private setOpen(open: boolean): void {
    if (this.panel.hidden === !open) return;
    if (open) {
      this.sync();
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      if (document.pointerLockElement) void document.exitPointerLock();
      this.host?.setModalOverlay(true);
      this.panel.hidden = false;
      this.toggle.setAttribute("aria-expanded", "true");
      this.panel.querySelector<HTMLElement>("select, input, button")?.focus();
      return;
    }
    this.host?.setModalOverlay(false);
    this.panel.hidden = true;
    this.toggle.setAttribute("aria-expanded", "false");
    this.previousFocus?.focus();
    this.previousFocus = undefined;
  }

  private sync(): void {
    const stored = hudSettingsStore.snapshot();
    const live = this.host?.snapshot();
    this.setValue("weather", live?.weather ?? stored.weather);
    this.setValue("wind", live?.windGain ?? 1);
    this.setValue("speed", live?.simulationSpeed ?? 1);
    this.setValue("renderScale", live?.renderScale ?? stored.renderScale);
    this.setChecked("interaction", live?.interactionEnabled ?? stored.interactionEnabled);
    this.setChecked("invert", stored.invertHorizontalMovement);
    this.setChecked("sound", stored.soundEnabled);
    this.setValue("masterVolume", stored.masterVolume);
    this.setValue("ambientVolume", stored.ambientVolume);
    this.setValue("effectsVolume", stored.effectsVolume);
    this.setOutput("wind", live?.windGain ?? 1);
    this.setOutput("speed", live?.simulationSpeed ?? 1);
    this.setOutput("renderScale", live?.renderScale ?? stored.renderScale);
    this.setOutput("masterVolume", stored.masterVolume);
    this.setOutput("ambientVolume", stored.ambientVolume);
    this.setOutput("effectsVolume", stored.effectsVolume);

    for (const setting of WORLD_BOUND_SETTINGS) {
      this.setDisabled(setting, !this.host);
    }
    if (this.host && live) {
      this.setDisabled("weather", !live.weatherAvailable);
      this.setDisabled("wind", !live.windControlsAvailable);
      this.setDisabled("speed", !live.windControlsAvailable);
    }
    this.setRuntimeStatus("weather", Boolean(this.host && live && !live.weatherAvailable));
    this.setRuntimeStatus(
      "wind",
      Boolean(this.host && live && live.weatherAvailable && !live.windControlsAvailable),
    );
  }

  private setValue(setting: string, value: string | number): void {
    const input = this.panel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting="${setting}"]`);
    if (input) input.value = String(value);
  }

  private setChecked(setting: string, value: boolean): void {
    const input = this.panel.querySelector<HTMLInputElement>(`[data-setting="${setting}"]`);
    if (input) input.checked = value;
  }

  private setDisabled(setting: string, disabled: boolean): void {
    const input = this.panel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting="${setting}"]`);
    if (input) input.disabled = disabled;
  }

  private setRuntimeStatus(name: string, visible: boolean): void {
    const status = this.panel.querySelector<HTMLElement>(`[data-runtime-status="${name}"]`);
    if (status) status.hidden = !visible;
  }

  private setOutput(setting: string | undefined, value: number): void {
    if (!setting) return;
    const output = this.panel.querySelector<HTMLOutputElement>(`[data-output="${setting}"]`);
    if (output) output.value = value.toFixed(2).replace(/\.00$/, "");
  }
}

function unavailable(label: string, reason: string): string {
  return `<div class="world-experience-unavailable"><span>${label}</span><small>${reason}</small></div>`;
}
