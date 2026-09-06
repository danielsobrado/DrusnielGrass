import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { hudSettingsStore } from "../runtime/HudSettingsStore";
import type { WorldConfig } from "../world/WorldConfig";
import {
  isEditableInputTarget,
  requestPointerLockSafely,
} from "./InputTarget";
import { MobileJoystick } from "./MobileJoystick";

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const MAX_TOUCH_DISTANCE = 70;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const WHEEL_LINE_PIXELS = 16;

export class ThirdPersonInput {
  private readonly keys = new Set<string>();
  private readonly touchMovement = new THREE.Vector2();
  private readonly joystickMovement = new THREE.Vector2();
  private readonly lookDelta = new THREE.Vector2();
  private movePointer?: PointerState;
  private lookPointer?: PointerState;
  private mobileControls?: HTMLElement;
  private mobileJoystick?: MobileJoystick;
  private mobileJumpButton?: HTMLButtonElement;
  private mobileRunButton?: HTMLButtonElement;
  private mobileSprint = false;
  private mobileJumpHeld = false;
  private jumpRequested = false;
  private resetRequested = false;
  private crouchToggled = false;
  private rollRequested = false;
  private zoomDelta = 0;
  private inputEventCount = 0;
  private lastInputType = "idle";
  private previousTouchAction = "";
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly profile: RuntimeProfile,
    private readonly config: WorldConfig,
  ) {
    this.previousTouchAction = canvas.style.touchAction;
    try {
      this.bindEvents();
      if (profile.compact) {
        this.createMobileControls();
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  getMovement(target: THREE.Vector2): THREE.Vector2 {
    const touch = this.resolveTouchMovement();
    const joystick = this.mobileJoystick?.getMovement(this.joystickMovement) ??
      this.joystickMovement.set(0, 0);
    const keyboardX =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const keyboardY =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const rawHorizontalMovement = keyboardX + touch.x + joystick.x;
    const horizontalMovement = hudSettingsStore.getInvertHorizontalMovement()
      ? rawHorizontalMovement
      : -rawHorizontalMovement;
    target.set(
      THREE.MathUtils.clamp(horizontalMovement, -1, 1),
      THREE.MathUtils.clamp(keyboardY + touch.y + joystick.y, -1, 1),
    );
    if (target.lengthSq() > 1) {
      target.normalize();
    }
    return target;
  }

  consumeLookDelta(target: THREE.Vector2): THREE.Vector2 {
    target.copy(this.lookDelta);
    this.lookDelta.set(0, 0);
    return target;
  }

  consumeZoomDelta(): number {
    const delta = this.zoomDelta;
    this.zoomDelta = 0;
    return delta;
  }

  consumeJump(): boolean {
    const requested = this.jumpRequested;
    this.jumpRequested = false;
    return requested;
  }

  consumeRoll(): boolean {
    const requested = this.rollRequested;
    this.rollRequested = false;
    return requested;
  }

  isCrouched(): boolean {
    return this.crouchToggled;
  }

  setCrouched(crouched: boolean): void {
    this.crouchToggled = crouched;
  }

  consumeReset(): boolean {
    const requested = this.resetRequested;
    this.resetRequested = false;
    return requested;
  }

  isJumpHeld(): boolean {
    return this.mobileJumpHeld || this.keys.has("Space");
  }

  isSprinting(): boolean {
    return (
      this.mobileSprint ||
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight")
    );
  }

  getDiagnostics(): string {
    const movement = this.resolveTouchMovement();
    const joystick = this.mobileJoystick?.getMovement(this.joystickMovement) ??
      this.joystickMovement.set(0, 0);
    const active = [
      this.movePointer
        ? `move ${movement.x.toFixed(2)}/${movement.y.toFixed(2)}`
        : "",
      this.mobileJoystick?.isActive()
        ? `stick ${joystick.x.toFixed(2)}/${joystick.y.toFixed(2)}`
        : "",
      this.lookPointer ? "look" : "",
      this.isSprinting() ? "run" : "",
      this.isJumpHeld() ? "jump" : "",
    ].filter(Boolean);
    return `${active.join(" + ") || this.lastInputType} · events ${this.inputEventCount}`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.canvas.removeEventListener("click", this.handleCanvasClick);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    if (document.pointerLockElement === this.canvas) {
      try {
        document.exitPointerLock();
      } catch (error) {
        console.warn("[Drusniel World] Pointer lock cleanup failed.", error);
      }
    }
    this.clearTransientInput();
    try {
      this.mobileJoystick?.dispose();
    } catch (error) {
      console.warn("[Drusniel World] Mobile joystick cleanup failed.", error);
    }
    this.mobileJoystick = undefined;
    this.mobileControls?.remove();
    this.mobileControls = undefined;
    this.mobileJumpButton = undefined;
    this.mobileRunButton = undefined;
    this.canvas.style.touchAction = this.previousTouchAction;
  }

  private bindEvents(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("pointermove", this.handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", this.handlePointerUp, {
      passive: false,
    });
    window.addEventListener("pointercancel", this.handlePointerUp, {
      passive: false,
    });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown, {
      passive: false,
    });
    this.canvas.style.touchAction = "none";
  }

  private createMobileControls(): void {
    this.mobileJoystick = new MobileJoystick(() => {
      this.inputEventCount += 1;
      this.lastInputType = "joystick";
    });

    const controls = document.createElement("div");
    controls.className = "mobile-character-controls";
    controls.innerHTML = `
      <button type="button" data-character-reset aria-label="Return to spawn">HOME</button>
      <button type="button" data-character-jump aria-label="Jump" aria-pressed="false">JUMP</button>
      <button type="button" data-character-run aria-label="Hold to run" aria-pressed="false">RUN</button>
    `;

    controls
      .querySelector<HTMLButtonElement>("[data-character-reset]")
      ?.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.inputEventCount += 1;
        this.lastInputType = "reset";
        this.resetRequested = true;
      });

    const jumpButton = controls.querySelector<HTMLButtonElement>(
      "[data-character-jump]",
    );
    this.mobileJumpButton = jumpButton ?? undefined;
    const setJump = (
      active: boolean,
      event: PointerEvent,
      button: HTMLButtonElement,
    ): void => {
      event.preventDefault();
      event.stopPropagation();
      if (active && !button.hasPointerCapture(event.pointerId)) {
        button.setPointerCapture(event.pointerId);
      }
      if (active && !this.mobileJumpHeld) {
        this.jumpRequested = true;
        this.inputEventCount += 1;
        this.lastInputType = "jump";
      }
      this.mobileJumpHeld = active;
      this.setMobileButtonState(button, active);
    };
    if (jumpButton) {
      jumpButton.addEventListener("pointerdown", (event) =>
        setJump(true, event, jumpButton),
      );
      jumpButton.addEventListener("pointerup", (event) =>
        setJump(false, event, jumpButton),
      );
      jumpButton.addEventListener("pointercancel", (event) =>
        setJump(false, event, jumpButton),
      );
      jumpButton.addEventListener("lostpointercapture", () => {
        this.mobileJumpHeld = false;
        this.setMobileButtonState(jumpButton, false);
      });
    }

    const runButton = controls.querySelector<HTMLButtonElement>(
      "[data-character-run]",
    );
    this.mobileRunButton = runButton ?? undefined;
    const setSprint = (
      active: boolean,
      event: PointerEvent,
      button: HTMLButtonElement,
    ): void => {
      event.preventDefault();
      event.stopPropagation();
      if (active && !button.hasPointerCapture(event.pointerId)) {
        button.setPointerCapture(event.pointerId);
      }
      this.mobileSprint = active;
      this.setMobileButtonState(button, active);
      if (active) {
        this.inputEventCount += 1;
        this.lastInputType = "run";
      }
    };
    if (runButton) {
      runButton.addEventListener("pointerdown", (event) =>
        setSprint(true, event, runButton),
      );
      runButton.addEventListener("pointerup", (event) =>
        setSprint(false, event, runButton),
      );
      runButton.addEventListener("pointercancel", (event) =>
        setSprint(false, event, runButton),
      );
      runButton.addEventListener("lostpointercapture", () => {
        this.mobileSprint = false;
        this.setMobileButtonState(runButton, false);
      });
    }

    document.body.appendChild(controls);
    this.mobileControls = controls;
  }

  private setMobileButtonState(
    button: HTMLButtonElement | undefined,
    active: boolean,
  ): void {
    if (!button) {
      return;
    }
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }

  private resolveTouchMovement(): THREE.Vector2 {
    if (!this.movePointer) {
      return this.touchMovement.set(0, 0);
    }
    this.touchMovement.set(
      (this.movePointer.currentX - this.movePointer.startX) / MAX_TOUCH_DISTANCE,
      (this.movePointer.startY - this.movePointer.currentY) / MAX_TOUCH_DISTANCE,
    );
    if (this.touchMovement.lengthSq() > 1) {
      this.touchMovement.normalize();
    }
    return this.touchMovement;
  }

  private assignPointer(event: PointerEvent): void {
    const state: PointerState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    };
    if (this.profile.compact) {
      if (!this.lookPointer) {
        this.lookPointer = state;
        this.lastInputType = `${event.pointerType || "pointer"}-look`;
      }
    } else if (event.clientX < window.innerWidth * 0.5 && !this.movePointer) {
      this.movePointer = state;
      this.lastInputType = `${event.pointerType || "pointer"}-move`;
    } else if (!this.lookPointer) {
      this.lookPointer = state;
      this.lastInputType = `${event.pointerType || "pointer"}-look`;
    }
    this.inputEventCount += 1;
  }

  private updatePointer(event: PointerEvent): boolean {
    if (this.movePointer?.pointerId === event.pointerId) {
      this.movePointer.currentX = event.clientX;
      this.movePointer.currentY = event.clientY;
      this.inputEventCount += 1;
      return true;
    }
    if (this.lookPointer?.pointerId === event.pointerId) {
      const deltaX = event.clientX - this.lookPointer.currentX;
      const deltaY = event.clientY - this.lookPointer.currentY;
      this.lookPointer.currentX = event.clientX;
      this.lookPointer.currentY = event.clientY;
      this.lookDelta.x += deltaX * this.config.characterTouchLookSensitivity;
      this.lookDelta.y -= deltaY * this.config.characterTouchLookSensitivity;
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
    this.movePointer = undefined;
    this.lookPointer = undefined;
    this.mobileJoystick?.reset();
    this.mobileSprint = false;
    this.mobileJumpHeld = false;
    this.setMobileButtonState(this.mobileRunButton, false);
    this.setMobileButtonState(this.mobileJumpButton, false);
    this.jumpRequested = false;
    this.resetRequested = false;
    this.rollRequested = false;
    this.zoomDelta = 0;
    this.lookDelta.set(0, 0);
    this.keys.clear();
    this.lastInputType = "idle";
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableInputTarget(event.target)) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        this.jumpRequested = true;
      }
    }
    this.keys.add(event.code);
    this.lastInputType = event.code === "Space" ? "jump" : "keyboard";
    this.inputEventCount += 1;
    if (event.code === "KeyF" && !event.repeat) {
      this.resetRequested = true;
    }
    if (event.code === "KeyC" && !event.repeat) {
      this.crouchToggled = !this.crouchToggled;
    }
    if (event.code === "KeyR" && !event.repeat) {
      this.rollRequested = true;
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
    this.lookDelta.x +=
      event.movementX * this.config.characterMouseLookSensitivity;
    this.lookDelta.y -=
      event.movementY * this.config.characterMouseLookSensitivity;
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    const deltaPixels = normalizeWheelDeltaPixels(event);
    if (!Number.isFinite(deltaPixels) || deltaPixels === 0) {
      return;
    }
    event.preventDefault();
    this.zoomDelta += deltaPixels * this.config.characterZoomSensitivity;
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
    this.assignPointer(event);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.updatePointer(event)) {
      event.preventDefault();
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.releasePointer(event.pointerId)) {
      event.preventDefault();
    }
  };
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
