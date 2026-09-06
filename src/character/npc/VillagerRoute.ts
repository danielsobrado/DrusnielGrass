/** Where the villager is walking and how fast. */
export interface VillagerSteering {
  targetX: number;
  targetZ: number;
  desiredSpeed: number;
}

export interface VillagerRouteOptions {
  readonly centerX: number;
  readonly centerZ: number;
  readonly radius: number;
  readonly walkSpeed: number;
  readonly seed: number;
}

const WAYPOINT_COUNT = 4;
const PAUSE_SECONDS = [2, 6] as const;
const ARRIVE_RADIUS = 0.6;

/**
 * A person walking a route, not wandering.
 *
 * This is deliberately unlike the deer. An animal picking its way between
 * patches of grass looks right precisely because it is aimless; a person doing
 * the same looks lost. A villager goes somewhere, stands there a moment, and
 * goes somewhere else — a handful of fixed points walked in order, which reads
 * as errands and costs nothing.
 */
export class VillagerRoute {
  private readonly waypointsX: number[] = [];
  private readonly waypointsZ: number[] = [];
  private index = 0;
  private pauseRemaining = 0;
  private random: number;

  constructor(private readonly options: VillagerRouteOptions) {
    this.random = (options.seed >>> 0) || 1;
    for (let step = 0; step < WAYPOINT_COUNT; step += 1) {
      // Spread around the circle with jitter, so the route is a loop rather
      // than a line the villager retraces.
      const angle =
        ((step + this.unitPick() * 0.6) / WAYPOINT_COUNT) * Math.PI * 2;
      const reach = options.radius * (0.45 + this.unitPick() * 0.55);
      this.waypointsX.push(options.centerX + Math.cos(angle) * reach);
      this.waypointsZ.push(options.centerZ + Math.sin(angle) * reach);
    }
  }

  update(
    deltaSeconds: number,
    positionX: number,
    positionZ: number,
    steering: VillagerSteering,
  ): void {
    const targetX = this.waypointsX[this.index];
    const targetZ = this.waypointsZ[this.index];
    const distance = Math.hypot(targetX - positionX, targetZ - positionZ);

    if (this.pauseRemaining > 0) {
      this.pauseRemaining -= deltaSeconds;
      steering.targetX = positionX;
      steering.targetZ = positionZ;
      steering.desiredSpeed = 0;
      return;
    }
    if (distance <= ARRIVE_RADIUS) {
      this.pauseRemaining =
        PAUSE_SECONDS[0] + this.unitPick() * (PAUSE_SECONDS[1] - PAUSE_SECONDS[0]);
      this.index = (this.index + 1) % this.waypointsX.length;
    }

    steering.targetX = targetX;
    steering.targetZ = targetZ;
    steering.desiredSpeed = this.options.walkSpeed;
  }

  reset(): void {
    this.index = 0;
    this.pauseRemaining = 0;
  }

  private unitPick(): number {
    this.random = (this.random * 1664525 + 1013904223) >>> 0;
    return this.random / 4294967296;
  }
}
