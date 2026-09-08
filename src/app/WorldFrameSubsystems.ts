import type { WorldFrameMetrics, WorldFrameSubsystem } from "./WorldFrameMetrics";

/**
 * One phase of a frame, with the policy for what happens when it fails.
 *
 * The policy belongs beside the phase rather than in a branch somewhere else:
 * a chain of `else if` over subsystem names has to be updated in two places to
 * add one system, and the failure branch is the half people forget.
 */
export interface WorldFramePhase {
  readonly name: WorldFrameSubsystem;
  readonly run: (deltaSeconds: number) => void;
  /**
   * Releases whatever the phase owned and reports whether it may run again.
   *
   * Returning false retires the phase for the rest of the session, which is the
   * right answer for a system that has already thrown: retrying it every frame
   * would repeat the failure sixty times a second.
   */
  readonly onFailure: (error: unknown) => void;
}

/** Records a phase failure where the runtime guard can present it. */
export interface WorldFrameFailureReporter {
  recordSubsystemFailure(subsystem: string, error: unknown): void;
}

/**
 * Runs the frame's phases in order and retires the ones that fail.
 *
 * Extracted from the composition root because it is a responsibility of its
 * own — which phases exist, in what order they run, and what a failure in each
 * one costs — and because the root has a size budget that exists to stop
 * exactly this kind of orchestration accumulating there.
 */
export class WorldFrameSubsystems {
  private readonly phases: WorldFramePhase[] = [];
  private readonly retired = new Set<WorldFrameSubsystem>();

  constructor(
    private readonly metrics: WorldFrameMetrics,
    private readonly reporter: WorldFrameFailureReporter,
  ) {}

  /** Registration order is frame order; see the phase list in the plan. */
  register(phase: WorldFramePhase): void {
    this.phases.push(phase);
  }

  isActive(name: WorldFrameSubsystem): boolean {
    return !this.retired.has(name);
  }

  /**
   * Advances every phase that has not been retired.
   *
   * A phase that throws is measured, reported, released through its own policy
   * and then skipped for the rest of the session. The phases after it still
   * run: losing the stones must not also lose the renderer.
   */
  run(
    deltaSeconds: number,
    afterPhase?: (name: WorldFrameSubsystem) => void,
  ): void {
    for (const phase of this.phases) {
      if (!this.retired.has(phase.name)) {
        try {
          this.metrics.measure(phase.name, phase.run, deltaSeconds);
        } catch (error) {
          this.retired.add(phase.name);
          this.reporter.recordSubsystemFailure(phase.name, error);
          try {
            phase.onFailure(error);
          } catch (cleanupError) {
            console.warn(
              `[Drusniel World] ${phase.name} failure cleanup failed.`,
              cleanupError,
            );
          }
        }
      }
      // Runs whether or not the phase was retired, so an observer that watches
      // for a phase's position in the frame keeps its documented slot.
      afterPhase?.(phase.name);
    }
  }
}
