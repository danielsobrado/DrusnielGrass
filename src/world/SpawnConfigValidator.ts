import { CHARACTER_SPAWN_CLEARANCE_RADIUS_SCALE } from "./SpawnTuning";
import type { WorldConfig } from "./WorldConfig";

export function validateSpawnConfig(config: WorldConfig): void {
  if (
    config.stonesEnabled >= 1 &&
    config.characterScale * CHARACTER_SPAWN_CLEARANCE_RADIUS_SCALE >
      config.stoneCellSize
  ) {
    throw new Error(
      "characterScale must keep the spawn stone-clearance radius within one stoneCellSize.",
    );
  }
}
