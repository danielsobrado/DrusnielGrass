import * as THREE from "three";
import {
  SnowflowCharacter,
  type SnowflowCharacterPose,
} from "../character/SnowflowCharacter";
import {
  grassInteractionField,
  type GrassInteractionPose,
} from "../grass/interaction/GrassInteractionField";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { DenseWorldSpawn } from "../world/DenseSpawnLocator";
import type { TerrainField } from "../world/TerrainField";
import { WorldTerrainContactSampler } from "../world/WorldTerrainContactSampler";
import type { WorldConfig } from "../world/WorldConfig";
import { ThirdPersonInput } from "./ThirdPersonInput";
import type { WorldController, WorldControlMode } from "./WorldController";

const CAMERA_COLLISION_SAMPLES = [0.35, 0.6, 0.85] as const;
const CAMERA_POSITION_RATE = 12;
const MAX_FRAME_DELTA_SECONDS = 0.1;
const MIN_MOVEMENT_SPEED = 0.05;
const UP = new THREE.Vector3(0, 1, 0);

export class ThirdPersonController implements WorldController {
  private readonly input: ThirdPersonInput;
  private readonly character: SnowflowCharacter;
  private readonly position = new THREE.Vector3();
  private readonly spawnPosition = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly animationVelocity = new THREE.Vector3();
  private readonly desiredVelocity = new THREE.Vector3();
  private readonly velocityDelta = new THREE.Vector3();
  private readonly moveInput = new THREE.Vector2();
  private readonly lookInput = new THREE.Vector2();
  private readonly cameraForward = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  private readonly movement = new THREE.Vector3();
  private readonly rollDirection = new THREE.Vector3(0, 0, 1);
  private readonly groundNormal = new THREE.Vector3(0, 1, 0);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly desiredCameraPosition = new THREE.Vector3();
  private readonly cameraSample = new THREE.Vector3();
  private readonly grassPose: GrassInteractionPose = {
    position: this.position,
    velocity: this.velocity,
    facing: 0,
    distanceTravelled: 0,
    grounded: true,
  };
  private readonly characterPose: SnowflowCharacterPose = {
    position: this.position,
    velocity: this.animationVelocity,
    groundNormal: this.groundNormal,
    facing: 0,
    speed: 0,
    runSpeed: 1,
    acceleration: 0,
    distanceTravelled: 0,
    grounded: true,
    verticalVelocity: 0,
    jumpStarted: false,
    landed: false,
    landingImpact: 0,
  };
  private facing = 0;
  private spawnFacing = 0;
  private cameraYaw = 0;
  private cameraElevation: number;
  private cameraDistance: number;
  private captureLocked = false;
  private readonly captureCamera = new THREE.Vector3();
  private readonly captureTarget = new THREE.Vector3();
  private speed = 0;
  private previousSpeed = 0;
  private acceleration = 0;
  private distanceTravelled = 0;
  private verticalVelocity = 0;
  private grounded = true;
  private timeSinceGrounded = 0;
  private coyoteJumpAvailable = true;
  private jumpBufferRemaining = 0;
  private jumpHoldRemaining = 0;
  private jumpStarted = false;
  private landed = false;
  private landingImpact = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    private readonly field: TerrainField,
    private readonly config: WorldConfig,
    profile: RuntimeProfile,
    spawn: DenseWorldSpawn,
  ) {
    grassInteractionField.configure({
      strength: config.grassInteractionStrength,
      speedForFullEffect: config.grassInteractionSpeedForFullEffect,
      landingPulseRadius: config.grassLandingPulseRadius,
      landingPulseStrength: config.grassLandingPulseStrength,
      landingPulseDecay: config.grassLandingPulseDecay,
      footContactRadius: config.grassFootContactRadius,
      footContactStrength: config.grassFootContactStrength,
      bodyContactRadius: config.grassBodyContactRadius,
      bodyContactStrength: config.grassBodyContactStrength,
    });
    this.cameraElevation = THREE.MathUtils.degToRad(
      config.characterCameraElevationDegrees,
    );
    this.cameraDistance = config.characterCameraDistance;
    this.spawnPosition.set(
      spawn.position.x,
      field.sampleHeight(spawn.position.x, spawn.position.z),
      spawn.position.z,
    );
    this.spawnFacing = normalizeAngle(spawn.yaw + Math.PI);

    const character = new SnowflowCharacter(
      scene,
      config.characterScale,
      config.characterLandingRecoveryTime,
      new WorldTerrainContactSampler(field),
    );
    let input: ThirdPersonInput;
    try {
      input = new ThirdPersonInput(canvas, profile, config);
    } catch (error) {
      character.dispose();
      grassInteractionField.deactivate();
      throw error;
    }

    this.character = character;
    this.input = input;
    try {
      this.reset();
    } catch (error) {
      disposeControllerResource("Third-person input", () => input.dispose());
      disposeControllerResource("Third-person character", () => character.dispose());
      grassInteractionField.deactivate();
      throw error;
    }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      MAX_FRAME_DELTA_SECONDS,
    );
    if (this.input.consumeReset()) {
      this.captureLocked = false;
      this.reset();
      return;
    }

    if (this.captureLocked) {
      this.jumpStarted = false;
      this.landed = false;
      this.landingImpact = 0;
      this.grassPose.facing = this.facing;
      this.grassPose.distanceTravelled = this.distanceTravelled;
      this.grassPose.grounded = this.grounded;
      grassInteractionField.update(delta, this.grassPose);
      this.camera.position.copy(this.captureCamera);
      this.camera.lookAt(this.captureTarget);
      this.cameraForward.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      this.character.setLookDirection(
        this.cameraForward.x,
        this.cameraForward.y,
        this.cameraForward.z,
      );
      this.animationVelocity.set(0, this.verticalVelocity, 0);
      this.character.update(delta, this.syncCharacterPose());
      return;
    }

    this.jumpStarted = false;
    this.landed = false;
    this.landingImpact = 0;
    if (this.input.consumeJump() && !this.character.isRolling()) {
      this.jumpBufferRemaining = this.config.characterJumpBufferTime;
    }

    this.updateCameraInput();
    this.updateMovement(delta);
    this.grassPose.facing = this.facing;
    this.grassPose.distanceTravelled = this.distanceTravelled;
    this.grassPose.grounded = this.grounded;
    grassInteractionField.update(delta, this.grassPose);
    this.updateCamera(delta, false);
    this.character.setLookDirection(
      this.cameraForward.x,
      this.cameraForward.y,
      this.cameraForward.z,
    );
    this.animationVelocity.set(
      this.velocity.x,
      this.verticalVelocity,
      this.velocity.z,
    );
    this.character.update(delta, this.syncCharacterPose());
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    grassInteractionField.deactivate();
    disposeControllerResource("Third-person input", () => this.input.dispose());
    disposeControllerResource("Third-person character", () => this.character.dispose());
  }

  getSpeed(): number {
    return this.speed;
  }

  getInputDiagnostics(): string {
    return `${this.character.getState()} · ${this.input.getDiagnostics()}`;
  }

  getCharacter(): SnowflowCharacter {
    return this.character;
  }

  getStreamingPosition(): THREE.Vector3 {
    return this.position;
  }

  getMode(): WorldControlMode {
    return "third-person";
  }

  teleport(x: number, z: number): void {
    if (this.disposed) {
      return;
    }
    this.captureLocked = false;
    // Keep the player's current framing: a teleport is a move, not a restart,
    // and snapping their zoom back to the default would undo deliberate setup.
    const halfWorld = this.config.worldSize * 0.5 - 2;
    this.placeAt(
      THREE.MathUtils.clamp(x, -halfWorld, halfWorld),
      THREE.MathUtils.clamp(z, -halfWorld, halfWorld),
      this.facing,
    );
  }

  captureLookAt(camera: THREE.Vector3, target: THREE.Vector3): void {
    if (this.disposed) {
      return;
    }
    const halfWorld = this.config.worldSize * 0.5 - 2;
    const focusX = THREE.MathUtils.clamp(target.x, -halfWorld, halfWorld);
    const focusZ = THREE.MathUtils.clamp(target.z, -halfWorld, halfWorld);
    const lookX = focusX - camera.x;
    const lookZ = focusZ - camera.z;
    const facing =
      Math.hypot(lookX, lookZ) > 1e-4
        ? Math.atan2(lookX, lookZ)
        : this.facing;
    this.captureLocked = true;
    this.captureCamera.copy(camera);
    this.captureTarget.set(focusX, target.y, focusZ);
    this.placeAt(focusX, focusZ, facing);
    this.camera.position.copy(this.captureCamera);
    this.camera.lookAt(this.captureTarget);
  }

  private reset(): void {
    if (this.disposed) {
      return;
    }
    this.captureLocked = false;
    this.cameraElevation = THREE.MathUtils.degToRad(
      this.config.characterCameraElevationDegrees,
    );
    this.cameraDistance = this.config.characterCameraDistance;
    this.placeAt(
      this.spawnPosition.x,
      this.spawnPosition.z,
      this.spawnFacing,
    );
  }

  /** Settle the character onto the surface at (x, z) facing a given heading. */
  private placeAt(x: number, z: number, facing: number): void {
    this.position.set(x, this.field.sampleHeight(x, z), z);
    this.velocity.set(0, 0, 0);
    this.animationVelocity.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.rollDirection.set(Math.sin(facing), 0, Math.cos(facing));
    this.facing = facing;
    this.cameraYaw = facing;
    this.speed = 0;
    this.previousSpeed = 0;
    this.acceleration = 0;
    this.distanceTravelled = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.timeSinceGrounded = 0;
    this.coyoteJumpAvailable = true;
    this.jumpBufferRemaining = 0;
    this.jumpHoldRemaining = 0;
    this.jumpStarted = false;
    this.landed = false;
    this.landingImpact = 0;
    this.field.sampleNormal(
      this.position.x,
      this.position.z,
      this.groundNormal,
    );
    grassInteractionField.reset(this.position);
    this.updateCamera(1, true);
    this.character.reset(this.syncCharacterPose());
  }

  private syncCharacterPose(): SnowflowCharacterPose {
    this.characterPose.facing = this.facing;
    this.characterPose.speed = this.speed;
    this.characterPose.runSpeed = this.config.characterRunSpeed;
    this.characterPose.acceleration = this.acceleration;
    this.characterPose.distanceTravelled = this.distanceTravelled;
    this.characterPose.grounded = this.grounded;
    this.characterPose.verticalVelocity = this.verticalVelocity;
    this.characterPose.jumpStarted = this.jumpStarted;
    this.characterPose.landed = this.landed;
    this.characterPose.landingImpact = this.landingImpact;
    this.characterPose.crouched = this.input.isCrouched();
    return this.characterPose;
  }

  private updateCameraInput(): void {
    this.input.consumeLookDelta(this.lookInput);
    this.cameraYaw = normalizeAngle(this.cameraYaw + this.lookInput.x);
    this.cameraElevation = THREE.MathUtils.clamp(
      this.cameraElevation + this.lookInput.y,
      THREE.MathUtils.degToRad(this.config.characterCameraMinElevationDegrees),
      THREE.MathUtils.degToRad(this.config.characterCameraMaxElevationDegrees),
    );
    this.cameraDistance = THREE.MathUtils.clamp(
      this.cameraDistance + this.input.consumeZoomDelta(),
      this.config.characterCameraMinDistance,
      this.config.characterCameraMaxDistance,
    );
  }

  private updateMovement(deltaSeconds: number): void {
    this.input.getMovement(this.moveInput);
    this.cameraForward.set(
      Math.sin(this.cameraYaw),
      0,
      Math.cos(this.cameraYaw),
    );
    this.cameraRight.set(
      Math.cos(this.cameraYaw),
      0,
      -Math.sin(this.cameraYaw),
    );
    this.movement
      .set(0, 0, 0)
      .addScaledVector(this.cameraForward, this.moveInput.y)
      .addScaledVector(this.cameraRight, this.moveInput.x);

    const hasMovement = this.movement.lengthSq() > 1e-6;
    if (hasMovement) {
      this.movement.normalize();
    }

    let rolling = this.character.isRolling();
    if (this.input.consumeRoll() && this.grounded && !rolling) {
      if (hasMovement) {
        this.rollDirection.copy(this.movement);
      } else {
        this.rollDirection.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      }
      this.rollDirection.normalize();
      this.jumpBufferRemaining = 0;
      this.jumpHoldRemaining = 0;
      this.character.triggerRoll();
      rolling = true;
      this.velocity
        .copy(this.rollDirection)
        .multiplyScalar(
          this.config.characterRunSpeed *
            this.config.characterRollInitialSpeedMultiplier,
        );
    }

    const isCrouched = this.input.isCrouched();
    if (rolling) {
      this.desiredVelocity
        .copy(this.rollDirection)
        .multiplyScalar(
          this.config.characterRunSpeed *
            this.config.characterRollSustainSpeedMultiplier,
        );
    } else {
      const targetSpeed = hasMovement
        ? isCrouched
          ? this.config.characterWalkSpeed * 0.6
          : this.input.isSprinting()
            ? this.config.characterRunSpeed
            : this.config.characterWalkSpeed
        : 0;
      this.desiredVelocity.copy(this.movement).multiplyScalar(targetSpeed);
    }
    this.velocityDelta.subVectors(this.desiredVelocity, this.velocity);
    this.velocityDelta.y = 0;
    const controlScale = this.grounded ? 1 : this.config.characterAirControl;
    const maxVelocityChange =
      (rolling || hasMovement
        ? this.config.characterAcceleration
        : this.config.characterDeceleration) *
      controlScale *
      deltaSeconds;
    if (this.velocityDelta.lengthSq() > maxVelocityChange * maxVelocityChange) {
      this.velocityDelta.setLength(maxVelocityChange);
    }
    this.velocity.add(this.velocityDelta);
    this.velocity.y = 0;

    const previousX = this.position.x;
    const previousZ = this.position.z;
    const halfWorld = this.config.worldSize * 0.5 - 2;
    const nextX = this.position.x + this.velocity.x * deltaSeconds;
    const nextZ = this.position.z + this.velocity.z * deltaSeconds;
    const clampedX = THREE.MathUtils.clamp(nextX, -halfWorld, halfWorld);
    const clampedZ = THREE.MathUtils.clamp(nextZ, -halfWorld, halfWorld);
    if (clampedX !== nextX) {
      this.velocity.x = 0;
      this.desiredVelocity.x = 0;
    }
    if (clampedZ !== nextZ) {
      this.velocity.z = 0;
      this.desiredVelocity.z = 0;
    }
    this.position.x = clampedX;
    this.position.z = clampedZ;

    this.updateJump(deltaSeconds);

    this.previousSpeed = this.speed;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.acceleration =
      deltaSeconds > Number.EPSILON
        ? (this.speed - this.previousSpeed) / deltaSeconds
        : 0;

    if (this.speed > MIN_MOVEMENT_SPEED) {
      const desiredFacing = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = angleDamp(
        this.facing,
        desiredFacing,
        this.config.characterTurnRate,
        deltaSeconds,
      );
      if (this.lookInput.lengthSq() < 1e-8) {
        this.cameraYaw = angleDamp(
          this.cameraYaw,
          this.facing,
          this.config.characterCameraFollowRate,
          deltaSeconds,
        );
      }
    }

    this.distanceTravelled += Math.hypot(
      this.position.x - previousX,
      this.position.z - previousZ,
    );
  }

  private updateJump(deltaSeconds: number): void {
    const wasGrounded = this.grounded;
    if (wasGrounded) {
      this.timeSinceGrounded = 0;
      this.coyoteJumpAvailable = true;
    } else {
      this.timeSinceGrounded += deltaSeconds;
    }
    this.jumpBufferRemaining = Math.max(
      0,
      this.jumpBufferRemaining - deltaSeconds,
    );

    const canUseCoyoteTime =
      wasGrounded ||
      (this.coyoteJumpAvailable &&
        this.timeSinceGrounded <= this.config.characterCoyoteTime);
    if (this.jumpBufferRemaining > 0 && canUseCoyoteTime) {
      this.verticalVelocity = this.config.characterJumpSpeed;
      this.jumpHoldRemaining = this.config.characterJumpHoldTime;
      this.jumpBufferRemaining = 0;
      this.coyoteJumpAvailable = false;
      this.grounded = false;
      this.jumpStarted = true;
    }

    const groundHeight = this.field.sampleHeight(
      this.position.x,
      this.position.z,
    );
    if (this.grounded && !this.jumpStarted) {
      this.position.y = groundHeight;
      this.verticalVelocity = 0;
      this.field.sampleNormal(
        this.position.x,
        this.position.z,
        this.groundNormal,
      );
      return;
    }

    const holdingJump =
      this.input.isJumpHeld() &&
      this.verticalVelocity > 0 &&
      this.jumpHoldRemaining > 0;
    const gravityScale =
      this.verticalVelocity < 0
        ? this.config.characterFallGravityMultiplier
        : holdingJump
          ? this.config.characterJumpHoldGravityScale
          : 1;
    this.jumpHoldRemaining = holdingJump
      ? Math.max(0, this.jumpHoldRemaining - deltaSeconds)
      : 0;
    this.verticalVelocity -=
      this.config.characterGravity * gravityScale * deltaSeconds;
    this.position.y += this.verticalVelocity * deltaSeconds;

    if (this.position.y <= groundHeight && this.verticalVelocity <= 0) {
      const impactSpeed = -this.verticalVelocity;
      this.position.y = groundHeight;
      this.verticalVelocity = 0;
      this.grounded = true;
      this.timeSinceGrounded = 0;
      this.field.sampleNormal(
        this.position.x,
        this.position.z,
        this.groundNormal,
      );
      if (!wasGrounded && !this.jumpStarted) {
        this.landed = true;
        this.landingImpact = THREE.MathUtils.clamp(
          impactSpeed / this.config.characterLandingImpactForFullEffect,
          0,
          1,
        );
        grassInteractionField.pulse(this.position, this.landingImpact);
      }
    } else {
      this.grounded = false;
      this.groundNormal.copy(UP);
    }
  }

  private updateCamera(deltaSeconds: number, immediate: boolean): void {
    const crouchOffset = this.input.isCrouched() ? -0.32 : 0;
    this.cameraTarget.set(
      this.position.x,
      this.position.y + this.config.characterCameraLookHeight + crouchOffset,
      this.position.z,
    );
    const horizontalDistance =
      this.cameraDistance * Math.cos(this.cameraElevation);
    this.cameraForward.set(
      Math.sin(this.cameraYaw),
      0,
      Math.cos(this.cameraYaw),
    );
    this.desiredCameraPosition
      .copy(this.cameraTarget)
      .addScaledVector(this.cameraForward, -horizontalDistance);
    this.desiredCameraPosition.y +=
      this.cameraDistance * Math.sin(this.cameraElevation);
    this.resolveCameraTerrainCollision();

    if (immediate) {
      this.camera.position.copy(this.desiredCameraPosition);
    } else {
      const blend = 1 - Math.exp(-CAMERA_POSITION_RATE * deltaSeconds);
      this.camera.position.lerp(this.desiredCameraPosition, blend);
      const cameraGround = this.field.sampleHeight(
        this.camera.position.x,
        this.camera.position.z,
      );
      this.camera.position.y = Math.max(
        this.camera.position.y,
        cameraGround + this.config.characterCameraGroundClearance,
      );
    }
    this.camera.lookAt(this.cameraTarget);
  }

  private resolveCameraTerrainCollision(): void {
    const clearance = this.config.characterCameraGroundClearance;
    for (const amount of CAMERA_COLLISION_SAMPLES) {
      this.cameraSample.lerpVectors(
        this.cameraTarget,
        this.desiredCameraPosition,
        amount,
      );
      const terrainHeight = this.field.sampleHeight(
        this.cameraSample.x,
        this.cameraSample.z,
      );
      const lineHeight = THREE.MathUtils.lerp(
        this.cameraTarget.y,
        this.desiredCameraPosition.y,
        amount,
      );
      const penetration = terrainHeight + clearance - lineHeight;
      if (penetration > 0) {
        this.desiredCameraPosition.y += penetration / amount;
      }
    }
    const cameraGround = this.field.sampleHeight(
      this.desiredCameraPosition.x,
      this.desiredCameraPosition.z,
    );
    this.desiredCameraPosition.y = Math.max(
      this.desiredCameraPosition.y,
      cameraGround + clearance,
    );
  }
}

function disposeControllerResource(label: string, dispose: () => void): void {
  try {
    dispose();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}

function angleDamp(
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
): number {
  const difference = normalizeAngle(target - current);
  return normalizeAngle(
    current + difference * (1 - Math.exp(-rate * deltaSeconds)),
  );
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
