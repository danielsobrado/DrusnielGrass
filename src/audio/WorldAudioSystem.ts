import * as THREE from "three";
import type { WorldExperience } from "../app/WorldExperience";
import type { SnowflowCharacter } from "../character/SnowflowCharacter";
import { WorldFootContactTracker } from "../controls/WorldFootContactTracker";
import { disposeResources } from "../render/ResourceDisposal";
import { hudSettingsStore, type HudSettings } from "../runtime/HudSettingsStore";
import type { TerrainField } from "../world/TerrainField";
import type { WorldRainSystem } from "../world/weather/WorldRainSystem";
import type {
  WorldWeatherSnapshot,
  WorldWeatherState,
} from "../world/weather/WorldWeatherState";
import {
  ambientGainsFromWeather,
  capAmbientGains,
  type WorldHabitatWeights,
} from "./WorldAmbientMixer";
import type { WorldAudioDecode } from "./WorldAudioBank";
import { worldAudioPresetEssentials } from "./WorldAudioCatalog";
import {
  EMPTY_AUDIO_HABITAT,
  lerpHabitat,
  sampleWorldAudioHabitat,
} from "./WorldAudioHabitat";
import {
  createWorldAudioResources,
  disposeWorldAudioResources,
  type WorldAudioResources,
} from "./WorldAudioResources";
import {
  WORLD_AUDIO_FOOT_RADIUS_METERS,
  WORLD_AUDIO_FOOT_STRENGTH,
  WORLD_AUDIO_HABITAT_HZ,
  WORLD_AUDIO_LANDING_RADIUS_METERS,
  WORLD_AUDIO_LANDING_STRENGTH,
  WORLD_AUDIO_MAX_GAIN_SUM,
} from "./WorldAudioTuning";

export interface WorldAudioSystemOptions {
  readonly camera: THREE.Camera;
  readonly scene: THREE.Scene;
  readonly terrain: TerrainField;
  readonly weather?: WorldWeatherState;
  readonly rain?: WorldRainSystem;
  readonly compact: boolean;
  readonly seed: number;
  readonly flyMode: boolean;
  readonly focus: () => THREE.Vector3;
  readonly getCharacter: () => SnowflowCharacter | undefined;
  readonly decode?: WorldAudioDecode;
}

const SILENT_WEATHER: WorldWeatherSnapshot = Object.freeze({
  presetId: "drusniel",
  label: "",
  rainIntensity: 0,
  windIntensity: 0,
  windDirectionDegrees: 0,
  windSimulationSpeed: 1,
  restBendGain: 1,
});

const GESTURE_SELECTOR =
  ".world-loading-start, .world-loading-sound, [data-setting=sound]";

/** One listener, one buffer cache, and the mixers that share them. */
export class WorldAudioSystem {
  private readonly resources: WorldAudioResources;
  private readonly tracker = new WorldFootContactTracker();
  private habitat: WorldHabitatWeights = { ...EMPTY_AUDIO_HABITAT };
  private habitatTarget: WorldHabitatWeights = { ...EMPTY_AUDIO_HABITAT };
  private habitatAge = 1;
  private presetId?: WorldWeatherSnapshot["presetId"];
  private allowed = false;
  private resumeInFlight = false;
  private resumeBlocked = false;
  private resumeFailureReported = false;
  private disposed = false;

  constructor(
    private readonly options: WorldAudioSystemOptions,
    voiceCapacity: number,
  ) {
    this.resources = createWorldAudioResources(options, voiceCapacity);
    for (const clip of worldAudioPresetEssentials()) {
      void this.resources.bank.load(clip.id);
    }
    document.addEventListener("click", this.handleGesture);
    document.addEventListener("change", this.handleGesture);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.applyOutputGains(hudSettingsStore.snapshot());
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? deltaSeconds
      : 0;
    this.syncContext();

    const focus = this.options.focus();
    this.habitatAge += delta;
    if (this.habitatAge >= 1 / WORLD_AUDIO_HABITAT_HZ) {
      this.habitatAge = 0;
      this.habitatTarget = sampleWorldAudioHabitat(
        this.options.terrain,
        focus.x,
        focus.z,
      );
    }
    this.habitat = lerpHabitat(
      this.habitat,
      this.habitatTarget,
      1 - Math.exp(-delta * WORLD_AUDIO_HABITAT_HZ),
    );

    const weatherAvailable = this.options.weather?.isAvailable() === true;
    const snapshot = weatherAvailable
      ? this.options.weather!.getSnapshot()
      : SILENT_WEATHER;
    const desired = capAmbientGains(
      ambientGainsFromWeather(snapshot, this.habitat),
      WORLD_AUDIO_MAX_GAIN_SUM,
    );
    if (this.presetId === undefined) {
      this.presetId = snapshot.presetId;
      this.resources.mixer.setTarget(desired);
    } else if (this.presetId !== snapshot.presetId) {
      this.presetId = snapshot.presetId;
      this.resources.mixer.setTarget(desired);
      if (weatherAvailable) this.cueTransition(snapshot.presetId);
    } else {
      this.resources.mixer.follow(desired);
    }

    const settings = hudSettingsStore.snapshot();
    const audible = this.applyOutputGains(settings);
    this.resources.mixer.update(delta);
    if (audible) {
      this.resources.emitters.update(delta, focus, this.habitat, 1);
    }
    this.pollFeet(audible);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("click", this.handleGesture);
    document.removeEventListener("change", this.handleGesture);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    disposeResources([
      this.tracker,
      { dispose: () => disposeWorldAudioResources(this.resources) },
    ]);
  }

