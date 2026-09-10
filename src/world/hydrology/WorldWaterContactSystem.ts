import type { TerrainField } from "../TerrainField";
import type { WorldWaterContactEvent } from "./WorldWaterContactField";
import { WorldWaterContactField } from "./WorldWaterContactField";
import {
  WORLD_WATER_CONTACT_CAPACITY_COMPACT,
  WORLD_WATER_CONTACT_CAPACITY_DESKTOP,
} from "./WorldWaterContactTuning";

export type WorldWaterContactImpulse = Omit<WorldWaterContactEvent, "time">;

/** Local hydrologic impacts shared by water rendering and world interactions. */
export class WorldWaterContactSystem {
  readonly field: WorldWaterContactField;
  private disposed = false;

  constructor(terrain: TerrainField, compact: boolean) {
    this.field = new WorldWaterContactField(
      terrain,
      compact
        ? WORLD_WATER_CONTACT_CAPACITY_COMPACT
        : WORLD_WATER_CONTACT_CAPACITY_DESKTOP,
    );
  }

  add(impulse: WorldWaterContactImpulse): boolean {
    if (this.disposed) return false;
    return this.field.add({
      ...impulse,
      time: performance.now() * 0.001,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.field.clear();
  }
}
