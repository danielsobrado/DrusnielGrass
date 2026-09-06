import * as THREE from "three";

const JOYSTICK_DEAD_ZONE = 0.1;
const JOYSTICK_VISUAL_TRAVEL_PIXELS = 34;

export class MobileJoystick {
  private readonly element: HTMLDivElement;
  private readonly movement = new THREE.Vector2();
  private pointerId?: number;
  private disposed = false;

  constructor(private readonly onInput: () => void) {
    this.element = document.createElement("div");
    this.element.className = "mobile-move-controls";
    this.element.setAttribute("role", "group");
    this.element.setAttribute("aria-label", "Movement joystick");
    this.element.innerHTML = '<div class="mobile-move-knob" aria-hidden="true"></div>';
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerRelease);
    this.element.addEventListener("pointercancel", this.handlePointerRelease);
    this.element.addEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture,
    );
    document.body.appendChild(this.element);
  }

  getMovement(target: THREE.Vector2): THREE.Vector2 {
    return target.copy(this.movement);
  }

  isActive(): boolean {
    return this.pointerId !== undefined;
  }

  reset(): void {
    this.pointerId = undefined;
    this.movement.set(0, 0);
    this.element.dataset.active = "false";
    this.element.style.setProperty("--joystick-x", "0px");
    this.element.style.setProperty("--joystick-y", "0px");
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    this.element.removeEventListener("pointermove", this.handlePointerMove);
    this.element.removeEventListener("pointerup", this.handlePointerRelease);
    this.element.removeEventListener("pointercancel", this.handlePointerRelease);
    this.element.removeEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture,
    );
    this.reset();
    this.element.remove();
  }

  private update(event: PointerEvent): void {
    const bounds = this.element.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.5);
    const deltaX = event.clientX - (bounds.left + bounds.width * 0.5);
    const deltaY = event.clientY - (bounds.top + bounds.height * 0.5);
    const distance = Math.hypot(deltaX, deltaY);
    const directionX = distance > 1e-6 ? deltaX / distance : 0;
    const directionY = distance > 1e-6 ? deltaY / distance : 0;
    const normalizedDistance = THREE.MathUtils.clamp(distance / radius, 0, 1);
    const magnitude = normalizedDistance <= JOYSTICK_DEAD_ZONE
      ? 0
      : (normalizedDistance - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);

    this.movement.set(directionX * magnitude, -directionY * magnitude);
    const visualDistance = Math.min(1, normalizedDistance) *
      JOYSTICK_VISUAL_TRAVEL_PIXELS;
    this.element.style.setProperty(
      "--joystick-x",
      `${(directionX * visualDistance).toFixed(2)}px`,
    );
    this.element.style.setProperty(
      "--joystick-y",
      `${(directionY * visualDistance).toFixed(2)}px`,
    );
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== undefined && this.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.element.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    this.element.dataset.active = "true";
    this.update(event);
    this.onInput();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.update(event);
    this.onInput();
  };

  private readonly handlePointerRelease = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      if (this.element.hasPointerCapture(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId);
      }
    } finally {
      this.reset();
      this.onInput();
    }
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }
    this.reset();
    this.onInput();
  };
}
