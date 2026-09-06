/**
 * What the ground under a deer is like, as plain numbers.
 *
 * This is the same boundary the contact IK already uses for terrain: the
 * creature layer states what it needs to know and the world implements it, so
 * nothing in this folder has to import hydrology, ecology or landform fields to
 * decide where an animal will stand. A test can satisfy it with a flat plane.
 */
export interface DeerHabitatSample {
  /** Terrain height at the sampled point. */
  height: number;
  /** Surface normal's up component: 1 is flat, lower is steeper. */
  slopeUp: number;
  /** How worth eating this spot is, in [0, 1]. */
  forage: number;
  /** How much standing water covers it, in [0, 1]. */
  water: number;
}

export interface DeerHabitat {
  /** Fills `target` for one world-space point. Never allocates. */
  sample(worldX: number, worldZ: number, target: DeerHabitatSample): void;
}

export function createDeerHabitatSample(): DeerHabitatSample {
  return { height: 0, slopeUp: 1, forage: 0, water: 0 };
}
