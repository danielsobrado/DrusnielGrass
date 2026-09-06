export function isEditableInputTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("button, input, select, textarea, [role='button']"))
  );
}

export function requestPointerLockSafely(canvas: HTMLCanvasElement): void {
  try {
    const request: unknown = canvas.requestPointerLock();
    if (request instanceof Promise) {
      void request.catch(() => undefined);
    }
  } catch {
    // Pointer lock is an optional enhancement and may be denied by the browser.
  }
}

export function exitPointerLockSafely(): void {
  try {
    const request: unknown = document.exitPointerLock();
    if (request instanceof Promise) {
      void request.catch(() => undefined);
    }
  } catch {
    // Pointer lock release is best-effort during UI transitions and cleanup.
  }
}
