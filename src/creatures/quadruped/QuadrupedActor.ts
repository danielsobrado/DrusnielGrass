import * as THREE from "three";
import { createActorAnimationInput } from "../../actor/animation/ActorAnimationInput";
import type { ActorAnimationProfile } from "../../actor/animation/ActorAnimationProfile";
import { ActorAnimationRuntime } from "../../actor/animation/ActorAnimationRuntime";
import { ActorGait } from "../../actor/animation/ActorGait";
import { ActorContactIk } from "../../actor/ik/ActorContactIk";
import type { ActorTerrainContactSampler } from "../../actor/ik/ActorTerrainContact";
import { requireActorChain } from "../../actor/rig/ActorRigDefinition";
import { ActorRigInstance } from "../../actor/rig/ActorRigInstance";
import type { QuadrupedBodyBuilder, QuadrupedBodyHandle } from "./QuadrupedBodyContract";
import {
  QUADRUPED_STANCE_DUTY_FACTOR,
  QUADRUPED_STRIDE_LENGTH_METERS,
} from "./QuadrupedGaitProfile";
import { QuadrupedHeadAim } from "./QuadrupedHeadAim";
import { QuadrupedLocomotionLayer } from "./QuadrupedLocomotionLayer";
import {
  createQuadrupedMotionFacts,
  type QuadrupedMotionFacts,
} from "./QuadrupedMotionFacts";
import { QuadrupedSecondaryMotion } from "./QuadrupedSecondaryMotion";
import {
  QUADRUPED_CONTACT_CHAINS,
  QUADRUPED_PAW_DROP,
  quadrupedRig,
} from "./QuadrupedRigDefinition";

const DEGREES = Math.PI / 180;
const QUADRUPED_MAX_BODY_DROP = 0.16;
const QUADRUPED_MAX_PAW_ALIGN = 22 * DEGREES;
const QUADRUPED_CONTACT_SMOOTHING_RATE = 10;

/** Where the animal wants to be and how fast it wants to get there. */
export interface QuadrupedSteering {
  readonly targetX: number;
  readonly targetZ: number;
  readonly desiredSpeed: number;
}

/** How quickly the body can turn and change pace, in radians and m/s². */
const TURN_RATE = 2.4;
const ACCELERATION = 3.2;
const ARRIVE_RADIUS = 0.35;
/** Slows into the target instead of stopping on the spot. */
const SLOWING_RADIUS = 1.6;

/**
 * A four-legged actor.
 *
 * It uses a different rig definition, a different locomotion layer, and four
 * contact effectors instead of two, and it reaches the screen through exactly
 * the same pose buffers, blender, gait, two-bone IK, and contact IK the player
 * does. Nothing it needs is humanoid, and nothing humanoid is faked for it.
 *
 * It knows nothing about why it is going anywhere. Steering arrives as a target
 * and a speed; turning toward it, accelerating, arriving and stopping are
 * physical facts the actor owns, and everything downstream — gait phase, contact
 * IK, secondary motion — reads the resulting movement rather than the intent.
 */