  private pollFeet(audible: boolean): void {
    const character = this.options.flyMode
      ? undefined
      : this.options.getCharacter();
    const pose = character?.getContactPose();
    const events = this.tracker.poll(
      character && pose
        ? {
            gait: character.getGait(),
            grounded: pose.grounded,
            teleported: character.consumeTeleported(),
            speed: pose.speed,
            landing: pose.landed,
            landingImpact: pose.landingImpact,
            airborne: !pose.grounded,
            copyFootPosition: (foot, target) =>
              character.copyFootWorldPosition(foot, target),
          }
        : undefined,
    );
    const wetness = this.options.rain?.wetness.value ?? 0;
    for (const event of events) {
      this.options.rain?.addWaterContact({
        x: event.position.x,
        y: event.position.y,
        z: event.position.z,
        radius: event.landing
          ? WORLD_AUDIO_LANDING_RADIUS_METERS
          : WORLD_AUDIO_FOOT_RADIUS_METERS,
        strength: event.landing
          ? WORLD_AUDIO_LANDING_STRENGTH
          : WORLD_AUDIO_FOOT_STRENGTH,
      });
      if (!audible) continue;
      const surface = this.resources.classifier.classify(
        event.position.x,
        event.position.z,
        wetness,
      );
      this.resources.footsteps.play(event, surface, 1);
    }
  }

  private cueTransition(presetId: WorldWeatherSnapshot["presetId"]): void {
    if (!this.isAudible()) return;
    const clip = worldAudioPresetEssentials().find(
      (entry) => entry.kind === "transition",
    );
    if (!clip) return;
    void this.resources.bank.load(clip.id).then((buffer) => {
      if (
        !buffer ||
        this.disposed ||
        this.presetId !== presetId ||
        !this.isAudible()
      ) {
        return;
      }
      this.resources.voices.play(buffer, {
        clipId: clip.id,
        bus: "effects",
        gain: 0.35,
      });
    });
  }

  private applyOutputGains(settings: Readonly<HudSettings>): boolean {
    const audible = this.allowed && settings.soundEnabled && !document.hidden;
    const master = audible ? settings.masterVolume : 0;
    this.resources.voices.setBusGain(
      "ambient",
      master * settings.ambientVolume,
    );
    this.resources.voices.setBusGain(
      "effects",
      master * settings.effectsVolume,
    );
    return audible;
  }

  private isAudible(): boolean {
    const settings = hudSettingsStore.snapshot();
    return this.allowed && settings.soundEnabled && !document.hidden;
  }

  private syncContext(): void {
    const context = this.resources.listener.context;
    if (
      document.hidden ||
      !this.allowed ||
      !hudSettingsStore.getSoundEnabled() ||
      context.state !== "suspended" ||
      this.resumeInFlight ||
      this.resumeBlocked
    ) {
      return;
    }
    this.resumeInFlight = true;
    void context.resume().then(() => {
      this.resumeBlocked = false;
      this.resumeFailureReported = false;
    }).catch((error) => {
      this.resumeBlocked = true;
      if (!this.resumeFailureReported) {
        this.resumeFailureReported = true;
        console.warn("[Drusniel World] Audio resume was rejected.", error);
      }
    }).finally(() => {
      this.resumeInFlight = false;
    });
  }

  private readonly handleGesture = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(GESTURE_SELECTOR)) return;

    if (target.closest(".world-loading-sound")) {
      const input = target.closest("label")?.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      if (input && !input.checked) {
        this.allowed = false;
        this.applyOutputGains(hudSettingsStore.snapshot());
        return;
      }
    }

    this.allowed = true;
    this.resumeBlocked = false;
    this.applyOutputGains(hudSettingsStore.snapshot());
    this.syncContext();
  };

  private readonly handleVisibility = (): void => {
    if (!document.hidden) this.resumeBlocked = false;
    this.applyOutputGains(hudSettingsStore.snapshot());
    this.syncContext();
  };
}

export function attachWorldAudio(
  experience: WorldExperience,
  options: WorldAudioSystemOptions,
): WorldAudioSystem | undefined {
  if (experience.budgets.audioVoices < 1) return undefined;
  let audio: WorldAudioSystem | undefined;
  experience.attach("audio", () => {
    audio = new WorldAudioSystem(options, experience.budgets.audioVoices);
    return audio;
  });
  return audio;
}
