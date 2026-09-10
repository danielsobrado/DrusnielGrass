import * as THREE from "three";
import type { WorldExperience } from "../app/WorldExperience";
import type { SnowflowCharacter } from "../character/SnowflowCharacter";
import { WorldFootContactTracker } from "../controls/WorldFootContactTracker";
import { hudSettingsStore } from "../runtime/HudSettingsStore";
import type { TerrainField } from "../world/TerrainField";
import type { WorldRainSystem } from "../world/weather/WorldRainSystem";
import type {
  WorldWeatherSnapshot,
  WorldWeatherState,
} from "../world/weather/WorldWeatherState";
import {
  ambientGainsFromWeather,
  capAmbientGains,
  WorldAmbientMixer,
  type WorldHabitatWeights,
} from "./WorldAmbientMixer";
import { WorldAudioBank, type WorldAudioDecode } from "./WorldAudioBank";
import { worldAudioPresetEssentials } from "./WorldAudioCatalog";
import {
  EMPTY_AUDIO_HABITAT,
  lerpHabitat,
  sampleWorldAudioHabitat,
} from "./WorldAudioHabitat";
import { WorldAudioVoices } from "./WorldAudioVoices";
import { WorldFootstepAudio } from "./WorldFootstepAudio";
import { WorldSpatialEmitters } from "./WorldSpatialEmitters";
import { WorldSurfaceClassifier } from "./WorldSurfaceClassifier";
import {
  WORLD_AUDIO_CACHE_BYTES_COMPACT,
  WORLD_AUDIO_CACHE_BYTES_DESKTOP,
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

const GESTURE_SELECTOR = ".world-loading-start, .world-loading-sound, [data-setting=sound]";

/** One listener, one buffer cache, and the mixers that share them. */
export class WorldAudioSystem {
  private readonly listener: THREE.AudioListener;
  private readonly bank: WorldAudioBank;
  private readonly voices: WorldAudioVoices;
  private readonly mixer: WorldAmbientMixer;
  private readonly emitters: WorldSpatialEmitters;
  private readonly footsteps: WorldFootstepAudio;
  private readonly tracker = new WorldFootContactTracker();
  private readonly classifier: WorldSurfaceClassifier;
  private habitat: WorldHabitatWeights = { ...EMPTY_AUDIO_HABITAT };
  private habitatTarget: WorldHabitatWeights = { ...EMPTY_AUDIO_HABITAT };
  private habitatAge = 1;
  private presetId?: WorldWeatherSnapshot["presetId"];
  private allowed = false;
  private disposed = false;

  constructor(
    private readonly options: WorldAudioSystemOptions,
    voiceCapacity: number,
  ) {
    this.listener = new THREE.AudioListener();
    options.camera.add(this.listener);
    this.bank = new WorldAudioBank(
      options.decode ?? decodeWith(this.listener),
      options.compact ? WORLD_AUDIO_CACHE_BYTES_COMPACT : WORLD_AUDIO_CACHE_BYTES_DESKTOP,
    );
    this.voices = new WorldAudioVoices(this.listener, voiceCapacity);
    this.mixer = new WorldAmbientMixer(this.bank, this.voices);
    this.emitters = new WorldSpatialEmitters(this.bank, this.voices, options.scene, options.seed);
    this.footsteps = new WorldFootstepAudio(this.bank, this.voices, options.scene, options.seed);
    this.classifier = new WorldSurfaceClassifier(options.terrain);
    for (const clip of worldAudioPresetEssentials()) {
      this.bank.retain(clip.id);
      void this.bank.load(clip.id);
    }
    document.addEventListener("click", this.handleGesture, true);
    document.addEventListener("change", this.handleGesture, true);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    if (this.options.weather && !this.options.weather.isAvailable()) {
      throw new Error("Audio weather source is unavailable.");
    }
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.syncContext();
    const focus = this.options.focus();
    this.habitatAge += delta;
    if (this.habitatAge >= 1 / WORLD_AUDIO_HABITAT_HZ) {
      this.habitatAge = 0;
      this.habitatTarget = sampleWorldAudioHabitat(this.options.terrain, focus.x, focus.z);
    }
    this.habitat = lerpHabitat(this.habitat, this.habitatTarget, 1 - Math.exp(-delta * WORLD_AUDIO_HABITAT_HZ));
    const snapshot = this.options.weather?.getSnapshot() ?? SILENT_WEATHER;
    const desired = capAmbientGains(
      ambientGainsFromWeather(snapshot, this.habitat),
      WORLD_AUDIO_MAX_GAIN_SUM,
    );
    if (this.presetId === undefined) {
      this.presetId = snapshot.presetId;
      this.mixer.setTarget(desired);
    } else if (this.presetId !== snapshot.presetId) {
      this.presetId = snapshot.presetId;
      this.mixer.setTarget(desired);
      this.cueTransition();
    } else {
      this.mixer.follow(desired);
    }
    const settings = hudSettingsStore.snapshot();
    const audible = this.allowed && settings.soundEnabled && !document.hidden;
    const ambientGain = audible ? settings.masterVolume * settings.ambientVolume : 0;
    const effectsGain = audible ? settings.masterVolume * settings.effectsVolume : 0;
    this.mixer.update(delta, ambientGain);
    if (audible) this.emitters.update(delta, focus, this.habitat, effectsGain);
    this.pollFeet(effectsGain, audible);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("click", this.handleGesture, true);
    document.removeEventListener("change", this.handleGesture, true);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.tracker.dispose();
    this.mixer.dispose();
    this.emitters.dispose();
    this.footsteps.dispose();
    this.voices.dispose();
    this.bank.dispose();
    this.listener.removeFromParent();
  }

  private pollFeet(effectsGain: number, audible: boolean): void {
    const character = this.options.flyMode ? undefined : this.options.getCharacter();
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
            copyFootPosition: (foot, target) => character.copyFootWorldPosition(foot, target),
          }
        : undefined,
    );
    const wetness = this.options.rain?.wetness.value ?? 0;
    for (const event of events) {
      this.options.rain?.addWaterContact({
        x: event.position.x,
        y: event.position.y,
        z: event.position.z,
        radius: event.landing ? WORLD_AUDIO_LANDING_RADIUS_METERS : WORLD_AUDIO_FOOT_RADIUS_METERS,
        strength: event.landing ? WORLD_AUDIO_LANDING_STRENGTH : WORLD_AUDIO_FOOT_STRENGTH,
      });
      if (!audible) continue;
      const surface = this.classifier.classify(event.position.x, event.position.z, wetness);
      this.footsteps.play(event, surface, effectsGain);
    }
  }

  private cueTransition(): void {
    const settings = hudSettingsStore.snapshot();
    if (!this.allowed || !settings.soundEnabled || document.hidden) return;
    const clip = worldAudioPresetEssentials().find((entry) => entry.kind === "transition");
    if (!clip) return;
    void this.bank.load(clip.id).then((buffer) => {
      if (!buffer || this.disposed) return;
      this.voices.play(buffer, {
        clipId: clip.id,
        gain: settings.masterVolume * settings.effectsVolume * 0.35,
      });
    });
  }

  private syncContext(): void {
    const context = this.listener.context;
    if (document.hidden) {
      if (context.state === "running") void context.suspend();
      return;
    }
    if (this.allowed && hudSettingsStore.getSoundEnabled() && context.state === "suspended") {
      void context.resume();
    }
  }

  private readonly handleGesture = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(GESTURE_SELECTOR)) return;
    this.allowed = true;
    this.syncContext();
  };

  private readonly handleVisibility = (): void => this.syncContext();
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

function decodeWith(listener: THREE.AudioListener): WorldAudioDecode {
  return async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const bytes = await response.arrayBuffer();
      return await listener.context.decodeAudioData(bytes.slice(0));
    } catch {
      return undefined;
    }
  };
}
