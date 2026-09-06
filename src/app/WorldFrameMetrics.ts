import {
  WORLD_FPS_SAMPLE_INTERVAL_SECONDS,
  WORLD_FRAME_TIMING_SAMPLE_INTERVAL_FRAMES,
  WORLD_FRAME_TIMING_SMOOTHING,
} from "./WorldAppTuning";

export type WorldFrameSubsystem =
  | "controls"
  | "terrain"
  | "stones"
  | "grass"
  | "renderer"
  | "hud";

export interface WorldFrameTimings {
  controls: number;
  terrain: number;
  stones: number;
  grass: number;
  renderer: number;
  hud: number;
}

export class WorldFrameMetrics {
  private frameCount = 0;
  private fpsSampleFrames = 0;
  private fpsSampleElapsed = 0;
  private averageFps = 0;
  private sampleTimings = true;
  private readonly timings: WorldFrameTimings = {
    controls: 0,
    terrain: 0,
    stones: 0,
    grass: 0,
    renderer: 0,
    hud: 0,
  };

  beginFrame(deltaSeconds: number): void {
    this.frameCount += 1;
    this.sampleTimings =
      (this.frameCount - 1) % WORLD_FRAME_TIMING_SAMPLE_INTERVAL_FRAMES === 0;
    this.fpsSampleFrames += 1;
    this.fpsSampleElapsed += deltaSeconds;
    if (this.fpsSampleElapsed < WORLD_FPS_SAMPLE_INTERVAL_SECONDS) {
      if (this.averageFps === 0 && this.fpsSampleElapsed > 0) {
        this.averageFps = this.fpsSampleFrames / this.fpsSampleElapsed;
      }
      return;
    }
    this.averageFps = this.fpsSampleFrames / this.fpsSampleElapsed;
    this.fpsSampleFrames = 0;
    this.fpsSampleElapsed = 0;
  }

  measure(
    subsystem: WorldFrameSubsystem,
    callback: (deltaSeconds: number) => void,
    deltaSeconds: number,
  ): void {
    if (!this.sampleTimings) {
      callback(deltaSeconds);
      return;
    }
    const startedAt = performance.now();
    callback(deltaSeconds);
    this.timings[subsystem] +=
      (performance.now() - startedAt - this.timings[subsystem]) *
      WORLD_FRAME_TIMING_SMOOTHING;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getAverageFps(): number {
    return this.averageFps;
  }

  getTimings(): Readonly<WorldFrameTimings> {
    return this.timings;
  }
}
