import type * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { WorldController } from "../controls/WorldController";
import type { TerrainField } from "../world/TerrainField";

/**
 * What the visual-matrix QA runner needs from the running world.
 *
 * Kept beside the composition root so the orchestrator only hands pieces over
 * and the capture module stays off the default bundle path.
 */
export interface WorldVisualMatrixContext {
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly field: TerrainField;
  readonly profile: RuntimeProfile;
  readonly controls: WorldController;
  readonly isReady: () => boolean;
}
