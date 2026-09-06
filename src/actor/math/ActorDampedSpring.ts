const MAX_DELTA_SECONDS = 0.1;
const MIN_FREQUENCY_HZ = 0.01;
const TWO_PI = Math.PI * 2;

/**
 * A semi-implicit damped spring, safe against any delta the frame throws at it.
 *
 * This lives in the shared actor layer rather than beside the player because
 * every family's secondary motion wants the same integrator: a cape swings, a
 * tail swings, an ear flicks. The maths carries no anatomy, so it belongs where
 * both `src/character` and `src/creatures` can reach it.
 */
export class ActorDampedSpring {
  private velocity = 0;

  constructor(private value = 0) {
    this.value = finiteOrDefault(value, 0);
  }

  update(
    target: number,
    deltaSeconds: number,
    frequency: number,
    damping = 1,
  ): number {
    const delta = Math.min(
      Math.max(finiteOrDefault(deltaSeconds, 0), 0),
      MAX_DELTA_SECONDS,
    );
    const resolvedTarget = finiteOrDefault(target, this.value);
    const resolvedFrequency = Math.max(
      finiteOrDefault(frequency, MIN_FREQUENCY_HZ),
      MIN_FREQUENCY_HZ,
    );
    const resolvedDamping = Math.max(finiteOrDefault(damping, 1), 0);
    const angularFrequency = resolvedFrequency * TWO_PI;
    const dampingTerm = 1 + 2 * delta * resolvedDamping * angularFrequency;
    const frequencySquared = angularFrequency * angularFrequency;
    const velocityTerm = delta * frequencySquared;
    const positionTerm = delta * velocityTerm;
    const inverseDeterminant = 1 / (dampingTerm + positionTerm);
    const nextValue =
      (dampingTerm * this.value +
        delta * this.velocity +
        positionTerm * resolvedTarget) *
      inverseDeterminant;
    const nextVelocity =
      (this.velocity + velocityTerm * (resolvedTarget - this.value)) *
      inverseDeterminant;

    if (!Number.isFinite(nextValue) || !Number.isFinite(nextVelocity)) {
      this.value = resolvedTarget;
      this.velocity = 0;
      return this.value;
    }

    this.value = nextValue;
    this.velocity = nextVelocity;
    return this.value;
  }

  addImpulse(velocity: number): void {
    if (Number.isFinite(velocity)) {
      this.velocity += velocity;
    }
  }

  reset(value = 0): void {
    this.value = finiteOrDefault(value, 0);
    this.velocity = 0;
  }
}

function finiteOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
