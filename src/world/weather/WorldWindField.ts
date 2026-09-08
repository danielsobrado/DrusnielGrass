import { sampleWorldWind, WORLD_WIND_DEFAULTS, type WorldWindConfig, type WorldWindSample } from "./WorldWindMath";

const MAX_FRAME_DELTA_SECONDS = 0.1;

/**
 * The wind's phase, advanced once per frame, and the shared state it reads.
 *
 * The clock is an *integrated phase*, not elapsed time multiplied by a speed.
 * That distinction is the whole reason this class exists: with
 * `elapsed * speed`, changing the speed retroactively rewrites where the wind
 * has been, and the entire field jumps — a gust front that was crossing the
 * meadow teleports. Integrating `delta * speed` means a speed change only
 * affects how fast the phase advances from now on, which is what a person
 * moving a slider expects.
 *
 * Setting speed to zero freezes the dynamic phase without touching anything
 * else, so grass keeps its static rest bend and simply stops moving.
 */
export class WorldWindField {
  private phaseSeconds = 0;
  private simulationSpeed = 1;
  private directionDegrees = 0;
  private noiseScale = 1;
  private intensity = 1;

  constructor(private readonly config: WorldWindConfig = WORLD_WIND_DEFAULTS) {}

  /**
   * Advances the phase and returns it.
   *
   * A non-finite or negative delta advances nothing rather than poisoning the
   * phase: one bad frame must not make the wind permanently NaN. The clamp is
   * the same policy the world's frame delta uses, so a long stall does not
   * teleport the field either.
   */
  update(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return this.phaseSeconds;
    }
    this.phaseSeconds += Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS)
      * this.simulationSpeed;
    return this.phaseSeconds;
  }

  /** Seconds of integrated phase. This is what both CPU and GPU sample with. */
  getPhaseSeconds(): number {
    return this.phaseSeconds;
  }

  /**
   * Sets how fast the phase advances from now on.
   *
   * Deliberately does not touch the accumulated phase: that is what keeps a
   * speed change seamless, and what makes `A -> B -> A` return the field to
   * exactly where it would have been had the detour not happened.
   */
  setSimulationSpeed(speed: number): void {
    if (Number.isFinite(speed) && speed >= 0) {
      this.simulationSpeed = speed;
    }
  }

  getSimulationSpeed(): number {
    return this.simulationSpeed;
  }

  setDirectionDegrees(degrees: number): void {
    if (Number.isFinite(degrees)) {
      this.directionDegrees = degrees;
    }
  }

  getDirectionDegrees(): number {
    return this.directionDegrees;
  }

  /** Spatial frequency multiplier; larger cells at lower values. */
  setNoiseScale(scale: number): void {
    if (Number.isFinite(scale) && scale > 0) {
      this.noiseScale = Math.max(0.01, scale);
    }
  }

  getNoiseScale(): number {
    return this.noiseScale;
  }

  /**
   * Overall gain, applied to the field rather than compounded into it.
   *
   * A preset sets this from its own value every time, so switching presets
   * A -> B -> A recovers A's field numerically instead of drifting by a factor
   * per switch.
   */
  setIntensity(intensity: number): void {
    if (Number.isFinite(intensity) && intensity >= 0) {
      this.intensity = intensity;
    }
  }

  getIntensity(): number {
    return this.intensity;
  }

  /** Evaluates the field on the CPU at a world point, using the live state. */
  sample(x: number, z: number): WorldWindSample {
    return sampleWorldWind({
      x, z,
      time: this.phaseSeconds,
      directionDegrees: this.directionDegrees,
      intensity: this.intensity,
      noiseScale: this.noiseScale,
      config: this.config,
    });
  }
}
