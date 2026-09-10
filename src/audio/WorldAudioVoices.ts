import * as THREE from "three";
import {
  resolveWorldAudioVoiceLayout,
  resolveWorldAudioVoiceRole,
  selectVoiceSlot,
  type WorldAudioBus,
  type WorldAudioVoiceLayout,
  type WorldAudioVoiceRole,
} from "./WorldAudioVoicePolicy";

export { resolveWorldAudioVoiceLayout, selectVoiceSlot } from "./WorldAudioVoicePolicy";
export type {
  WorldAudioBus,
  WorldAudioVoiceLayout,
  WorldAudioVoiceRole,
  WorldVoiceClaimState,
} from "./WorldAudioVoicePolicy";

interface VoiceSlot {
  readonly audio: THREE.Audio | THREE.PositionalAudio;
  readonly role: WorldAudioVoiceRole;
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

/**
 * Bounded pool of Three.js voices partitioned by playback responsibility.
 * Ambient loops, global effects and positional one-shots never steal each other.
 */
export class WorldAudioVoices {
  private readonly slots: VoiceSlot[] = [];
  private readonly layout: WorldAudioVoiceLayout;
  private readonly busGains: Record<WorldAudioBus, number> = {
    ...DEFAULT_BUS_GAINS,
  };
  private disposed = false;
  private sequence = 0;

  constructor(listener: THREE.AudioListener, capacity: number) {
    this.layout = resolveWorldAudioVoiceLayout(capacity);
    for (let index = 0; index < this.layout.ambient; index += 1) {
      this.slots.push(createVoiceSlot(new THREE.Audio(listener), "ambient"));
    }
    for (let index = 0; index < this.layout.globalEffects; index += 1) {
      this.slots.push(createVoiceSlot(new THREE.Audio(listener), "global-effect"));
    }
    for (let index = 0; index < this.layout.positionalEffects; index += 1) {
      const positional = new THREE.PositionalAudio(listener);
      positional.setRefDistance(12);
      positional.setRolloffFactor(1.4);
      this.slots.push(createVoiceSlot(positional, "positional-effect"));
    }
  }

  getAmbientCapacity(): number {
    return this.layout.ambient;
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
    const role = resolveWorldAudioVoiceRole(
      options.bus,
      options.position !== undefined,
    );
    const slot = this.claim(role);
    if (!slot) return undefined;
    if (slot.clipId !== undefined || slot.audio.source !== null) {
      try {
        this.stopSlot(slot);
      } catch (error) {
        console.warn(
          `[Drusniel World] Audio voice reuse failed for ${options.clipId}.`,
          error,
        );
        return undefined;
      }
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
        slot.role === "positional-effect" &&
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

    if (bus === "effects" && next <= 0) {
      for (const slot of this.slots) {
        if (slot.bus !== "effects" || !slot.clipId) continue;
        try {
          this.stopSlot(slot);
        } catch (error) {
          console.warn("[Drusniel World] Muted effect cleanup failed.", error);
        }
      }
      return;
    }

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
      // Audio connects each voice gain to the listener input. PositionalAudio
      // returns its panner from getOutput(), so detach the gain explicitly.
      attempt(() => slot.audio.gain.disconnect(slot.audio.listener.getInput()));
    }
    this.slots.length = 0;
    if (failed) throw firstError;
  }

  private claim(role: WorldAudioVoiceRole): VoiceSlot | undefined {
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
        role: slot.role,
        playing: slot.audio.isPlaying,
        looping: slot.looping,
        gain: slot.gain,
        startedAt: slot.startedAt,
      })),
      role,
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
    const hadSource = slot.clipId !== undefined || slot.audio.source !== null;
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
    if (hadSource) {
      attempt(() => slot.audio.disconnect());
    }
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

function createVoiceSlot(
  audio: THREE.Audio | THREE.PositionalAudio,
  role: WorldAudioVoiceRole,
): VoiceSlot {
  return {
    audio,
    role,
    bus: "effects",
    sourceGain: 0,
    gain: 0,
    startedAt: 0,
    looping: false,
  };
}

function clampGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
