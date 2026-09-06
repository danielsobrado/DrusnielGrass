import * as THREE from "three";
import { createActorAnimationInput } from "../../actor/animation/ActorAnimationInput";
import { ActorAnimationRuntime } from "../../actor/animation/ActorAnimationRuntime";
import type { ActorTerrainContactSampler } from "../../actor/ik/ActorTerrainContact";
import { ActorRigInstance } from "../../actor/rig/ActorRigInstance";
import {
  createHumanoidAnimationProfile,
  type HumanoidAnimationProfile,
} from "../animation/HumanoidAnimationProfile";
import { createHumanoidContactIk } from "../animation/HumanoidContactIk";
import { humanoidRig } from "../rig/HumanoidRigDefinition";
import type { VillagerAssets } from "./VillagerAssets";
import { buildVillagerBody, type VillagerBody } from "./VillagerBody";
import type { VillagerSteering } from "./VillagerRoute";

/** How quickly a person turns and changes pace, in radians and m/s². */
const TURN_RATE = 3.4;
const ACCELERATION = 4.5;
const ARRIVE_RADIUS = 0.4;
const SLOWING_RADIUS = 1.4;

/**
 * A non-player humanoid, built on exactly the same rig and profile as the
 * player.
 *
 * It shares the immutable humanoid rig definition with the player while owning
 * its own rig instance, pose buffers and runtime state, has no reference to
 * `ThirdPersonController`, and reads no input. Where it goes arrives as a target
 * and a speed; turning, accelerating and stopping are its own.
 */
export class ScriptedHumanoidActor {
  private readonly root = new THREE.Group();
  private readonly heading = new THREE.Group();
  private readonly rigInstance: ActorRigInstance;
  private readonly profile: HumanoidAnimationProfile;
  private readonly runtime: ActorAnimationRuntime;
  private readonly body: VillagerBody;
  private readonly worldPosition = new THREE.Vector3();
  private readonly worldVelocity = new THREE.Vector3();
  private readonly groundNormal = new THREE.Vector3(0, 1, 0);
  private readonly input = createActorAnimationInput(
    this.worldPosition,
    this.worldVelocity,
    this.groundNormal,
  );
  private readonly previousPosition = new THREE.Vector3();
  private distanceTravelled = 0;
  private previousSpeed = 0;
  private facing = 0;
  private speed = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    scale: number,
    spawnX: number,
    spawnZ: number,
    assets: VillagerAssets,
    variant: number,
    shadows: boolean,
    private readonly sampleHeight: (x: number, z: number) => number,
    terrainContact?: ActorTerrainContactSampler,
  ) {
    const humanoid = humanoidRig();
    this.root.name = "villager";
    this.root.scale.setScalar(scale);
    this.root.add(this.heading);
    this.rigInstance = new ActorRigInstance(humanoid.definition, this.heading);
    this.body = buildVillagerBody(
      this.rigInstance,
      humanoid.bones,
      assets,
      variant,
      shadows,
    );

    let runtime: ActorAnimationRuntime | undefined;
    try {
      this.profile = createHumanoidAnimationProfile({
        definition: humanoid.definition,
        bones: humanoid.bones,
        landingRecoverySeconds: 0.25,
        ikStages:
          terrainContact === undefined
            ? undefined
            : [
                createHumanoidContactIk(
                  humanoid.definition,
                  humanoid.bones,
                  terrainContact,
                  this.heading,
                ),
              ],
      });
      runtime = new ActorAnimationRuntime(this.profile, this.rigInstance);
      this.runtime = runtime;
      this.input.referenceSpeed = 1;
      this.placeAt(spawnX, spawnZ);
      this.previousPosition.copy(this.worldPosition);
      this.runtime.reset(this.input);
      scene.add(this.root);
    } catch (error) {
      disposeResource(runtime, "Villager animation runtime");
      disposeResource(this.rigInstance, "Villager rig instance");
      disposeResource(this.body, "Villager body");
      this.root.removeFromParent();
      throw error;
    }
  }

  get position(): THREE.Vector3 {
    return this.worldPosition;
  }

  get object(): THREE.Object3D {
    return this.root;
  }

  get meshes(): readonly THREE.Mesh[] {
    return this.body.meshes;
  }

  /** Sets the reference speed the locomotion layer normalizes against. */
  setReferenceSpeed(speed: number): void {
    this.input.referenceSpeed = Math.max(speed, 0.001);
  }

  setQuality(runIk: boolean, runSecondaryMotion: boolean): void {
    this.runtime.setQuality(runIk, runSecondaryMotion);
  }

  update(deltaSeconds: number, steering: VillagerSteering): void {
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
    this.input.acceleration = delta > 0 ? (speed - this.previousSpeed) / delta : 0;
    this.input.distanceTravelled = this.distanceTravelled;
    this.previousSpeed = speed;

    this.root.updateMatrixWorld(true);
    this.runtime.update(delta, this.input);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.root.removeFromParent();
    disposeResource(this.runtime, "Villager animation runtime");
    disposeResource(this.rigInstance, "Villager rig instance");
    disposeResource(this.body, "Villager body");
  }

  /**
   * Turns toward the target and walks, bounded by how fast a person can.
   *
   * Sharper than the deer on both counts: people pivot on the spot and set off
   * briskly, where an animal leans into an arc. Keeping the two different is
   * most of what stops the villagers reading as deer that stood up.
   */
  private steer(delta: number, steering: VillagerSteering): void {
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
    this.speed += THREE.MathUtils.clamp(wanted - this.speed, -speedStep, speedStep);
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
    // Actor forward is +Z, so a world heading of f points along (sin f, cos f).
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
