import * as THREE from "three";
import { grassInteractionField } from "../grass/interaction/GrassInteractionField";
import type { WorldExperiencePanelHost, WorldExperiencePanelSnapshot } from "../ui/WorldExperiencePanel";
import type { WorldViewState } from "../runtime/WorldViewState";
import type { WorldWeatherState } from "../world/weather/WorldWeatherState";
import type { WeatherPresetId } from "../world/experience/WorldExperienceCatalog";

export interface WorldExperiencePanelHostOptions {
  readonly weather: WorldWeatherState | undefined;
  readonly viewState: WorldViewState;
  readonly getRenderScale: () => number;
  readonly setRenderScale: (value: number) => void;
}

/** Narrow adapter between DOM controls and world owners. */
export class WorldExperiencePanelHostAdapter implements WorldExperiencePanelHost {
  private readonly pose = new THREE.Vector3();

  constructor(private readonly options: WorldExperiencePanelHostOptions) {}

  snapshot(): WorldExperiencePanelSnapshot {
    const weatherOwner = this.options.weather;
    const weather = weatherOwner?.getSnapshot();
    return {
      weather: weather?.presetId ?? "drusniel",
      weatherAvailable: weatherOwner?.isAvailable() ?? false,
      windControlsAvailable: weatherOwner?.hasWindControls() ?? false,
      windGain: weather?.windIntensity ?? 1,
      simulationSpeed: weather?.windSimulationSpeed ?? 1,
      renderScale: this.options.getRenderScale(),
      interactionEnabled: grassInteractionField.isInteractionEnabled(),
    };
  }

  setWeatherPreset(id: WeatherPresetId): boolean {
    return this.options.weather?.setPreset(id) ?? false;
  }

  setWindGain(value: number): void {
    this.options.weather?.setWindIntensity(value);
  }

  setSimulationSpeed(value: number): void {
    this.options.weather?.setSimulationSpeed(value);
  }

  setRenderScale(value: number): void {
    this.options.setRenderScale(value);
  }

  setInteractionEnabled(enabled: boolean): void {
    grassInteractionField.setInteractionEnabled(enabled);
    if (enabled) {
      const gameplay = this.options.viewState.getGameplayPose(this.pose);
      grassInteractionField.reset(gameplay.position);
    }
  }

  setModalOverlay(open: boolean): void {
    this.options.viewState.setModalOverlay(open);
  }
}
