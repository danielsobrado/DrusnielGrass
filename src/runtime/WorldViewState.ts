import type * as THREE from "three";

/**
 * The modes the world can be looked at in.
 *
 * `play` and `fly` are the two ways a person drives the world directly. `tour`,
 * `paint` and `qa` are temporary: they take over the camera, and they must give
 * it back exactly as they found it.
 */
export type WorldViewMode = "play" | "fly" | "tour" | "paint" | "qa";

/** Modes in which the player is driving; the rest have taken the camera away. */
const PLAYER_DRIVEN: ReadonlySet<WorldViewMode> = new Set<WorldViewMode>(["play", "fly"]);

/**
 * Everything a temporary mode has to put back.
 *
 * Capturing the camera's transform alone is not enough: the next third-person
 * update recomputes the camera from the controller's own yaw, pitch and
 * distance and would overwrite whatever was restored. The controller state is
 * what actually determines where the camera ends up, so it is what is saved.
 */
export interface WorldViewSnapshot {
  readonly mode: WorldViewMode;
  readonly controller: unknown;
  readonly characterVisible: boolean;
  readonly inputEnabled: boolean;
}

/**
 * The gameplay pose, which is not the same thing as where the camera is.
 *
 * Footsteps, interaction and collision belong to the character's feet. Terrain
 * streaming belongs to whatever the active view is looking at. Grass LOD
 * belongs to the camera. A tour that moved the player to follow the camera
 * would drag the whole streaming set across the map; a tour that streamed
 * around the player would fly through unbuilt terrain.
 */
export interface WorldGameplayPose {
  readonly position: THREE.Vector3;
  readonly facing: number;
}

/** What `WorldViewState` needs from whichever controller is active. */
export interface WorldViewController {
  setEnabled(enabled: boolean): void;
  saveViewState(): unknown;
  restoreViewState(state: unknown): void;
  getGameplayPose(target: THREE.Vector3): WorldGameplayPose;
  setCharacterVisible(visible: boolean): void;
  getStreamingPosition(): THREE.Vector3;
}

/**
 * Owns the active view mode and the state a temporary mode borrowed.
 *
 * Deliberately not a general mode stack: exactly one temporary mode may hold
 * the camera at a time, because two of them restoring the same controller in
 * an unknown order is a bug with no good outcome. Entering a second temporary
 * mode is refused rather than queued.
 */
export class WorldViewState {
  private mode: WorldViewMode;
  private readonly baseMode: WorldViewMode;
  private snapshot?: WorldViewSnapshot;
  private modalOverlay = false;

  constructor(private readonly controller: WorldViewController, baseMode: WorldViewMode) {
    this.baseMode = baseMode;
    this.mode = baseMode;
  }

  getMode(): WorldViewMode {
    return this.mode;
  }

  /** True while the player is driving and no modal overlay is blocking them. */
  isPlayerDriven(): boolean {
    return PLAYER_DRIVEN.has(this.mode) && !this.modalOverlay;
  }

  /**
   * A settings or map overlay blocks movement without changing the view mode.
   *
   * The camera stays where it is and the underlying mode is untouched, so
   * closing the overlay resumes play rather than restoring a saved pose.
   */
  setModalOverlay(open: boolean): void {
    if (this.modalOverlay === open) {
      return;
    }
    this.modalOverlay = open;
    this.controller.setEnabled(this.isPlayerDriven());
  }

  /**
   * Takes the camera for a temporary mode, saving what has to come back.
   *
   * Returns false when a temporary mode already holds it, so the caller can
   * decline visibly instead of nesting.
   */
  enterTemporaryMode(mode: Exclude<WorldViewMode, "play" | "fly">): boolean {
    if (this.snapshot || !PLAYER_DRIVEN.has(this.mode)) {
      return false;
    }
    this.snapshot = {
      mode: this.mode,
      controller: this.controller.saveViewState(),
      characterVisible: true,
      inputEnabled: this.isPlayerDriven(),
    };
    this.mode = mode;
    this.controller.setEnabled(false);
    return true;
  }

  /**
   * Gives the camera back exactly as it was found.
   *
   * The controller restores its own framing, which resettles the camera against
   * terrain, and input is re-enabled last so a key pressed during the handover
   * cannot be read against a half-restored pose.
   */
  exitTemporaryMode(): void {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return;
    }
    this.snapshot = undefined;
    this.mode = snapshot.mode;
    this.controller.restoreViewState(snapshot.controller);
    this.controller.setCharacterVisible(snapshot.characterVisible);
    this.controller.setEnabled(this.isPlayerDriven());
  }

  /** Where the world should stream around, for the mode that is active. */
  getStreamingFocus(): THREE.Vector3 {
    return this.controller.getStreamingPosition();
  }

  getGameplayPose(target: THREE.Vector3): WorldGameplayPose {
    return this.controller.getGameplayPose(target);
  }

  /** Restores play control; used when a temporary owner is torn down mid-mode. */
  dispose(): void {
    if (this.snapshot) {
      this.exitTemporaryMode();
    }
    this.mode = this.baseMode;
  }
}
