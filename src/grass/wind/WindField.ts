const MAX_FRAME_DELTA_SECONDS = 0.1;

export class WindField {
  private elapsedSeconds = 0;

  update(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return this.elapsedSeconds;
    }

    this.elapsedSeconds += Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS);
    return this.elapsedSeconds;
  }
}
