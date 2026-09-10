import type { WorldWeatherSnapshot } from "../world/weather/WorldWeatherState";
import type { WorldAudioBank } from "./WorldAudioBank";
import { worldAudioClip } from "./WorldAudioCatalog";
import { WORLD_AUDIO_PRESET_FADE_SECONDS } from "./WorldAudioTuning";
import type { WorldAudioVoices } from "./WorldAudioVoices";

export interface WorldAmbientGains {
  wind: number;
  rain: number;
  forest: number;
  wetland: number;
  water: number;
}

export interface WorldHabitatWeights {
  meadow: number;
  forest: number;
  wetland: number;
  water: number;
}

const ZERO_GAINS: WorldAmbientGains = Object.freeze({
  wind: 0, rain: 0, forest: 0, wetland: 0, water: 0,
});

const BEDS: ReadonlyArray<{ key: keyof WorldAmbientGains; clipId: string }> = Object.freeze([
  { key: "wind", clipId: "ambient/highfield-wind-01.mp3" },
  { key: "rain", clipId: "ambient/rain-medium-01.mp3" },
  { key: "forest", clipId: "ambient/forest-01.mp3" },
  { key: "wetland", clipId: "ambient/wetland-01.mp3" },
  { key: "water", clipId: "ambient/lake-01.mp3" },
]);

/**
 * Crossfades ambient beds from the current gain vector, including interrupted
 * transitions. Habitat is supplied already interpolated by the owner.
 */
export class WorldAmbientMixer {
  private current: WorldAmbientGains = { ...ZERO_GAINS };
  private start: WorldAmbientGains = { ...ZERO_GAINS };
  private target: WorldAmbientGains = { ...ZERO_GAINS };
  private fade = 1;
  private playing = new Map<string, ReturnType<WorldAudioVoices["play"]>>();
  private disposed = false;

  constructor(
    private readonly bank: WorldAudioBank,
    private readonly voices: WorldAudioVoices,
  ) {
    for (const bed of BEDS) this.bank.retain(bed.clipId);
  }

  setTarget(next: WorldAmbientGains): void {
    this.start = { ...this.current };
    this.target = clampGains(next);
    this.fade = 0;
  }

  /** Habitat tracking must not restart a live preset fade. */
  follow(next: WorldAmbientGains): void {
    const clamped = clampGains(next);
    if (this.fade < 1) {
      this.target = clamped;
      return;
    }
    this.current = clamped;
    this.target = clamped;
  }

  getCurrent(): WorldAmbientGains {
    return { ...this.current };
  }

  getFade(): number {
    return this.fade;
  }

  update(deltaSeconds: number, master: number): WorldAmbientGains {
    if (this.disposed) return this.current;
    const delta = Math.max(0, deltaSeconds);
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + delta / WORLD_AUDIO_PRESET_FADE_SECONDS);
      this.current = mixGains(this.start, this.target, this.fade);
    }
    void this.syncVoices(master);
    return this.current;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const bed of BEDS) this.bank.release(bed.clipId);
    this.playing.clear();
  }

  private async syncVoices(master: number): Promise<void> {
    for (const bed of BEDS) {
      const gain = this.current[bed.key] * master;
      const clip = worldAudioClip(bed.clipId);
      if (!clip) continue;
      const existing = this.playing.get(bed.clipId);
      if (gain <= 0.001) {
        if (existing) existing.setVolume(0);
        continue;
      }
      if (existing?.isPlaying) {
        this.voices.setGain(existing, gain);
        continue;
      }
      const buffer = await this.bank.load(bed.clipId);
      if (!buffer || this.disposed) continue;
      const voice = this.voices.play(buffer, { clipId: bed.clipId, gain, loop: true });
      if (voice) this.playing.set(bed.clipId, voice);
    }
  }
}

export function ambientGainsFromWeather(
  weather: WorldWeatherSnapshot,
  habitat: WorldHabitatWeights,
): WorldAmbientGains {
  const wind = clamp01(weather.windIntensity) * 0.22;
  const rain = clamp01(weather.rainIntensity);
  const rainBed = rain < 0.35 ? rain * 0.55 : 0.2 + rain * 0.55;
  return clampGains({
    wind: wind * (1 - rain * 0.25),
    rain: rainBed,
    forest: habitat.forest * 0.42 * (1 - rain * 0.2),
    wetland: habitat.wetland * 0.38,
    water: habitat.water * 0.32,
  });
}

export function capAmbientGains(
  gains: WorldAmbientGains,
  maxSum: number,
): WorldAmbientGains {
  const sum = gains.wind + gains.rain + gains.forest + gains.wetland + gains.water;
  if (!(maxSum > 0) || sum <= maxSum) return clampGains(gains);
  const scale = maxSum / sum;
  return clampGains({
    wind: gains.wind * scale,
    rain: gains.rain * scale,
    forest: gains.forest * scale,
    wetland: gains.wetland * scale,
    water: gains.water * scale,
  });
}

export function mixGains(
  from: WorldAmbientGains,
  to: WorldAmbientGains,
  t: number,
): WorldAmbientGains {
  const a = clamp01(t);
  return {
    wind: from.wind + (to.wind - from.wind) * a,
    rain: from.rain + (to.rain - from.rain) * a,
    forest: from.forest + (to.forest - from.forest) * a,
    wetland: from.wetland + (to.wetland - from.wetland) * a,
    water: from.water + (to.water - from.water) * a,
  };
}

function clampGains(gains: WorldAmbientGains): WorldAmbientGains {
  return {
    wind: clamp01(gains.wind),
    rain: clamp01(gains.rain),
    forest: clamp01(gains.forest),
    wetland: clamp01(gains.wetland),
    water: clamp01(gains.water),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
