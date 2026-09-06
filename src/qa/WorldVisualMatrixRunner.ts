import type { WorldVisualMatrixContext } from "../app/WorldVisualMatrixContext";
import { GrassQaMetrics } from "./GrassQaMetrics";
import type { GrassFrameStats, GrassRendererStats } from "./GrassQaTypes";
import { findWorldVisualLocations } from "./WorldVisualMatrixLocations";
import {
  createWorldVisualPoses,
  type WorldVisualPose,
} from "./WorldVisualMatrixPoses";

export interface WorldVisualCapture {
  name: string;
  camera: {
    position: readonly [number, number, number];
    target: readonly [number, number, number];
  };
  hud: string;
  compact: boolean;
  frameStats: GrassFrameStats;
  renderer: GrassRendererStats;
}

export interface WorldVisualReport {
  version: 1;
  generatedAt: string;
  userAgent: string;
  compact: boolean;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  locations: Record<string, { x: number; y: number; z: number }>;
  captures: WorldVisualCapture[];
}

interface WindowWithVisualQa extends Window {
  __FLUFFY_WORLD_VISUAL_QA__?: WorldVisualQaApi;
}

export interface WorldVisualQaApi {
  status: "loading" | "ready" | "posed" | "done" | "error";
  compact: boolean;
  poses: string[];
  index: number;
  current: string | null;
  hud: string;
  error?: string;
  report?: WorldVisualReport;
  apply: (index: number) => Promise<WorldVisualCapture>;
}

const DEFAULT_WARMUP_SECONDS = 4;
const DEFAULT_SAMPLE_SECONDS = 0.7;

export class WorldVisualMatrixRunner {
  private readonly metrics = new GrassQaMetrics();
  private readonly abortController = new AbortController();
  private poses: WorldVisualPose[] = [];
  private readonly captures: WorldVisualCapture[] = [];
  private locationsRecord: WorldVisualReport["locations"] = {};
  private api?: WorldVisualQaApi;
  private applying = false;
  private disposed = false;

  constructor(private readonly context: WorldVisualMatrixContext) {}

  async start(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const api = this.publish({
      status: "loading",
      compact: this.context.profile.compact,
      poses: [],
      index: -1,
      current: null,
      hud: "",
      apply: (index) => this.apply(index),
    });

    try {
      await this.waitUntilReady();
      this.assertActive();
      const origin = this.context.controls.getStreamingPosition();
      const locations = await findWorldVisualLocations(
        this.context.field,
        origin.x,
        origin.z,
      );
      this.assertActive();
      this.locationsRecord = Object.fromEntries(
        Object.entries(locations).map(([key, point]) => [
          key,
          { x: point.x, y: point.y, z: point.z },
        ]),
      );
      this.poses = createWorldVisualPoses(locations);
      api.status = "ready";
      api.poses = this.poses.map((pose) => pose.name);
      console.info(
        `[Drusniel World] Visual matrix ready · ${this.poses.length} poses · compact ${this.context.profile.compact}`,
        this.locationsRecord,
      );
    } catch (error) {
      if (this.disposed || isAbortError(error)) {
        return;
      }
      api.status = "error";
      api.error = error instanceof Error ? error.message : String(error);
      console.error("[Drusniel World] Visual matrix failed to start.", error);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.abortController.abort();
    const windowWithQa = window as WindowWithVisualQa;
    if (windowWithQa.__FLUFFY_WORLD_VISUAL_QA__ === this.api) {
      delete windowWithQa.__FLUFFY_WORLD_VISUAL_QA__;
    }
    this.api = undefined;
  }

  private async apply(index: number): Promise<WorldVisualCapture> {
    this.assertActive();
    if (this.applying) {
      throw new Error("A visual matrix capture is already in progress.");
    }
    const pose = this.poses[index];
    if (!pose) {
      throw new Error(`Visual matrix pose ${index} does not exist.`);
    }

    this.applying = true;
    try {
      return await this.capture(pose, index);
    } finally {
      this.applying = false;
    }
  }

  private async capture(
    pose: WorldVisualPose,
    index: number,
  ): Promise<WorldVisualCapture> {
    const api = this.ensureApi();
    this.context.controls.captureLookAt(pose.camera, pose.target);
    await this.metrics.sampleFrames(
      DEFAULT_WARMUP_SECONDS,
      false,
      this.abortController.signal,
    );
    const frames = await this.metrics.sampleFrames(
      DEFAULT_SAMPLE_SECONDS,
      true,
      this.abortController.signal,
    );
    this.assertActive();
    const capture: WorldVisualCapture = {
      name: pose.name,
      camera: {
        position: [pose.camera.x, pose.camera.y, pose.camera.z],
        target: [pose.target.x, pose.target.y, pose.target.z],
      },
      hud: document.querySelector("#world-stats")?.textContent ?? "",
      compact: this.context.profile.compact,
      frameStats: this.metrics.summarizeFrames(frames),
      renderer: this.metrics.readRendererStats(this.context.renderer),
    };
    this.captures[index] = capture;
    api.status = index + 1 >= this.poses.length ? "done" : "posed";
    api.index = index;
    api.current = pose.name;
    api.hud = capture.hud;
    api.report = this.buildReport();
    return capture;
  }

  private buildReport(): WorldVisualReport {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      compact: this.context.profile.compact,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      locations: this.locationsRecord,
      captures: this.captures.filter(Boolean),
    };
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = performance.now() + 120_000;
    while (!this.context.isReady()) {
      this.assertActive();
      if (performance.now() > deadline) {
        throw new Error("Timed out waiting for grass initialization.");
      }
      await this.metrics.sampleFrames(
        0.25,
        false,
        this.abortController.signal,
      );
    }
    await this.metrics.sampleFrames(
      2.5,
      false,
      this.abortController.signal,
    );
  }

  private publish(api: WorldVisualQaApi): WorldVisualQaApi {
    this.api = api;
    (window as WindowWithVisualQa).__FLUFFY_WORLD_VISUAL_QA__ = api;
    return api;
  }

  private ensureApi(): WorldVisualQaApi {
    this.assertActive();
    const api = (window as WindowWithVisualQa).__FLUFFY_WORLD_VISUAL_QA__;
    if (!api || api !== this.api) {
      throw new Error("Visual matrix API was not published.");
    }
    return api;
  }

  private assertActive(): void {
    if (this.disposed || this.abortController.signal.aborted) {
      throw new DOMException("Visual matrix runner was disposed.", "AbortError");
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
