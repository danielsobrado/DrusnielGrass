import type { Object3D } from "three";
import type { WorldFootContactEvent } from "../controls/WorldFootContactTracker";
import type { WorldAudioBank } from "./WorldAudioBank";
import type { WorldFootstepSurface } from "./WorldAudioCatalog";
import { worldAudioGroup, worldFootstepClips } from "./WorldAudioCatalog";
import { WORLD_AUDIO_ONE_SHOT_MAX_LOAD_DELAY_MS } from "./WorldAudioTuning";
import type { WorldAudioVoices } from "./WorldAudioVoices";

export class WorldFootstepAudio {
  private readonly lastBySurface = new Map<WorldFootstepSurface, string>();
  private disposed = false;

  constructor(
    private readonly bank: WorldAudioBank,
    private readonly voices: WorldAudioVoices,
    private readonly parent: Object3D,
    private readonly seed: number,
  ) {}

  play(
    event: WorldFootContactEvent,
    surface: WorldFootstepSurface,
    effectsGain: number,
  ): void {
    if (this.disposed || effectsGain <= 0) return;
    void this.trigger(event, surface, effectsGain);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lastBySurface.clear();
  }

  private async trigger(
    event: WorldFootContactEvent,
    surface: WorldFootstepSurface,
    effectsGain: number,
  ): Promise<void> {
    const requestedAt = performance.now();
    const clips = event.landing && surface === "water"
      ? worldAudioGroup("splash", "splash")
      : worldFootstepClips(surface);
    if (clips.length === 0) return;

    const last = this.lastBySurface.get(surface);
    const pool =
      last && clips.length > 1
        ? clips.filter((clip) => clip.id !== last)
        : clips;
    const index =
      Math.floor(hash01(this.seed, event.sequence, event.position.x) * pool.length) %
      pool.length;
    const clip = pool[index];
    const buffer = await this.bank.load(clip.id);
    if (
      !buffer ||
      this.disposed ||
      performance.now() - requestedAt > WORLD_AUDIO_ONE_SHOT_MAX_LOAD_DELAY_MS
    ) {
      return;
    }

    const speedGain = 0.55 + Math.min(1, event.groundedSpeed / 5) * 0.45;
    const impactGain = event.landing
      ? 0.7 + Math.min(1, event.impact) * 0.5
      : 1;
    const voice = this.voices.play(buffer, {
      clipId: clip.id,
      bus: "effects",
      gain: effectsGain * speedGain * impactGain * 0.55,
      position: event.position,
      refDistance: event.landing ? 4 : 2.4,
      parent: this.parent,
    });
    if (voice) this.lastBySurface.set(surface, clip.id);
  }
}

function hash01(seed: number, a: number, b: number): number {
  const x = Math.sin(seed * 12.9898 + a * 78.233 + b * 4.141) * 43758.5453;
  return x - Math.floor(x);
}
