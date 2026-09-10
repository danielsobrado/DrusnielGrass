import type { WorldWeatherSnapshot } from "../world/weather/WorldWeatherState";
import type { WorldAudioBank } from "./WorldAudioBank";
import { worldAudioClip } from "./WorldAudioCatalog";
import {
  WORLD_AUDIO_PRESET_FADE_SECONDS,
  WORLD_AUDIO_RAIN_GAIN_BASE,
  WORLD_AUDIO_RAIN_GAIN_BOOST,
  WORLD_AUDIO_RAIN_GAIN_BOOST_END,
  WORLD_AUDIO_RAIN_GAIN_BOOST_START,
} from "./WorldAudioTuning";
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

interface AmbientBed {
  readonly clipId: string;
  gain(gains: WorldAmbientGains): number;
}

const ZERO_GAINS: WorldAmbientGains = Object.freeze({
  wind: 0,
  rain: 0,
  forest: 0,
  wetland: 0,
  water: 0,
});

const BED_ACTIVE_THRESHOLD = 0.001;
const RAIN_HEAVY_BLEND_START = 0.24;
const RAIN_HEAVY_BLEND_END = 0.62;

const BEDS: readonly AmbientBed[] = Object.freeze([
  { clipId: "ambient/highfield-wind-01.mp3", gain: (gains) => gains.wind },
  {
    clipId: "ambient/rain-light-01.mp3",
    gain: (gains) => gains.rain * (1 - rainHeavyBlend(gains.rain)),
  },
  {
    clipId: "ambient/rain-heavy-01.mp3",
    gain: (gains) => gains.rain * rainHeavyBlend(gains.rain),
  },
  { clipId: "ambient/forest-01.mp3", gain: (gains) => gains.forest },
  { clipId: "ambient/wetland-01.mp3", gain: (gains) => gains.wetland },
  { clipId: "ambient/lake-01.mp3", gain: (gains) => gains.water },
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
  private readonly playing = new Map<
    string,
    NonNullable<ReturnType<WorldAudioVoices["play"]>>
  >();
  private readonly loading = new Set<string>();
  private disposed = false;

  constructor(
    private readonly bank: WorldAudioBank,
    private readonly voices: WorldAudioVoices,
  ) {}

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

  update(deltaSeconds: number, outputEnabled = true): WorldAmbientGains {
    if (this.disposed) return this.current;
    const delta = Math.max(0, deltaSeconds);
    if (this.fade < 1) {
      this.fade = Math.min(
        1,
        this.fade + delta / WORLD_AUDIO_PRESET_FADE_SECONDS,
      );
      this.current = mixGains(this.start, this.target, this.fade);
    }
    if (outputEnabled) this.syncVoices();
    return this.current;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    let firstError: unknown;
    let failed = false;
    for (const voice of this.playing.values()) {
      try {
        this.voices.stop(voice);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    this.playing.clear();
    this.loading.clear();
    if (failed) throw firstError;
  }

  private syncVoices(): void {
    for (const bed of BEDS) {
      const gain = bed.gain(this.current);
      const existing = this.playing.get(bed.clipId);
      if (gain <= BED_ACTIVE_THRESHOLD) {
        if (existing) {
          this.voices.stop(existing);
          this.playing.delete(bed.clipId);
        }
        continue;
      }
      if (existing?.isPlaying) {
        this.voices.setGain(existing, gain);
        continue;
      }
      if (existing) this.playing.delete(bed.clipId);
      if (this.loading.has(bed.clipId)) continue;
      this.loading.add(bed.clipId);
      void this.startBed(bed);
    }
  }

  private async startBed(bed: AmbientBed): Promise<void> {
    try {
      const clip = worldAudioClip(bed.clipId);
      if (!clip) return;
      const buffer = await this.bank.load(bed.clipId);
      if (!buffer || this.disposed) return;

      const gain = bed.gain(this.current);
      if (gain <= BED_ACTIVE_THRESHOLD) return;
      const existing = this.playing.get(bed.clipId);
      if (existing?.isPlaying) {
        this.voices.setGain(existing, gain);
        return;
      }
      if (existing) this.playing.delete(bed.clipId);

      const voice = this.voices.play(buffer, {
        clipId: bed.clipId,
        bus: "ambient",
        gain,
        loop: true,
      });
      if (voice) this.playing.set(bed.clipId, voice);
    } catch (error) {
      console.warn(
        `[Drusniel World] Ambient audio bed unavailable: ${bed.clipId}.`,
        error,
      );
    } finally {
      this.loading.delete(bed.clipId);
    }
  }
}

export function ambientGainsFromWeather(
  weather: WorldWeatherSnapshot,
  habitat: WorldHabitatWeights,
): WorldAmbientGains {
  const wind = clamp01(weather.windIntensity) * 0.22;
  const rain = clamp01(weather.rainIntensity);
  const boost = smooth01(
    (rain - WORLD_AUDIO_RAIN_GAIN_BOOST_START) /
      (WORLD_AUDIO_RAIN_GAIN_BOOST_END - WORLD_AUDIO_RAIN_GAIN_BOOST_START),
  );
  const rainBed =
    rain * WORLD_AUDIO_RAIN_GAIN_BASE + boost * WORLD_AUDIO_RAIN_GAIN_BOOST;
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
  const sum =
    gains.wind + gains.rain + gains.forest + gains.wetland + gains.water;
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

function rainHeavyBlend(rainGain: number): number {
  return smooth01(
    (rainGain - RAIN_HEAVY_BLEND_START) /
      (RAIN_HEAVY_BLEND_END - RAIN_HEAVY_BLEND_START),
  );
}

function smooth01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
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
