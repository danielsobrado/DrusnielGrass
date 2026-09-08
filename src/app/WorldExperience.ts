import type {
  WorldExperienceBudgets, WorldExperienceConfig, WorldExperienceFlagKey,
} from "../world/experience/WorldExperienceConfig";
import { resolveExperienceBudgets } from "../world/experience/WorldExperienceConfig";

/**
 * An optional system the experience layer may own.
 *
 * `update` is optional because several of these are event-driven — the painter
 * and the settings controller do nothing per frame — and a system that has no
 * per-frame work must not be given an empty one to run.
 */
export interface WorldExperienceOwner {
  update?(deltaSeconds: number): void;
  dispose(): void;
}

/** The optional systems, named so frame metrics and failure dispatch can see them. */
export const WORLD_EXPERIENCE_SLOTS = Object.freeze([
  "weather", "rain", "audio", "leaves", "birds", "painter", "tour", "cinematic",
] as const);
export type WorldExperienceSlot = (typeof WORLD_EXPERIENCE_SLOTS)[number];

/** Each slot is gated by exactly one configuration flag. */
const SLOT_FLAGS: Readonly<Record<WorldExperienceSlot, WorldExperienceFlagKey>> =
  Object.freeze({
    weather: "weatherEnabled",
    rain: "rainEnabled",
    audio: "audioEnabled",
    leaves: "leavesEnabled",
    birds: "birdsEnabled",
    painter: "painterEnabled",
    tour: "tourEnabled",
    cinematic: "cinematicEnabled",
  });

/**
 * Owns the optional presentation, audio, authoring and tour systems.
 *
 * It does not own terrain, and it does not run a loop: the world's single
 * animation loop calls `update` once per frame, in the documented phase. A
 * second loop here would drift against the first and double-advance whatever
 * both touched.
 *
 * An absent system is absent. A disabled slot holds no object, allocates
 * nothing, and costs one map lookup per frame — not a placeholder that ticks a
 * timer to do nothing, which is the shape that makes "disabled" untestable.
 */
export class WorldExperience {
  readonly budgets: WorldExperienceBudgets;
  private readonly owners = new Map<WorldExperienceSlot, WorldExperienceOwner>();
  private readonly updatable: { slot: WorldExperienceSlot; owner: WorldExperienceOwner }[] = [];
  private disposed = false;

  constructor(
    readonly config: WorldExperienceConfig,
    compact: boolean,
  ) {
    this.budgets = resolveExperienceBudgets(config, compact);
  }

  /** True when the configuration allows this slot to be filled at all. */
  isEnabled(slot: WorldExperienceSlot): boolean {
    return this.config[SLOT_FLAGS[slot]];
  }

  /**
   * Fills a slot, constructing nothing when the slot is switched off.
   *
   * The factory is only called for an enabled slot, so a disabled system never
   * allocates its buffers. A construction failure disables that one slot and
   * leaves the rest of the experience running: an optional effect is optional,
   * and losing it must not take the world down.
   */
  attach(slot: WorldExperienceSlot, create: () => WorldExperienceOwner): boolean {
    if (this.disposed || !this.isEnabled(slot) || this.owners.has(slot)) {
      return false;
    }
    let owner: WorldExperienceOwner;
    try {
      owner = create();
    } catch (error) {
      console.warn(`[Drusniel World] Optional ${slot} system unavailable.`, error);
      return false;
    }
    this.owners.set(slot, owner);
    if (owner.update) {
      this.updatable.push({ slot, owner });
    }
    return true;
  }

  get(slot: WorldExperienceSlot): WorldExperienceOwner | undefined {
    return this.owners.get(slot);
  }

  /** The slots that are actually filled, for diagnostics and frame metrics. */
  activeSlots(): WorldExperienceSlot[] {
    return [...this.owners.keys()];
  }

  /**
   * Advances every filled system once.
   *
   * A system that throws is released rather than retried: a per-frame failure
   * would otherwise repeat sixty times a second, and the effect is optional.
   */
  update(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    for (let index = this.updatable.length - 1; index >= 0; index--) {
      const entry = this.updatable[index];
      try {
        entry.owner.update?.(deltaSeconds);
      } catch (error) {
        console.warn(`[Drusniel World] Optional ${entry.slot} system failed; releasing it.`, error);
        this.updatable.splice(index, 1);
        this.owners.delete(entry.slot);
        disposeSafely(entry.slot, () => entry.owner.dispose());
      }
    }
  }

  /** Releases every system; one failure does not abandon the others. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.updatable.length = 0;
    for (const [slot, owner] of this.owners) {
      disposeSafely(slot, () => owner.dispose());
    }
    this.owners.clear();
  }
}

function disposeSafely(slot: string, release: () => void): void {
  try {
    release();
  } catch (error) {
    console.warn(`[Drusniel World] Optional ${slot} system cleanup failed.`, error);
  }
}
