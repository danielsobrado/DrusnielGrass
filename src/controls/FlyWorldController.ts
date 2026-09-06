import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { FlySpawn } from "./FlyController";
import { FlyController } from "./FlyController";
import type { WorldController, WorldControlMode } from "./WorldController";
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
