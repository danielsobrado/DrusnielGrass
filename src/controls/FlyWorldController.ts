import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { FlySpawn } from "./FlyController";
import { FlyController } from "./FlyController";
import type {
  ControllerRecoveryState, WorldController, WorldControlMode, WorldControllerViewState,
} from "./WorldController";
import type { TerrainField } from "../world/TerrainField";
import type { WorldConfig } from "../world/WorldConfig";

/** Altitude a teleport leaves the camera at above the destination surface. */
const TELEPORT_ALTITUDE = 24;

export class FlyWorldController
  extends FlyController
  implements WorldController
{
  private readonly streamingPosition: THREE.Vector3;
  private worldDisposed = false;

  constructor(
    private readonly worldCamera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    private readonly worldConfig: WorldConfig,
    profile: RuntimeProfile,
    spawn: FlySpawn,
    private readonly field: TerrainField,
  ) {
    super(worldCamera, canvas, worldConfig, profile, spawn);
    this.streamingPosition = worldCamera.position;
  }

  setEnabled(enabled: boolean): void {
    this.setInputEnabled(enabled);
  }

  isEnabled(): boolean {
    return this.isInputEnabled();
  }

  /**
   * Flight has no actor and no orbit framing, so its saved view is its
   * recovery state: position, yaw, pitch and speed put the camera back exactly.
   */
  saveViewState(): WorldControllerViewState {
    return this.captureRecoveryState();
  }

  restoreViewState(state: WorldControllerViewState): void {
    if (state.mode !== "fly") {
      return;
    }
    this.restoreRecoveryState(state as ControllerRecoveryState);
  }

  /**
   * Flight has no character, so the gameplay pose is the ground beneath the
   * camera. A caller placing a footstep or an interaction gets a real point on
   * the terrain rather than having to branch on the control mode.
   */
  getGameplayPose(target: THREE.Vector3): { position: THREE.Vector3; facing: number } {
    const camera = this.worldCamera.position;
    target.set(camera.x, this.field.sampleHeight(camera.x, camera.z), camera.z);
    return { position: target, facing: this.worldCamera.rotation.y };
  }

  /** No character to hide; accepted so callers need no mode branch. */
  setCharacterVisible(): void {}

  /** There is no actor in flight, so there is never one on screen to restore. */
  isCharacterVisible(): boolean {
    return false;
  }

  /**
   * Free flight has no collision, so the world edge and the ground are enforced
   * here rather than by the composition root. The controller owns where it may
   * fly; the app only owns when it runs.
   */
  update(deltaSeconds: number): void {
    if (this.worldDisposed) {
      return;
    }
    super.update(deltaSeconds);
    if (this.isCaptureLocked()) {
      return;
    }
    const halfWorld = this.worldConfig.worldSize * 0.5 - 2;
    const position = this.worldCamera.position;
    position.x = THREE.MathUtils.clamp(position.x, -halfWorld, halfWorld);
    position.z = THREE.MathUtils.clamp(position.z, -halfWorld, halfWorld);
    position.y = THREE.MathUtils.clamp(
      position.y,
      this.field.sampleHeight(position.x, position.z) +
        this.worldConfig.spawnEyeHeight,
      this.worldConfig.mountainHeight + 520,
    );
  }

  dispose(): void {
    if (this.worldDisposed) {
      return;
    }
    this.worldDisposed = true;
    super.dispose();
  }

  captureLookAt(camera: THREE.Vector3, target: THREE.Vector3): void {
    if (this.worldDisposed) {
      return;
    }
    this.lookAtWorld(camera, target);
  }

  teleport(x: number, z: number): void {
    if (this.worldDisposed) {
      return;
    }
    const halfWorld = this.worldConfig.worldSize * 0.5 - 2;
    const clampedX = THREE.MathUtils.clamp(x, -halfWorld, halfWorld);
    const clampedZ = THREE.MathUtils.clamp(z, -halfWorld, halfWorld);
    // Arrive above the surface rather than at the player's previous altitude:
    // the destination may be a peak that the old height would have put us
    // inside, and the clamp in update() would then shove the camera anyway.
    this.worldCamera.position.set(
      clampedX,
      this.field.sampleHeight(clampedX, clampedZ) + TELEPORT_ALTITUDE,
      clampedZ,
    );
  }

  getStreamingPosition(): THREE.Vector3 {
    return this.streamingPosition;
  }

  getMode(): WorldControlMode {
    return "fly";
  }
}
