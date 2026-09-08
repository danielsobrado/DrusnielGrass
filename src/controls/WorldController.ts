import type * as THREE from "three";

export type WorldControlMode = "fly" | "third-person";
export type ControllerRecoveryState =
  | { mode: "fly"; position: [number, number, number]; yaw: number; pitch: number; speed: number }
  | { mode: "third-person"; x: number; z: number; facing: number; yaw: number; elevation: number; distance: number };

export interface WorldController {
  captureRecoveryState(): ControllerRecoveryState;
  restoreRecoveryState(state: ControllerRecoveryState): void;
  update(deltaSeconds: number): void;
  dispose(): void;
  getSpeed(): number;
  getInputDiagnostics(): string;
  getStreamingPosition(): THREE.Vector3;
  getMode(): WorldControlMode;
  /**
   * Move to a ground position, clamping into the world and settling onto the
   * surface there. Implementations snap the camera rather than easing it: the
   * destination is arbitrarily far away, so an eased follow would sweep the
   * streaming focus across the whole map and queue every chunk between.
   */
  teleport(x: number, z: number): void;
  /**
   * Snap the camera to a capture pose. Streaming focus stays on the look-at
   * ground point so LOD and water around the subject finish building.
   */
  captureLookAt(camera: THREE.Vector3, target: THREE.Vector3): void;
}
