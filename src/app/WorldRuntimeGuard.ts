import {
  WORLD_CONTEXT_LOST_ERROR,
  WORLD_ERROR_MESSAGE_MAX_LENGTH,
} from "./WorldAppTuning";

const FATAL_FRAME_PREFIX = "Drusniel World stopped after an unexpected frame failure.";

export class WorldRuntimeGuard {
  private runtimeError?: string;
  private runtimeErrorBeforeContextLoss?: string;
  private rendererFaulted = false;
  private fatalErrorElement?: HTMLPreElement;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onResize: () => void,
    private readonly onRendererEnabledChange: (enabled: boolean) => void,
  ) {
    try {
      window.addEventListener("resize", this.handleResize);
      window.addEventListener("error", this.handleWindowError);
      window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
      this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    } catch (error) {
      this.unbindEvents();
      throw error;
    }
  }

  get error(): string | undefined {
    return this.runtimeError;
  }

  formatError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .replace(/\s+/g, " ")
      .slice(0, WORLD_ERROR_MESSAGE_MAX_LENGTH);
  }

  recordSubsystemFailure(subsystem: string, error: unknown): void {
    if (subsystem === "renderer") {
      this.rendererFaulted = true;
    }
    const message = `${subsystem}: ${this.formatError(error)}`;
    if (subsystem === "frame") {
      this.publishFatalFrameError(message);
    }
    if (this.runtimeError === message) {
      return;
    }
    this.runtimeError = message;
    console.error(`[Drusniel World] ${subsystem} frame failure.`, error);
  }

  recordWatchdogRestart(stalledForMs: number): void {
    this.runtimeError = `watchdog: restarted after ${Math.round(stalledForMs)} ms`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unbindEvents();
    this.fatalErrorElement?.remove();
    this.fatalErrorElement = undefined;
  }

  private publishFatalFrameError(message: string): void {
    if (this.disposed) {
      return;
    }
    let output = this.fatalErrorElement;
    if (!output) {
      output = document.createElement("pre");
      output.className = "startup-error";
      output.setAttribute("role", "alert");
      document.body.appendChild(output);
      this.fatalErrorElement = output;
    }
    output.textContent = `${FATAL_FRAME_PREFIX}\nReload the page to restart.\n\n${message}`;
  }

  private unbindEvents(): void {
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("error", this.handleWindowError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
  }

  private readonly handleResize = (): void => {
    if (!this.disposed) {
      this.onResize();
    }
  };

  private readonly handleWindowError = (event: ErrorEvent): void => {
    if (!this.disposed) {
      this.runtimeError = `window: ${this.formatError(event.error ?? event.message)}`;
    }
  };

  private readonly handleUnhandledRejection = (
    event: PromiseRejectionEvent,
  ): void => {
    if (!this.disposed) {
      this.runtimeError = `promise: ${this.formatError(event.reason)}`;
    }
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed) {
      return;
    }
    this.runtimeErrorBeforeContextLoss = this.runtimeError;
    this.runtimeError = WORLD_CONTEXT_LOST_ERROR;
    this.onRendererEnabledChange(false);
  };

  private readonly handleContextRestored = (): void => {
    if (this.disposed) {
      return;
    }
    if (!this.rendererFaulted) {
      this.onRendererEnabledChange(true);
    }
    if (this.runtimeError === WORLD_CONTEXT_LOST_ERROR) {
      this.runtimeError = this.runtimeErrorBeforeContextLoss;
    }
    this.runtimeErrorBeforeContextLoss = undefined;
  };
}
