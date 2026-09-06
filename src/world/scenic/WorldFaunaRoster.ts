import type * as THREE from "three";
import type { DeerVariant } from "../../creatures/deer/DeerGeometry";
import type { TerrainField } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import { WorldFaunaField, type WorldFaunaMember } from "./WorldFaunaField";
import {
  FAUNA_REBUILD_STEP,
  FAUNA_SPAWN_MIN_PLAYER_DISTANCE,
} from "./WorldScenicTuning";

/**
 * The set of places a free animal could currently go.
 *
 * Kept apart from the population itself because it answers a different
 * question. The population owns actors and their animation cost; this owns only
 * the map — which herds exist near the player right now, and which of their
 * members is the best one for the next actor that needs a home.
 */
export class WorldFaunaRoster {
  private readonly herds: WorldFaunaField;
  private readonly available: WorldFaunaMember[] = [];
  private readonly streamRadius: number;
  private builtX = Number.NaN;
  private builtZ = Number.NaN;

  constructor(field: TerrainField, config: WorldConfig) {
    this.herds = new WorldFaunaField(field, config);
    this.streamRadius = config.faunaStreamRadius;
  }

  /**
   * Recollects the herd lattice when the player has actually gone somewhere.
   *
   * Active members are excluded while rebuilding so a streamed actor can never
   * claim a herd member already represented by another live slot.
   */
  refresh(
    focusX: number,
    focusZ: number,
    force = false,
    occupied: ReadonlySet<string> = EMPTY_MEMBER_KEYS,
  ): boolean {
    if (
      !force &&
      Number.isFinite(this.builtX) &&
      Math.abs(focusX - this.builtX) < FAUNA_REBUILD_STEP &&
      Math.abs(focusZ - this.builtZ) < FAUNA_REBUILD_STEP
    ) {
      return false;
    }
    this.builtX = focusX;
    this.builtZ = focusZ;
    this.available.length = 0;
    for (const herd of this.herds.collect(focusX, focusZ, this.streamRadius)) {
      for (const member of herd.members) {
        if (!occupied.has(faunaMemberKey(member))) {
          this.available.push(member);
        }
      }
    }
    return true;
  }

  /**
   * Claims the nearest usable place, or nothing.
   *
   * Selection never rebuilds the roster. Terrain sampling stays explicitly
   * movement-gated by refresh(), so exhausting the current roster cannot trigger
   * repeated synchronous collection or reintroduce already occupied members.
   */
  take(
    focus: THREE.Vector3,
    variant?: DeerVariant,
  ): WorldFaunaMember | undefined {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.available.length; index += 1) {
      const member = this.available[index];
      if (variant !== undefined && member.variant !== variant) {
        continue;
      }
      const distance = Math.hypot(member.x - focus.x, member.z - focus.z);
      if (distance < FAUNA_SPAWN_MIN_PLAYER_DISTANCE || distance >= bestDistance) {
        continue;
      }
      bestDistance = distance;
      bestIndex = index;
    }
    if (bestIndex < 0) {
      return undefined;
    }
    return this.available.splice(bestIndex, 1)[0];
  }
}

const EMPTY_MEMBER_KEYS: ReadonlySet<string> = new Set<string>();

export function faunaMemberKey(member: WorldFaunaMember): string {
  return `${member.seed}:${member.x}:${member.z}`;
}
