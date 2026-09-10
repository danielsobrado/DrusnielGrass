import * as THREE from "three";

export type WorldAudioBus = "ambient" | "effects";

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
  bus: WorldAudioBus;
  sourceGain: number;
  gain: number;
  startedAt: number;
  looping: boolean;
}

const DEFAULT_BUS_GAINS: Readonly<Record<WorldAudioBus, number>> = Object.freeze({
  ambient: 1,
  effects: 1,
});
const MAX_AMBIENT_VOICES = 6;
const RESERVED_POSITIONAL_VOICES = 2;

/**
 * Bounded pool of Three.js voices. Stereo ambient beds use non-positional
 * voices; one-shots that have a place use positional mono sources.
 */
export class WorldAudioVoices {
  private readonly slots: VoiceSlot[] = [];
  private readonly busGains: Record<WorldAudioBus, number> = {
    ...DEFAULT_BUS_GAINS,
  };
  private disposed = false;
  private sequence = 0;

  constructor(listener: THREE.AudioListener, capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Audio voice capacity must be a positive integer.");
    }
    const ambientCount = Math.min(
      MAX_AMBIENT_VOICES,
      Math.max(1, capacity - RESERVED_POSITIONAL_VOICES),
    );
    for (let index = 0; index < ambientCount; index += 1) {
      this.slots.push({
        audio: new THREE.Audio(listener) as THREE.Audio | THREE.PositionalAudio,
        positional: false,
        bus: "effects",
        sourceGain: 0,
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
        bus: "effects",
        sourceGain: 0,
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
      readonly bus: WorldAudioBus;
      readonly gain: number;
      readonly loop?: boolean;
      readonly position?: THREE.Vector3;
      readonly refDistance?: number;
      readonly parent?: THREE.Object3D;
    },
  ): THREE.Audio | THREE.PositionalAudio | undefined {
    const sourceGain = clampGain(options.gain);
    if (
      this.disposed ||
      sourceGain <= 0 ||
      this.busGains[options.bus] <= 0
    ) {
      return undefined;
    }
    const wantPositional = options.position !== undefined;
    const slot = this.claim(wantPositional);
    if (!slot) return undefined;
    try {
      this.stopSlot(slot);
    } catch (error) {
      console.warn(
        `[Drusniel World] Audio voice reuse failed for ${options.clipId}.`,
        error,
      );
      return undefined;
    }
    slot.clipId = options.clipId;
    slot.bus = options.bus;
    slot.sourceGain = sourceGain;
    slot.looping = options.loop === true;
    slot.startedAt = ++this.sequence;
    const audio = slot.audio;
    try {
      audio.setBuffer(buffer);
      audio.setLoop(slot.looping);
      this.applyGain(slot);
      if (
        slot.positional &&
        options.position &&
        audio instanceof THREE.PositionalAudio
      ) {
        audio.position.copy(options.position);
        if (options.refDistance && options.refDistance > 0) {
          audio.setRefDistance(options.refDistance);
        }
        options.parent?.add(audio);
      }
      audio.play();
      return audio;
    } catch (error) {
      try {
        this.stopSlot(slot);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Audio voice rollback failed.",
          cleanupError,
        );
      }
      console.warn(
        `[Drusniel World] Audio playback failed for ${options.clipId}.`,
        error,
      );
      return undefined;
    }
  }

  setGain(audio: THREE.Audio | THREE.PositionalAudio, gain: number): void {
    if (this.disposed) return;
    const slot = this.slots.find((entry) => entry.audio === audio);
    if (!slot) return;
    slot.sourceGain = clampGain(gain);
    this.applyGain(slot);
  }

  setBusGain(bus: WorldAudioBus, gain: number): void {
    if (this.disposed) return;
    const next = clampGain(gain);
    if (this.busGains[bus] === next) return;
    this.busGains[bus] = next;
    for (const slot of this.slots) {
      if (slot.bus === bus && slot.clipId) this.applyGain(slot);
    }
  }

  stop(audio: THREE.Audio | THREE.PositionalAudio): void {
    if (this.disposed) return;
    const slot = this.slots.find((entry) => entry.audio === audio);
    if (slot) this.stopSlot(slot);
  }

  stopAll(): void {
    let firstError: unknown;
    let failed = false;
    for (const slot of this.slots) {
      try {
        this.stopSlot(slot);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) throw firstError;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    let firstError: unknown;
    let failed = false;
    const attempt = (release: () => void): void => {
      try {
        release();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    };
    for (const slot of this.slots) {
      attempt(() => this.stopSlot(slot));
      // Three connects every voice gain to the listener input in the
      // constructor; stopping/disconnecting only releases the current source.
      attempt(() => slot.audio.getOutput().disconnect());
    }
    this.slots.length = 0;
    if (failed) throw firstError;
  }

  private claim(positional: boolean): VoiceSlot | undefined {
    for (const slot of this.slots) {
      if (!slot.audio.isPlaying && slot.clipId) {
        try {
          this.stopSlot(slot);
        } catch (error) {
          console.warn(
            "[Drusniel World] Finished audio voice cleanup failed.",
            error,
          );
        }
      }
    }
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

  private applyGain(slot: VoiceSlot): void {
    slot.gain = slot.sourceGain * this.busGains[slot.bus];
    slot.audio.setVolume(slot.gain);
  }

  private stopSlot(slot: VoiceSlot): void {
    let firstError: unknown;
    let failed = false;
    const attempt = (release: () => void): void => {
      try {
        release();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    };
    attempt(() => {
      if (slot.audio.isPlaying) slot.audio.stop();
    });
    attempt(() => slot.audio.disconnect());
    attempt(() => slot.audio.removeFromParent());
    // Three r185 leaves both fields referencing the decoded buffer/source after
    // stop. They are public runtime fields but readonly in the declaration.
    Object.assign(slot.audio, { buffer: null, source: null });
    slot.clipId = undefined;
    slot.bus = "effects";
    slot.sourceGain = 0;
    slot.gain = 0;
    slot.looping = false;
    if (failed) throw firstError;
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
  steal.sort(
    (a, b) =>
      slots[a].gain - slots[b].gain ||
      slots[a].startedAt - slots[b].startedAt,
  );
  return steal[0] ?? -1;
}

function clampGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
