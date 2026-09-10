import * as THREE from "three";
import { createHydrologySample } from "../world/hydrology/HydrologyField";
import type { TerrainField } from "../world/TerrainField";
import type { WorldAudioBank } from "./WorldAudioBank";
import type { WorldAudioClip } from "./WorldAudioCatalog";
import { worldAudioGroup } from "./WorldAudioCatalog";
import { sampleWorldAudioHabitat } from "./WorldAudioHabitat";
import type { WorldHabitatWeights } from "./WorldAmbientMixer";
import {
  WORLD_AUDIO_BIRD_HEIGHT_MAX_METERS,
  WORLD_AUDIO_BIRD_HEIGHT_MIN_METERS,
  WORLD_AUDIO_EMITTER_CELL_SIZE_METERS,
  WORLD_AUDIO_EMITTER_RADIUS_METERS,
  WORLD_AUDIO_INSECT_HEIGHT_METERS,
  WORLD_AUDIO_MAX_EMITTERS,
  WORLD_AUDIO_ONE_SHOT_MAX_LOAD_DELAY_MS,
  WORLD_AUDIO_WATER_COVERAGE_THRESHOLD,
  WORLD_AUDIO_WATER_HEIGHT_OFFSET_METERS,
  WORLD_AUDIO_WATER_REF_DISTANCE_METERS,
  WORLD_AUDIO_WILDLIFE_REF_DISTANCE_METERS,
} from "./WorldAudioTuning";
import type { WorldAudioVoices } from "./WorldAudioVoices";

interface EmitterSlot {
  readonly key: string;
  readonly kind: "bird" | "insect" | "water";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  lastClip?: string;
  cooldown: number;
}

interface EmitterCandidate {
  readonly slot: EmitterSlot;
  readonly distance: number;
}

/**
 * Bounded positional cues from deterministic nearby habitat, recycled as focus
 * moves. Mono sources only.
 */
export class WorldSpatialEmitters {
  private readonly slots: EmitterSlot[] = [];
  private readonly position = new THREE.Vector3();
  private readonly hydrology = createHydrologySample();
  private cellX = Number.NaN;
  private cellZ = Number.NaN;
  private desiredCount = -1;
  private disposed = false;

  constructor(
    private readonly bank: WorldAudioBank,
    private readonly voices: WorldAudioVoices,
    private readonly scene: THREE.Scene,
    private readonly terrain: TerrainField,
    private readonly seed: number,
  ) {}

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
      const clip = pickAvoiding(
        clips,
        slot.lastClip,
        this.seed,
        slot.x,
        slot.z,
      );
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
    const cellSize = WORLD_AUDIO_EMITTER_CELL_SIZE_METERS;
    const nextCellX = Math.floor(focus.x / cellSize);
    const nextCellZ = Math.floor(focus.z / cellSize);
    const needed = Math.min(
      WORLD_AUDIO_MAX_EMITTERS,
      2 +
        Math.round(habitat.forest * 2) +
        Math.round(habitat.wetland) +
        Math.round(habitat.water),
    );
    if (
      nextCellX === this.cellX &&
      nextCellZ === this.cellZ &&
      needed === this.desiredCount
    ) {
      return;
    }

    this.cellX = nextCellX;
    this.cellZ = nextCellZ;
    this.desiredCount = needed;
    const previous = new Map(this.slots.map((slot) => [slot.key, slot]));
    const candidates: EmitterCandidate[] = [];
    const range = Math.ceil(
      WORLD_AUDIO_EMITTER_RADIUS_METERS / WORLD_AUDIO_EMITTER_CELL_SIZE_METERS,
    );

    for (let dz = -range; dz <= range; dz += 1) {
      for (let dx = -range; dx <= range; dx += 1) {
        const cellX = nextCellX + dx;
        const cellZ = nextCellZ + dz;
        const x =
          (cellX + 0.15 + hash01(this.seed, cellX, cellZ, 1) * 0.7) *
          cellSize;
        const z =
          (cellZ + 0.15 + hash01(this.seed, cellX, cellZ, 2) * 0.7) *
          cellSize;
        const distance = Math.hypot(x - focus.x, z - focus.z);
        if (distance > WORLD_AUDIO_EMITTER_RADIUS_METERS) continue;

        const localHabitat = sampleWorldAudioHabitat(this.terrain, x, z);
        const kind = chooseKind(localHabitat, this.seed, x, z);
        if (!kind) continue;
        const key = `${cellX}:${cellZ}:${kind}`;
        const retained = previous.get(key);
        const slot = retained ?? {
          key,
          kind,
          x,
          y: this.sampleHeight(kind, x, z),
          z,
          cooldown: hash01(this.seed, x, z, 4) * 1.5,
        };
        candidates.push({
          slot,
          distance: distance + hash01(this.seed, cellX, cellZ, 5) * 3,
        });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    this.slots.length = 0;
    for (let index = 0; index < Math.min(needed, candidates.length); index += 1) {
      this.slots.push(candidates[index].slot);
    }
  }

  private sampleHeight(kind: EmitterSlot["kind"], x: number, z: number): number {
    const ground = this.terrain.sampleHeight(x, z);
    if (kind === "bird") {
      const height =
        WORLD_AUDIO_BIRD_HEIGHT_MIN_METERS +
        hash01(this.seed, x, z, 6) *
          (WORLD_AUDIO_BIRD_HEIGHT_MAX_METERS -
            WORLD_AUDIO_BIRD_HEIGHT_MIN_METERS);
      return ground + height;
    }
    if (kind === "insect") {
      return ground + WORLD_AUDIO_INSECT_HEIGHT_METERS;
    }

    this.terrain.sampleHydrology(x, z, ground, this.hydrology);
    const surface =
      this.hydrology.waterCoverage >= WORLD_AUDIO_WATER_COVERAGE_THRESHOLD
        ? Math.max(ground, this.hydrology.waterLevel)
        : ground;
    return surface + WORLD_AUDIO_WATER_HEIGHT_OFFSET_METERS;
  }

  private async play(
    clip: WorldAudioClip,
    slot: EmitterSlot,
    gain: number,
  ): Promise<void> {
    const requestedAt = performance.now();
    const buffer = await this.bank.load(clip.id);
    if (
      !buffer ||
      this.disposed ||
      !this.slots.includes(slot) ||
      performance.now() - requestedAt > WORLD_AUDIO_ONE_SHOT_MAX_LOAD_DELAY_MS
    ) {
      return;
    }
    this.position.set(slot.x, slot.y, slot.z);
    const voice = this.voices.play(buffer, {
      clipId: clip.id,
      bus: "effects",
      gain: gain * (slot.kind === "water" ? 0.22 : 0.18),
      position: this.position,
      refDistance:
        slot.kind === "water"
          ? WORLD_AUDIO_WATER_REF_DISTANCE_METERS
          : WORLD_AUDIO_WILDLIFE_REF_DISTANCE_METERS,
      parent: this.scene,
    });
    if (voice) slot.lastClip = clip.id;
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
  const index =
    Math.floor(hash01(seed, x, z, 11) * pool.length) % pool.length;
  return pool[index];
}

function hash01(seed: number, a: number, b: number, c: number): number {
  const x =
    Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719 + c * 4.141) *
    43758.5453;
  return x - Math.floor(x);
}
