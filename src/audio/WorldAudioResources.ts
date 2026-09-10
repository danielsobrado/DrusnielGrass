import * as THREE from "three";
import { disposeResources } from "../render/ResourceDisposal";
import type { TerrainField } from "../world/TerrainField";
import { WorldAmbientMixer } from "./WorldAmbientMixer";
import { WorldAudioBank, type WorldAudioDecode } from "./WorldAudioBank";
import {
  WORLD_AUDIO_CACHE_BYTES_COMPACT,
  WORLD_AUDIO_CACHE_BYTES_DESKTOP,
} from "./WorldAudioTuning";
import { WorldAudioVoices } from "./WorldAudioVoices";
import { WorldFootstepAudio } from "./WorldFootstepAudio";
import { WorldSpatialEmitters } from "./WorldSpatialEmitters";
import { WorldSurfaceClassifier } from "./WorldSurfaceClassifier";

export interface WorldAudioResourceOptions {
  readonly camera: THREE.Camera;
  readonly scene: THREE.Scene;
  readonly terrain: TerrainField;
  readonly compact: boolean;
  readonly seed: number;
  readonly decode?: WorldAudioDecode;
}

export interface WorldAudioResources {
  readonly listener: THREE.AudioListener;
  readonly bank: WorldAudioBank;
  readonly voices: WorldAudioVoices;
  readonly mixer: WorldAmbientMixer;
  readonly emitters: WorldSpatialEmitters;
  readonly footsteps: WorldFootstepAudio;
  readonly classifier: WorldSurfaceClassifier;
}

export function createWorldAudioResources(
  options: WorldAudioResourceOptions,
  voiceCapacity: number,
): WorldAudioResources {
  const listener = new THREE.AudioListener();
  let bank: WorldAudioBank | undefined;
  let voices: WorldAudioVoices | undefined;
  let mixer: WorldAmbientMixer | undefined;
  let emitters: WorldSpatialEmitters | undefined;
  let footsteps: WorldFootstepAudio | undefined;

  try {
    options.camera.add(listener);
    bank = new WorldAudioBank(
      options.decode ?? decodeWith(listener),
      options.compact
        ? WORLD_AUDIO_CACHE_BYTES_COMPACT
        : WORLD_AUDIO_CACHE_BYTES_DESKTOP,
    );
    voices = new WorldAudioVoices(listener, voiceCapacity);
    mixer = new WorldAmbientMixer(bank, voices);
    emitters = new WorldSpatialEmitters(
      bank,
      voices,
      options.scene,
      options.terrain,
      options.seed,
    );
    footsteps = new WorldFootstepAudio(
      bank,
      voices,
      options.scene,
      options.seed,
    );
    return {
      listener,
      bank,
      voices,
      mixer,
      emitters,
      footsteps,
      classifier: new WorldSurfaceClassifier(options.terrain),
    };
  } catch (error) {
    try {
      disposeResources([
        footsteps,
        emitters,
        mixer,
        voices,
        bank,
        { dispose: () => listener.removeFromParent() },
      ]);
    } catch (cleanupError) {
      console.warn(
        "[Drusniel World] Audio construction cleanup failed.",
        cleanupError,
      );
    }
    throw error;
  }
}

export function disposeWorldAudioResources(resources: WorldAudioResources): void {
  disposeResources([
    resources.footsteps,
    resources.emitters,
    resources.mixer,
    resources.voices,
    resources.bank,
    { dispose: () => resources.listener.removeFromParent() },
  ]);
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
