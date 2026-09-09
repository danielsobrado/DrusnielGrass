import type * as THREE from "three";

export type WorldControlMode = "fly" | "third-person";
export type ControllerRecoveryState =
  | { mode: "fly"; position: [number, number, number]; yaw: number; pitch: number; speed: number }
  | { mode: "third-person"; x: number; z: number; facing: number; yaw: number; elevation: number; distance: number };

/**
 * What a temporary view mode borrows and must give back.
 *
 * Opaque to the caller: only the controller that produced it can interpret it,
 * which is what stops a tour from constructing a pose the controller cannot
 * settle into.
 */
export interface WorldControllerViewState {
  readonly mode: WorldControlMode;
}

export interface WorldController {
  /**
   * Enables or disables the player's control.
   *
   * Implementations must clear held input, not merely stop reading it: a key
   * held when control is taken away is released where nobody is listening.
   */
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Saves the framing a temporary mode has to restore. */
  saveViewState(): WorldControllerViewState;
  restoreViewState(state: WorldControllerViewState): void;
  /**
   * The controlled character's feet, for footsteps, interaction and collision.
   *
   * Fly controls have no character; they report the camera's ground point, so
   * a caller gets a meaningful position rather than having to branch on mode.
   */
  getGameplayPose(target: THREE.Vector3): { position: THREE.Vector3; facing: number };
  /** Hides the actor for a mode that frames the world without them in it. */
  setCharacterVisible(visible: boolean): void;
  /**
   * Whether the actor is on screen right now.
   *
   * Read before a temporary mode takes the camera, so exiting restores what was
   * there rather than forcing the actor visible on the way out.
   */
  isCharacterVisible(): boolean;
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
