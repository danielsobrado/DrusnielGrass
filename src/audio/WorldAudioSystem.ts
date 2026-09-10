import * as THREE from "three";
import type { WorldExperience } from "../app/WorldExperience";
import type { SnowflowCharacter } from "../character/SnowflowCharacter";
import { WorldFootContactTracker } from "../controls/WorldFootContactTracker";
import { disposeResources } from "../render/ResourceDisposal";
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
import { WorldAudioPermission } from "./WorldAudioPermission";
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

/** One listener, one buffer cache, and the mixers that share them. */
export class WorldAudioSystem {
  private readonly resources: WorldAudioResources;
  private readonly permission: WorldAudioPermission;
  private readonly tracker = new WorldFootContactTracker();
  private habitat: WorldHabitatWeights = { ...EMPTY_AUDIO_HABITAT };
  private habitatTarget: WorldHabitatWeights = { ...EMPTY_AUDIO_HABITAT };
  private habitatAge = 1;
  private presetId?: WorldWeatherSnapshot["presetId"];
  private essentialsWarmed = false;
  private disposed = false;

  constructor(
    private readonly options: WorldAudioSystemOptions,
    voiceCapacity: number,
  ) {
    this.resources = createWorldAudioResources(options, voiceCapacity);
    try {
      this.permission = new WorldAudioPermission(
        this.resources.listener,
        this.resources.voices,
      );
    } catch (error) {
      try {
        disposeWorldAudioResources(this.resources);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Audio permission rollback failed.",
          cleanupError,
        );
      }
      throw error;
    }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? deltaSeconds
      : 0;
    this.permission.update();
    const ambientAudible = this.permission.isAmbientAudible();
    const effectsAudible = this.permission.isEffectsAudible();
    if (!this.essentialsWarmed && (ambientAudible || effectsAudible)) {
      this.warmEssentials();
    }
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

    this.resources.mixer.update(delta, ambientAudible);
    if (effectsAudible) {
      this.resources.emitters.update(delta, focus, this.habitat, 1);
    }
    this.pollFeet(effectsAudible);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResources([
      this.permission,
      this.tracker,
      { dispose: () => disposeWorldAudioResources(this.resources) },
    ]);
  }

  private pollFeet(effectsAudible: boolean): void {
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
      if (!effectsAudible) continue;
      const surface = this.resources.classifier.classify(
        event.position.x,
        event.position.z,
        wetness,
      );
      this.resources.footsteps.play(event, surface, 1);
    }
  }

  private warmEssentials(): void {
    this.essentialsWarmed = true;
    for (const clip of worldAudioPresetEssentials()) {
      void this.resources.bank.load(clip.id);
    }
  }

  private cueTransition(presetId: WorldWeatherSnapshot["presetId"]): void {
    if (!this.permission.isEffectsAudible()) return;
    const clip = worldAudioPresetEssentials().find(
      (entry) => entry.kind === "transition",
    );
    if (!clip) return;
    void this.resources.bank.load(clip.id).then((buffer) => {
      if (
        !buffer ||
        this.disposed ||
        this.presetId !== presetId ||
        !this.permission.isEffectsAudible()
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
