import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { WorldConfig } from "../world/WorldConfig";
import {
  exitPointerLockSafely,
  isEditableInputTarget,
  requestPointerLockSafely,
} from "./InputTarget";

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface FlySpawn {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const MAX_TOUCH_DISTANCE = 70;
const MAX_FRAME_DELTA_SECONDS = 0.1;
const POINTER_LOOK_SENSITIVITY = 0.004;
const MOUSE_LOOK_SENSITIVITY = 0.0022;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PIXELS_PER_SPEED_DOUBLING = 720;

export class FlyController {
  private readonly keys = new Set<string>();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly movement = new THREE.Vector3();
  private readonly touchMovement = new THREE.Vector2();
  private readonly spawnPosition = new THREE.Vector3();
  private readonly usesPointerEvents = typeof window.PointerEvent !== "undefined";
  private yaw = 0;
  private pitch = -0.28;
  private spawnYaw = 0;
  private spawnPitch = -0.28;
  private speed: number;
  private verticalTouch = 0;
  private movePointer?: PointerState;
  private lookPointer?: PointerState;
  private mobileControls?: HTMLElement;
  private inputEventCount = 0;
  private lastInputType = "idle";
  private previousTouchAction = "";
  private disposed = false;
  private captureLocked = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly config: WorldConfig,
    private readonly profile: RuntimeProfile,
    spawn: FlySpawn,
  ) {
    this.speed = config.flySpeed;
    this.spawnPosition.copy(spawn.position);
    this.spawnYaw = spawn.yaw;
    this.spawnPitch = spawn.pitch;
    this.previousTouchAction = canvas.style.touchAction;
    this.reset();

    try {
      this.bindEvents();
      if (profile.compact) {
        this.createMobileControls();
      }
    } catch (error) {
      this.unbindEvents();
      this.clearTransientInput();
      this.mobileControls?.remove();
      this.mobileControls = undefined;
      this.canvas.style.touchAction = this.previousTouchAction;
      throw error;
    }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    if (this.captureLocked) {
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      return;
    }
    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      MAX_FRAME_DELTA_SECONDS,
    );
    const keyboardForward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const keyboardRight =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const keyboardVertical =
      (this.keys.has("KeyE") || this.keys.has("Space") ? 1 : 0) -
      (this.keys.has("KeyQ") || this.keys.has("ControlLeft") ? 1 : 0);
    const touchMovement = this.resolveTouchMovement();
    const forwardAmount = THREE.MathUtils.clamp(
      keyboardForward + touchMovement.y,
      -1,
      1,
    );
    const rightAmount = THREE.MathUtils.clamp(
      keyboardRight + touchMovement.x,
      -1,
      1,
    );
    const verticalAmount = THREE.MathUtils.clamp(
      keyboardVertical + this.verticalTouch,
      -1,
      1,
    );

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < Number.EPSILON) {
      this.forward.set(0, 0, -1);
    }
    this.forward.normalize();
    this.right.crossVectors(this.forward, UP).normalize();
    this.movement
      .set(0, 0, 0)
      .addScaledVector(this.forward, forwardAmount)
      .addScaledVector(this.right, rightAmount)
      .addScaledVector(UP, verticalAmount);

    if (this.movement.lengthSq() > 1) {
      this.movement.normalize();
    }

    const boost =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")
        ? this.config.flyBoostMultiplier
        : 1;
    this.camera.position.addScaledVector(
      this.movement,
      this.speed * boost * delta,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  reset(): void {
    if (this.disposed) {
      return;
    }
    this.camera.position.copy(this.spawnPosition);
    this.yaw = this.spawnYaw;
    this.pitch = this.spawnPitch;
    this.captureLocked = false;
    this.clearTransientInput();
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  lookAtWorld(position: THREE.Vector3, target: THREE.Vector3): void {
    if (this.disposed) {
      return;
    }
    this.camera.position.copy(position);
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const dz = target.z - position.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = THREE.MathUtils.clamp(
      Math.atan2(dy, Math.hypot(dx, dz)),
      -Math.PI * 0.48,
      Math.PI * 0.48,
    );
    this.captureLocked = true;
    this.clearTransientInput();
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  isCaptureLocked(): boolean {
    return this.captureLocked;
  }

  getSpeed(): number {
    return this.speed;
  }

  getInputDiagnostics(): string {
    const movement = this.resolveTouchMovement();
    const active = [
      this.movePointer ? `move ${movement.x.toFixed(2)}/${movement.y.toFixed(2)}` : "",
      this.lookPointer ? "look" : "",
      this.verticalTouch !== 0 ? `vertical ${this.verticalTouch}` : "",
    ].filter(Boolean);
    return `${active.join(" + ") || this.lastInputType} · events ${this.inputEventCount}`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unbindEvents();
    if (document.pointerLockElement === this.canvas) {
      exitPointerLockSafely();
    }

    this.clearTransientInput();
    this.mobileControls?.remove();
    this.mobileControls = undefined;
    this.canvas.style.touchAction = this.previousTouchAction;
  }

  private bindEvents(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);

    if (this.usesPointerEvents) {
      this.canvas.addEventListener("pointerdown", this.handlePointerDown, {
        passive: false,
      });
      window.addEventListener("pointermove", this.handlePointerMove, {
        passive: false,
      });
      window.addEventListener("pointerup", this.handlePointerUp, {
        passive: false,
      });
      window.addEventListener("pointercancel", this.handlePointerUp, {
        passive: false,
      });
    } else {
      this.canvas.addEventListener("touchstart", this.handleTouchStart, {
        passive: false,
      });
      window.addEventListener("touchmove", this.handleTouchMove, {
        passive: false,
      });
      window.addEventListener("touchend", this.handleTouchEnd, {
        passive: false,
      });
      window.addEventListener("touchcancel", this.handleTouchEnd, {
        passive: false,
      });
    }

    this.canvas.style.touchAction = "none";
  }

  private unbindEvents(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    window.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.canvas.removeEventListener("click", this.handleCanvasClick);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);

    if (this.usesPointerEvents) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      window.removeEventListener("pointermove", this.handlePointerMove);
      window.removeEventListener("pointerup", this.handlePointerUp);
      window.removeEventListener("pointercancel", this.handlePointerUp);
    } else {
      this.canvas.removeEventListener("touchstart", this.handleTouchStart);
      window.removeEventListener("touchmove", this.handleTouchMove);
      window.removeEventListener("touchend", this.handleTouchEnd);
      window.removeEventListener("touchcancel", this.handleTouchEnd);
    }
  }

  private createMobileControls(): void {
    const controls = document.createElement("div");
    controls.className = "mobile-flight-controls";
    controls.innerHTML = `
      <button type="button" data-flight-reset aria-label="Return to dense field">⌂</button>
      <button type="button" data-flight-vertical="1" aria-label="Fly up">▲</button>
      <button type="button" data-flight-vertical="-1" aria-label="Fly down">▼</button>
    `;

    const resetButton = controls.querySelector<HTMLButtonElement>(
      "[data-flight-reset]",
    );
    resetButton?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.inputEventCount += 1;
      this.lastInputType = "reset";
      this.reset();
    });

    for (const button of controls.querySelectorAll<HTMLButtonElement>(
      "[data-flight-vertical]",
    )) {
      const value = Number(button.dataset.flightVertical);
      const activate = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (!button.hasPointerCapture(event.pointerId)) {
          button.setPointerCapture(event.pointerId);
        }
        this.inputEventCount += 1;
        this.lastInputType = "button";
        this.verticalTouch = value;
      };
      const deactivate = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (this.verticalTouch === value) {
          this.verticalTouch = 0;
        }
      };
      button.addEventListener("pointerdown", activate);
      button.addEventListener("pointerup", deactivate);
      button.addEventListener("pointercancel", deactivate);
      button.addEventListener("lostpointercapture", () => {
        if (this.verticalTouch === value) {
          this.verticalTouch = 0;
        }
      });
    }
    document.body.appendChild(controls);
    this.mobileControls = controls;
  }

  private resolveTouchMovement(): THREE.Vector2 {
    if (!this.movePointer) {
      return this.touchMovement.set(0, 0);
    }
    const x = THREE.MathUtils.clamp(
      (this.movePointer.currentX - this.movePointer.startX) /
        MAX_TOUCH_DISTANCE,
      -1,
      1,
    );
    const y = THREE.MathUtils.clamp(
      (this.movePointer.startY - this.movePointer.currentY) /
        MAX_TOUCH_DISTANCE,
      -1,
      1,
    );
    return this.touchMovement.set(x, y);
  }

  private assignPointer(
    pointerId: number,
    clientX: number,
    clientY: number,
    inputType: string,
  ): void {
    const state: PointerState = {
      pointerId,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
    };
    if (clientX < window.innerWidth * 0.5 && !this.movePointer) {
      this.movePointer = state;
      this.lastInputType = `${inputType}-move`;
    } else if (!this.lookPointer) {
      this.lookPointer = state;
      this.lastInputType = `${inputType}-look`;
    }
    this.inputEventCount += 1;
  }

  private updatePointer(
    pointerId: number,
    clientX: number,
    clientY: number,
  ): boolean {
    if (this.movePointer?.pointerId === pointerId) {
      this.movePointer.currentX = clientX;
      this.movePointer.currentY = clientY;
      this.inputEventCount += 1;
      return true;
    }
    if (this.lookPointer?.pointerId === pointerId) {
      const deltaX = clientX - this.lookPointer.currentX;
      const deltaY = clientY - this.lookPointer.currentY;
      this.lookPointer.currentX = clientX;
      this.lookPointer.currentY = clientY;
      this.rotate(deltaX, deltaY, POINTER_LOOK_SENSITIVITY);
      this.inputEventCount += 1;
      return true;
    }
    return false;
  }

  private releasePointer(pointerId: number): boolean {
    let released = false;
    if (this.movePointer?.pointerId === pointerId) {
      this.movePointer = undefined;
      released = true;
    }
    if (this.lookPointer?.pointerId === pointerId) {
      this.lookPointer = undefined;
      released = true;
    }
    if (released) {
      this.inputEventCount += 1;
      this.lastInputType = "idle";
    }
    return released;
  }

  private clearTransientInput(): void {
    this.verticalTouch = 0;
    this.movePointer = undefined;
    this.lookPointer = undefined;
    this.keys.clear();
    this.lastInputType = "idle";
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableInputTarget(event.target)) {
      return;
    }
    this.keys.add(event.code);
    this.lastInputType = "keyboard";
    this.inputEventCount += 1;
    if (event.code === "KeyF" && !event.repeat) {
      this.reset();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleWindowBlur = (): void => {
    this.clearTransientInput();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearTransientInput();
    }
  };

  private readonly handleCanvasClick = (): void => {
    if (!this.profile.compact && document.pointerLockElement !== this.canvas) {
      requestPointerLockSafely(this.canvas);
    }
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) {
      return;
    }
    this.rotate(event.movementX, event.movementY, MOUSE_LOOK_SENSITIVITY);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    const deltaPixels = normalizeWheelDeltaPixels(event);
    if (!Number.isFinite(deltaPixels) || deltaPixels === 0) {
      return;
    }
    event.preventDefault();
    const factor = 2 ** (-deltaPixels / WHEEL_PIXELS_PER_SPEED_DOUBLING);
    this.speed = THREE.MathUtils.clamp(
      this.speed * factor,
      this.config.flyMinSpeed,
      this.config.flyMaxSpeed,
    );
    this.inputEventCount += 1;
    this.lastInputType = "wheel";
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.profile.compact && event.pointerType === "mouse") {
      return;
    }
    event.preventDefault();
    this.assignPointer(
      event.pointerId,
      event.clientX,
      event.clientY,
      event.pointerType || "pointer",
    );
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.updatePointer(event.pointerId, event.clientX, event.clientY)) {
      event.preventDefault();
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.releasePointer(event.pointerId)) {
      event.preventDefault();
    }
  };

  private readonly handleTouchStart = (event: TouchEvent): void => {
    event.preventDefault();
    for (const touch of Array.from(event.changedTouches)) {
      this.assignPointer(touch.identifier, touch.clientX, touch.clientY, "touch");
    }
  };

  private readonly handleTouchMove = (event: TouchEvent): void => {
    let handled = false;
    for (const touch of Array.from(event.changedTouches)) {
      handled =
        this.updatePointer(touch.identifier, touch.clientX, touch.clientY) ||
        handled;
    }
    if (handled) {
      event.preventDefault();
    }
  };

  private readonly handleTouchEnd = (event: TouchEvent): void => {
    let handled = false;
    for (const touch of Array.from(event.changedTouches)) {
      handled = this.releasePointer(touch.identifier) || handled;
    }
    if (handled) {
      event.preventDefault();
    }
  };

  private rotate(deltaX: number, deltaY: number, sensitivity: number): void {
    this.yaw -= deltaX * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - deltaY * sensitivity,
      -Math.PI * 0.48,
      Math.PI * 0.48,
    );
  }
}

function normalizeWheelDeltaPixels(event: WheelEvent): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_PIXELS;
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * Math.max(1, window.innerHeight);
  }
  return event.deltaY;
}
