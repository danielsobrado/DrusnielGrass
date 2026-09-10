import type { WorldAudioClip } from "./WorldAudioCatalog";
import { WORLD_AUDIO_CLIPS, worldAudioClip } from "./WorldAudioCatalog";

export type WorldAudioDecode = (
  url: string,
  signal: AbortSignal,
) => Promise<AudioBuffer | undefined>;

interface BankEntry {
  readonly clip: WorldAudioClip;
  buffer?: AudioBuffer;
  bytes: number;
  refs: number;
  lastUse: number;
  missing: boolean;
  loading?: Promise<AudioBuffer | undefined>;
}

/**
 * One decoded-buffer cache per world. Memory is PCM bytes, not download size.
 * LRU eviction only drops unreferenced clips.
 */
export class WorldAudioBank {
  private readonly entries = new Map<string, BankEntry>();
  private readonly reportedMissing = new Set<string>();
  private readonly abort = new AbortController();
  private clock = 0;
  private disposed = false;

  constructor(
    private readonly decode: WorldAudioDecode,
    readonly byteCeiling: number,
  ) {
    if (!Number.isFinite(byteCeiling) || byteCeiling < 1) {
      throw new Error("Audio bank byte ceiling must be a positive finite number.");
    }
    for (const clip of WORLD_AUDIO_CLIPS) {
      this.entries.set(clip.id, { clip, bytes: 0, refs: 0, lastUse: 0, missing: false });
    }
  }

  get decodedBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      if (entry.buffer) total += entry.bytes;
    }
    return total;
  }

  retain(id: string): void {
    const entry = this.require(id);
    entry.refs += 1;
  }

  release(id: string): void {
    const entry = this.require(id);
    entry.refs = Math.max(0, entry.refs - 1);
  }

  peek(id: string): AudioBuffer | undefined {
    return this.require(id).buffer;
  }

  isMissing(id: string): boolean {
    return this.require(id).missing;
  }

  async load(id: string): Promise<AudioBuffer | undefined> {
    if (this.disposed) return undefined;
    const clip = worldAudioClip(id);
    if (!clip) return undefined;
    const entry = this.require(id);
    if (entry.buffer) {
      entry.lastUse = ++this.clock;
      return entry.buffer;
    }
    if (entry.missing) return undefined;
    if (!entry.loading) {
      entry.loading = this.decodeOne(entry);
    }
    try {
      return await entry.loading;
    } finally {
      entry.loading = undefined;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    for (const entry of this.entries.values()) {
      entry.buffer = undefined;
      entry.bytes = 0;
      entry.refs = 0;
      entry.loading = undefined;
    }
  }

  private async decodeOne(entry: BankEntry): Promise<AudioBuffer | undefined> {
    let buffer: AudioBuffer | undefined;
    try {
      buffer = await this.decode(entry.clip.path, this.abort.signal);
    } catch (error) {
      if (this.disposed || this.abort.signal.aborted) return undefined;
      this.reportMissing(entry.clip, error);
      entry.missing = true;
      return undefined;
    }
    if (this.disposed) return undefined;
    if (!buffer) {
      this.reportMissing(entry.clip);
      entry.missing = true;
      return undefined;
    }
    const bytes = pcmBytes(buffer);
    this.evictUntil(this.byteCeiling - bytes);
    if (this.decodedBytes + bytes > this.byteCeiling && entry.refs === 0) {
      return buffer;
    }
    entry.buffer = buffer;
    entry.bytes = bytes;
    entry.lastUse = ++this.clock;
    return buffer;
  }

  private evictUntil(budget: number): void {
    const victims = [...this.entries.values()]
      .filter((entry) => entry.buffer && entry.refs === 0)
      .sort((a, b) => a.lastUse - b.lastUse);
    for (const entry of victims) {
      if (this.decodedBytes <= budget) return;
      entry.buffer = undefined;
      entry.bytes = 0;
    }
  }

  private require(id: string): BankEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown audio clip ${id}.`);
    return entry;
  }

  private reportMissing(clip: WorldAudioClip, error?: unknown): void {
    if (this.reportedMissing.has(clip.id)) return;
    this.reportedMissing.add(clip.id);
    console.warn(`[Drusniel World] Audio clip unavailable: ${clip.path}`, error ?? "");
  }
}

export function pcmBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}