export class QuadrupedActor {
  private readonly root = new THREE.Group();
  private readonly heading = new THREE.Group();
  private readonly rigInstance: ActorRigInstance;
  private readonly locomotion: QuadrupedLocomotionLayer;
  private readonly runtime: ActorAnimationRuntime;
  private readonly body: QuadrupedBodyHandle;
  /**
   * Written by whatever is steering this animal, read by the pose layers.
   *
   * Public because attention is a fact about the animal, not about its
   * animation, and the two update on different cadences.
   */
  readonly facts: QuadrupedMotionFacts = createQuadrupedMotionFacts();
  private readonly worldPosition = new THREE.Vector3();
  private readonly worldVelocity = new THREE.Vector3();
  private readonly groundNormal = new THREE.Vector3(0, 1, 0);
  private readonly previousPosition = new THREE.Vector3();
  private readonly input = createActorAnimationInput(
    this.worldPosition,
    this.worldVelocity,
    this.groundNormal,
  );
  private distanceTravelled = 0;
  private facing = 0;
  private speed = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    scale: number,
    spawnX: number,
    spawnZ: number,
    buildBody: QuadrupedBodyBuilder,
    private readonly sampleHeight: (x: number, z: number) => number,
    terrainContact?: ActorTerrainContactSampler,
  ) {
    const rig = quadrupedRig();
    this.root.name = "quadruped";
    this.root.scale.setScalar(scale);
    this.root.add(this.heading);
    this.rigInstance = new ActorRigInstance(rig.definition, this.heading);

    let body: QuadrupedBodyHandle | undefined;
    let runtime: ActorAnimationRuntime | undefined;
    try {
      body = buildBody(this.rigInstance, rig.bones);
      this.body = body;
      this.locomotion = new QuadrupedLocomotionLayer(rig.bones, this.facts);

      // Four effectors, one per limb, sharing the humanoid's contact solver.
      const gait = new ActorGait({
        // The gait phase advances on distance travelled in world metres, so a
        // scaled-down animal covers its stride in fewer of them. Without this a
        // fawn's legs cycle far too fast for its speed and it skates.
        strideLengthMeters: QUADRUPED_STRIDE_LENGTH_METERS * scale,
        effectors: QUADRUPED_CONTACT_CHAINS.map((chain) => ({
          phaseOffset: rig.definition.effectors.get(chain)?.phaseOffset ?? 0,
          dutyFactor: QUADRUPED_STANCE_DUTY_FACTOR,
        })),
      });
      const paws = [...rig.bones.frontPaw, ...rig.bones.hindPaw];
      const profile: ActorAnimationProfile = {
        definition: rig.definition,
        locomotion: this.locomotion,
        gait,
        enforceJointLimits: true,
        preIkStages: [
          new QuadrupedHeadAim(rig.definition, rig.bones, this.facts, this.heading),
        ],
        secondaryMotion: [
          new QuadrupedSecondaryMotion(rig.definition, rig.bones, this.facts),
        ],
        ikStages:
          terrainContact === undefined
            ? undefined
            : [
                new ActorContactIk({
                  definition: rig.definition,
                  placement: this.heading,
                  sampler: terrainContact,
                  supportBone: rig.bones.bodyCenter,
                  maxSupportDrop: QUADRUPED_MAX_BODY_DROP,
                  maxAlignRadians: QUADRUPED_MAX_PAW_ALIGN,
                  smoothingRate: QUADRUPED_CONTACT_SMOOTHING_RATE,
                  effectors: QUADRUPED_CONTACT_CHAINS.map((chain, index) => ({
                    chain: requireActorChain(rig.definition, chain),
                    gaitEffector: index,
                    soleOffset: QUADRUPED_PAW_DROP,
                    alignBone: paws[index],
                  })),
                }),
              ],
      };
      runtime = new ActorAnimationRuntime(profile, this.rigInstance);
      this.runtime = runtime;
      this.input.referenceSpeed = 1;
      this.placeAt(spawnX, spawnZ);
      this.previousPosition.copy(this.worldPosition);
      this.runtime.reset(this.input);
      scene.add(this.root);
    } catch (error) {
      disposeResource(runtime, "Quadruped animation runtime");
      disposeResource(this.rigInstance, "Quadruped rig instance");
      disposeResource(body, "Quadruped body");
      this.root.removeFromParent();
      throw error;
    }
  }

  /** Read-only world position, for distance and quality decisions. */
  get position(): THREE.Vector3 {
    return this.worldPosition;
  }

  get object(): THREE.Object3D {
    return this.root;
  }

  /** The drawn meshes, for whoever owns this actor's shadow and visibility policy. */
  get meshes(): readonly THREE.Mesh[] {
    return this.body.meshes;
  }

  /** Forwards an animation-quality decision made by the population owner. */
  setQuality(runIk: boolean, runSecondaryMotion: boolean): void {
    if (this.disposed) {
      return;
    }
    this.runtime.setQuality(runIk, runSecondaryMotion);
  }

  /** Teleports a recycled actor and clears every solver's history. */
  respawn(x: number, z: number, referenceSpeed: number): void {
    if (this.disposed) {
      return;
    }
    this.speed = 0;
    this.distanceTravelled = 0;
    this.input.referenceSpeed = Math.max(referenceSpeed, 0.001);
    this.placeAt(x, z);
    this.previousPosition.copy(this.worldPosition);
    this.runtime.reset(this.input);
  }

  update(deltaSeconds: number, steering: QuadrupedSteering): void {
    if (this.disposed) {
      return;
    }
    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      0.1,
    );
    this.previousPosition.copy(this.worldPosition);
    this.steer(delta, steering);

    const deltaX = this.worldPosition.x - this.previousPosition.x;
    const deltaZ = this.worldPosition.z - this.previousPosition.z;
    const travelled = Math.hypot(deltaX, deltaZ);
    this.distanceTravelled += travelled;
    const speed = delta > 0 ? travelled / delta : 0;
    this.worldVelocity
      .subVectors(this.worldPosition, this.previousPosition)
      .divideScalar(delta > 0 ? delta : 1);
    this.input.speed = speed;
    this.input.normalizedSpeed = THREE.MathUtils.clamp(
      speed / this.input.referenceSpeed,
      0,
      1,
    );
    this.input.distanceTravelled = this.distanceTravelled;

    this.root.updateMatrixWorld(true);
    this.runtime.update(delta, this.input);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.root.removeFromParent();
    disposeResource(this.runtime, "Quadruped animation runtime");
    disposeResource(this.rigInstance, "Quadruped rig instance");
    disposeResource(this.body, "Quadruped body");
  }

  /**
   * Turns toward the target, changes pace, and walks.
   *
   * The body turns at a bounded rate rather than snapping to face the target,
   * which is what produces the arcs a real animal walks and gives the tail
   * something to swing against. Speed eases in and out so the locomotion layer
   * sees genuine acceleration instead of a square wave, and the animal slows
   * into its destination rather than stopping dead on it.
   */
  private steer(delta: number, steering: QuadrupedSteering): void {
    const toX = steering.targetX - this.worldPosition.x;
    const toZ = steering.targetZ - this.worldPosition.z;
    const distance = Math.hypot(toX, toZ);

    let wanted = Math.max(steering.desiredSpeed, 0);
    if (distance <= ARRIVE_RADIUS) {
      wanted = 0;
    } else if (distance < SLOWING_RADIUS) {
      wanted *= distance / SLOWING_RADIUS;
    }

    if (distance > ARRIVE_RADIUS && wanted > 0) {
      // Actor forward is +Z, so a heading of f points along (sin f, cos f).
      const desiredFacing = Math.atan2(toX, toZ);
      let difference = desiredFacing - this.facing;
      while (difference > Math.PI) {
        difference -= Math.PI * 2;
      }
      while (difference < -Math.PI) {
        difference += Math.PI * 2;
      }
      const step = TURN_RATE * delta;
      this.facing += THREE.MathUtils.clamp(difference, -step, step);
    }

    const speedStep = ACCELERATION * delta;
    this.speed += THREE.MathUtils.clamp(
      wanted - this.speed,
      -speedStep,
      speedStep,
    );
    if (this.speed < 0.001) {
      this.speed = 0;
    }

    const advance = this.speed * delta;
    this.placeAt(
      this.worldPosition.x + Math.sin(this.facing) * advance,
      this.worldPosition.z + Math.cos(this.facing) * advance,
    );
  }

  private placeAt(x: number, z: number): void {
    this.worldPosition.set(x, this.sampleHeight(x, z), z);
    this.input.facing = this.facing;
    this.root.position.copy(this.worldPosition);
    this.heading.rotation.y = this.facing;
  }
}

function disposeResource(
  resource: { dispose(): void } | undefined,
  label: string,
): void {
  if (!resource) {
    return;
  }
  try {
    resource.dispose();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}
