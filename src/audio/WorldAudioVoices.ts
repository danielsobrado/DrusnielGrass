import * as THREE from "three";

export interface WorldVoiceClaimState {
  readonly positional: boolean;
  readonly playing: boolean;
  readonly looping: boolean;
  readonly gain: number;
  readonly startedAt: number;
}

interface VoiceSlot {
  readonly audio: THREE.Audio | THREE.PositionalAudio;
  readonly positional: boolean;
  clipId?: string;
  gain: number;
  startedAt: number;
  looping: boolean;
}

/**
 * Bounded pool of Three.js voices. Stereo ambient beds use non-positional
 * voices; one-shots that have a place use positional mono sources.
 */
export class WorldAudioVoices {
  private readonly slots: VoiceSlot[] = [];
  private disposed = false;
  private sequence = 0;

  constructor(listener: THREE.AudioListener, capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Audio voice capacity must be a positive integer.");
    }
    const ambientCount = Math.min(5, Math.max(1, capacity - 3));
    for (let index = 0; index < ambientCount; index += 1) {
      this.slots.push({
        audio: new THREE.Audio(listener) as THREE.Audio | THREE.PositionalAudio,
        positional: false,
        gain: 0,
        startedAt: 0,
        looping: false,
      });
    }
    for (let index = ambientCount; index < capacity; index += 1) {
      const positional = new THREE.PositionalAudio(listener);
      positional.setRefDistance(12);
      positional.setRolloffFactor(1.4);
      this.slots.push({
        audio: positional,
        positional: true,
        gain: 0,
        startedAt: 0,
        looping: false,
      });
    }
  }

  play(
    buffer: AudioBuffer,
    options: {
      readonly clipId: string;
      readonly gain: number;
      readonly loop?: boolean;
      readonly position?: THREE.Vector3;
      readonly refDistance?: number;
      readonly parent?: THREE.Object3D;
    },
  ): THREE.Audio | THREE.PositionalAudio | undefined {
    if (this.disposed || options.gain <= 0) return undefined;
    const wantPositional = options.position !== undefined;
    const slot = this.claim(wantPositional);
    if (!slot) return undefined;
    this.stopSlot(slot);
    slot.clipId = options.clipId;
    slot.gain = options.gain;
    slot.looping = options.loop === true;
    slot.startedAt = ++this.sequence;
    const audio = slot.audio;
    audio.setBuffer(buffer);
    audio.setLoop(options.loop === true);
    audio.setVolume(options.gain);
    if (slot.positional && options.position && audio instanceof THREE.PositionalAudio) {
      audio.position.copy(options.position);
      if (options.refDistance) audio.setRefDistance(options.refDistance);
      options.parent?.add(audio);
    }
    audio.play();
    return audio;
  }

  setGain(audio: THREE.Audio | THREE.PositionalAudio, gain: number): void {
    if (this.disposed) return;
    const slot = this.slots.find((entry) => entry.audio === audio);
    if (!slot) return;
    slot.gain = Math.max(0, gain);
    audio.setVolume(slot.gain);
  }

  stopAll(): void {
    for (const slot of this.slots) this.stopSlot(slot);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    for (const slot of this.slots) {
      slot.audio.disconnect();
      slot.audio.removeFromParent();
    }
    this.slots.length = 0;
  }

  private claim(positional: boolean): VoiceSlot | undefined {
    const index = selectVoiceSlot(
      this.slots.map((slot) => ({
        positional: slot.positional,
        playing: slot.audio.isPlaying,
        looping: slot.looping,
        gain: slot.gain,
        startedAt: slot.startedAt,
      })),
      positional,
    );
    return index >= 0 ? this.slots[index] : undefined;
  }

  private stopSlot(slot: VoiceSlot): void {
    if (slot.audio.isPlaying) slot.audio.stop();
    slot.audio.removeFromParent();
    slot.clipId = undefined;
    slot.gain = 0;
    slot.looping = false;
  }
}

/** Idle same-kind slot, else the quietest non-looping one-shot. Loops are never stolen. */
export function selectVoiceSlot(
  slots: readonly WorldVoiceClaimState[],
  positional: boolean,
): number {
  let idle = -1;
  const steal: number[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (slot.positional !== positional) continue;
    if (!slot.playing) {
      idle = index;
      break;
    }
    if (!slot.looping) steal.push(index);
  }
  if (idle >= 0) return idle;
  steal.sort((a, b) => slots[a].gain - slots[b].gain || slots[a].startedAt - slots[b].startedAt);
  return steal[0] ?? -1;
}
