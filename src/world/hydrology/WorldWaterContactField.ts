import { Vector4 } from "three/webgpu";
import { uniform, uniformArray } from "three/tsl";
import { createHydrologySample } from "./HydrologyField";
import type { TerrainField } from "../TerrainField";
import {
  WORLD_WATER_CONTACT_COVERAGE_THRESHOLD,
  WORLD_WATER_CONTACT_MAX_AGE_SECONDS,
  WORLD_WATER_CONTACT_MAX_RADIUS_METERS,
  WORLD_WATER_CONTACT_MAX_STRENGTH,
  WORLD_WATER_CONTACT_MIN_RADIUS_METERS,
  WORLD_WATER_CONTACT_VERTICAL_TOLERANCE_METERS,
} from "../weather/WorldRainTuning";

const INACTIVE_EVENT_TIME = -1e6;

export interface WorldWaterContactEvent {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly time: number;
  readonly radius: number;
  readonly strength: number;
}

/**
 * Fixed-capacity water contacts for footsteps, landings and other local hits.
 *
 * This is deliberately separate from the stone-wake field. Stones describe a
 * persistent obstacle in flowing water; these entries are short-lived events
 * on the hydrologic surface and are overwritten in ring-buffer order.
 */
export class WorldWaterContactField {
  private readonly eventValues: Vector4[];
  private readonly strengthValues: Vector4[];
  readonly events;
  readonly strengths;
  /** Lets the water shader bypass the fixed slot loop while no event can contribute. */
  readonly activeUntil = uniform(INACTIVE_EVENT_TIME);

  private readonly hydrology = createHydrologySample();
  private cursor = 0;

  constructor(private readonly terrain: TerrainField, readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Water contact capacity must be a positive integer.");
    }
    this.eventValues = Array.from(
      { length: capacity },
      () => new Vector4(0, 0, INACTIVE_EVENT_TIME, 0),
    );
    this.strengthValues = Array.from(
      { length: capacity },
      () => new Vector4(0, 0, 0, 0),
    );
    this.events = uniformArray(this.eventValues);
    this.strengths = uniformArray(this.strengthValues);
  }

  add(event: WorldWaterContactEvent): boolean {
    if (!isFiniteEvent(event)) return false;

    const ground = this.terrain.sampleHeight(event.x, event.z);
    this.terrain.sampleHydrology(event.x, event.z, ground, this.hydrology);
    if (this.hydrology.waterCoverage < WORLD_WATER_CONTACT_COVERAGE_THRESHOLD) return false;
    if (Math.abs(event.y - this.hydrology.waterLevel) >
      WORLD_WATER_CONTACT_VERTICAL_TOLERANCE_METERS) return false;

    const radius = Math.max(
      WORLD_WATER_CONTACT_MIN_RADIUS_METERS,
      Math.min(WORLD_WATER_CONTACT_MAX_RADIUS_METERS, event.radius),
    );
    const strength = Math.min(WORLD_WATER_CONTACT_MAX_STRENGTH, event.strength);
    if (strength <= 0) return false;

    this.eventValues[this.cursor].set(event.x, event.z, event.time, radius);
    this.strengthValues[this.cursor].set(strength, 0, 0, 0);
    this.activeUntil.value = Math.max(
      this.activeUntil.value,
      event.time + WORLD_WATER_CONTACT_MAX_AGE_SECONDS,
    );
    this.cursor = (this.cursor + 1) % this.capacity;
    return true;
  }

  clear(): void {
    this.cursor = 0;
    this.activeUntil.value = INACTIVE_EVENT_TIME;
    for (let index = 0; index < this.capacity; index += 1) {
      this.eventValues[index].set(0, 0, INACTIVE_EVENT_TIME, 0);
      this.strengthValues[index].set(0, 0, 0, 0);
    }
  }
}

function isFiniteEvent(event: WorldWaterContactEvent): boolean {
  return Number.isFinite(event.x) && Number.isFinite(event.y) && Number.isFinite(event.z) &&
    Number.isFinite(event.time) && Number.isFinite(event.radius) && Number.isFinite(event.strength) &&
    event.radius > 0;
}
