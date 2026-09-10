import {
  WORLD_AUDIO_MAX_AMBIENT_VOICES,
  WORLD_AUDIO_MIN_AMBIENT_VOICES,
  WORLD_AUDIO_RESERVED_GLOBAL_EFFECT_VOICES,
  WORLD_AUDIO_RESERVED_POSITIONAL_VOICES,
} from "./WorldAudioTuning";

export type WorldAudioBus = "ambient" | "effects";
export type WorldAudioVoiceRole =
  | "ambient"
  | "global-effect"
  | "positional-effect";

export interface WorldVoiceClaimState {
  readonly role: WorldAudioVoiceRole;
  readonly playing: boolean;
  readonly looping: boolean;
  readonly gain: number;
  readonly startedAt: number;
}

export interface WorldAudioVoiceLayout {
  readonly ambient: number;
  readonly globalEffects: number;
  readonly positionalEffects: number;
}

export function resolveWorldAudioVoiceLayout(
  capacity: number,
): WorldAudioVoiceLayout {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error("Audio voice capacity must be a positive integer.");
  }

  let remaining = capacity;
  const ambientBase = Math.min(WORLD_AUDIO_MIN_AMBIENT_VOICES, remaining);
  remaining -= ambientBase;
  const globalEffects = Math.min(
    WORLD_AUDIO_RESERVED_GLOBAL_EFFECT_VOICES,
    remaining,
  );
  remaining -= globalEffects;
  let positionalEffects = Math.min(
    WORLD_AUDIO_RESERVED_POSITIONAL_VOICES,
    remaining,
  );
  remaining -= positionalEffects;
  const ambientExtra = Math.min(
    WORLD_AUDIO_MAX_AMBIENT_VOICES - ambientBase,
    remaining,
  );
  remaining -= ambientExtra;
  positionalEffects += remaining;

  return Object.freeze({
    ambient: ambientBase + ambientExtra,
    globalEffects,
    positionalEffects,
  });
}

/** Idle same-role slot, else the quietest non-looping one-shot. Loops are never stolen. */
export function selectVoiceSlot(
  slots: readonly WorldVoiceClaimState[],
  role: WorldAudioVoiceRole,
): number {
  let idle = -1;
  const steal: number[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (slot.role !== role) continue;
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

export function resolveWorldAudioVoiceRole(
  bus: WorldAudioBus,
  positional: boolean,
): WorldAudioVoiceRole {
  if (positional) return "positional-effect";
  return bus === "ambient" ? "ambient" : "global-effect";
}
