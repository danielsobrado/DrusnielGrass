import type * as THREE from "three";
import type { TerrainField } from "../world/TerrainField";

/**
 * What a development-only actor proof needs from the running world.
 *
 * The contract lives beside the composition root rather than inside it, so the
 * orchestrator only has to hand the pieces over and the proof scene stays out
 * of the production bundle.
 */
export interface WorldActorProofContext {
  readonly scene: THREE.Scene;
  readonly field: TerrainField;
  readonly detach: () => void;
}
