import * as THREE from "three";
import type { WorldAudioBank } from "./WorldAudioBank";
import type { WorldAudioClip } from "./WorldAudioCatalog";
import { worldAudioGroup } from "./WorldAudioCatalog";
import type { WorldHabitatWeights } from "./WorldAmbientMixer";
import {
  WORLD_AUDIO_EMITTER_RADIUS_METERS,
  WORLD_AUDIO_MAX_EMITTERS,
  WORLD_AUDIO_WATER_REF_DISTANCE_METERS,
  WORLD_AUDIO_WILDLIFE_REF_DISTANCE_METERS,
} from "./WorldAudioTuning";
import type { WorldAudioVoices } from "./WorldAudioVoices";

interface EmitterSlot {
  kind: "bird" | "insect" | "water";
  x: number;
  z: number;
  lastClip?: string;
  cooldown: number;
}

/**
 * Bounded positional cues from deterministic nearby habitat, recycled as focus
 * moves. Mono sources only.
 */
export class WorldSpatialEmitters {
  private readonly slots: EmitterSlot[] = [];
  private readonly position = new THREE.Vector3();
  private disposed = false;

  constructor(
    private readonly bank: WorldAudioBank,
    private readonly voices: WorldAudioVoices,
    private readonly scene: THREE.Scene,
    private readonly seed: number,
  ) {
  }

  update(
    deltaSeconds: number,
    focus: THREE.Vector3,
    habitat: WorldHabitatWeights,
    gain: number,
  ): void {
    if (this.disposed || gain <= 0) return;
    this.recycle(focus, habitat);
    for (const slot of this.slots) {
      slot.cooldown -= deltaSeconds;
      if (slot.cooldown > 0) continue;
      const clips = clipsFor(slot.kind);
      if (clips.length === 0) continue;
      const clip = pickAvoiding(clips, slot.lastClip, this.seed, slot.x, slot.z);
      slot.lastClip = clip.id;
      slot.cooldown = 2.4 + hash01(this.seed, slot.x, slot.z, 9) * 4.2;
      void this.play(clip, slot, gain);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.slots.length = 0;
  }

  private recycle(focus: THREE.Vector3, habitat: WorldHabitatWeights): void {
    const keep = this.slots.filter((slot) =>
      Math.hypot(slot.x - focus.x, slot.z - focus.z) < WORLD_AUDIO_EMITTER_RADIUS_METERS * 1.15,
    );
    this.slots.length = 0;
    this.slots.push(...keep);
    const needed = Math.min(
      WORLD_AUDIO_MAX_EMITTERS,
      2 + Math.round(habitat.forest * 2) + Math.round(habitat.wetland) + Math.round(habitat.water),
    );
    let guard = 0;
    while (this.slots.length < needed && guard < 16) {
      guard += 1;
      const angle = hash01(this.seed, focus.x, focus.z, this.slots.length) * Math.PI * 2;
      const radius = 8 + hash01(this.seed, this.slots.length, focus.x, 3) * (WORLD_AUDIO_EMITTER_RADIUS_METERS - 8);
      const x = focus.x + Math.cos(angle) * radius;
      const z = focus.z + Math.sin(angle) * radius;
      const kind = chooseKind(habitat, this.seed, x, z);
      if (!kind) continue;
      this.slots.push({ kind, x, z, cooldown: hash01(this.seed, x, z, 4) * 1.5 });
    }
  }

  private async play(clip: WorldAudioClip, slot: EmitterSlot, gain: number): Promise<void> {
    const buffer = await this.bank.load(clip.id);
    if (!buffer || this.disposed) return;
    this.position.set(slot.x, 1.2, slot.z);
    this.voices.play(buffer, {
      clipId: clip.id,
      gain: gain * (slot.kind === "water" ? 0.22 : 0.18),
      position: this.position,
      refDistance: slot.kind === "water"
        ? WORLD_AUDIO_WATER_REF_DISTANCE_METERS
        : WORLD_AUDIO_WILDLIFE_REF_DISTANCE_METERS,
      parent: this.scene,
    });
  }
}

function clipsFor(kind: EmitterSlot["kind"]): WorldAudioClip[] {
  if (kind === "bird") return worldAudioGroup("wildlife", "bird");
  if (kind === "insect") return worldAudioGroup("wildlife", "insect");
  return worldAudioGroup("ambient", "shore");
}

function chooseKind(
  habitat: WorldHabitatWeights,
  seed: number,
  x: number,
  z: number,
): EmitterSlot["kind"] | undefined {
  const pick = hash01(seed, x, z, 7);
  if (habitat.water > 0.35 && pick < 0.34) return "water";
  if (habitat.wetland > 0.3 && pick < 0.55) return "insect";
  if (habitat.forest + habitat.meadow > 0.2) return "bird";
  return undefined;
}

function pickAvoiding(
  clips: WorldAudioClip[],
  last: string | undefined,
  seed: number,
  x: number,
  z: number,
): WorldAudioClip {
  if (clips.length === 1) return clips[0];
  const pool = last ? clips.filter((clip) => clip.id !== last) : clips;
  const index = Math.floor(hash01(seed, x, z, 11) * pool.length) % pool.length;
  return pool[index];
}

function hash01(seed: number, a: number, b: number, c: number): number {
  const x = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719 + c * 4.141) * 43758.5453;
  return x - Math.floor(x);
}
