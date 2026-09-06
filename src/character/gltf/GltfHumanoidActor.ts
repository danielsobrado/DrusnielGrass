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
import {
  disposeGltfCharacter,
  loadGltfCharacter,
  type LoadedGltfCharacter,
} from "./GltfCharacterLoader";
import { buildKayKitHumanoidRig } from "./KayKitHumanoidBinding";

export interface GltfHumanoidPatrol {
  readonly centerX: number;
  readonly centerZ: number;
  readonly radius: number;
  /** Metres per second along the patrol. */
  readonly speed: number;
  /** Where on the circle this actor starts, in radians. */
  readonly phase: number;
  /** Seconds spent standing at each halt. */
  readonly pauseSeconds: number;
  /** Seconds of walking between halts. */
  readonly walkSeconds: number;
}

export interface GltfHumanoidOptions {
  readonly url: string;
  /** Colour atlas shared by every character in the pack. */
  readonly textureUrl?: string;
  readonly scale: number;
  readonly patrol: GltfHumanoidPatrol;
  readonly landingRecoverySeconds?: number;
}

interface GltfHumanoidRuntimeResources {
  readonly rigInstance: ActorRigInstance;
  readonly profile: HumanoidAnimationProfile;
  readonly runtime: ActorAnimationRuntime;
}

/**
 * An imported character animated by this project's own actor runtime.
 *
 * The asset supplies a body and a skeleton; everything that moves it is the
 * shared layer — the humanoid locomotion equations the player uses, the same
 * gait, the same analytic contact IK planting feet on terrain. None of the
 * pack's baked clips are involved, and the shipped files no longer contain
 * them.
 *
 * That the imported rig runs its limbs along `+Y` while the procedural rigs run
 * theirs along `-Y`, and that it has no neck, clavicles, or cloth bones, needs
 * no special handling: chain axes come from the imported bind pose and the
 * missing joints are simply absent roles.
 */
export class GltfHumanoidActor {
  private readonly root = new THREE.Group();
  private readonly heading = new THREE.Group();
  private readonly rigInstance: ActorRigInstance;
  private readonly runtime: ActorAnimationRuntime;
  private readonly character: LoadedGltfCharacter;
  private readonly patrol: GltfHumanoidPatrol;
  private readonly worldPosition = new THREE.Vector3();
  private readonly worldVelocity = new THREE.Vector3();
  private readonly groundNormal = new THREE.Vector3(0, 1, 0);
  private readonly previousPosition = new THREE.Vector3();
  private readonly input = createActorAnimationInput(
    this.worldPosition,
    this.worldVelocity,
    this.groundNormal,
  );
  private pathTime = 0;
  private distanceTravelled = 0;
  private previousSpeed = 0;
  private disposed = false;

  private constructor(
    scene: THREE.Scene,
    character: LoadedGltfCharacter,
    options: GltfHumanoidOptions,
    private readonly sampleHeight: (x: number, z: number) => number,
    terrainContact?: ActorTerrainContactSampler,
  ) {
    this.character = character;
    this.patrol = options.patrol;
    this.root.name = `gltf-humanoid:${options.url.split("/").pop() ?? ""}`;
    this.root.scale.setScalar(options.scale);
    this.root.add(this.heading);
    this.heading.add(character.scene);

    const resources = createRuntimeResources(
      this.heading,
      character,
      this.root.name,
      options,
      terrainContact,
    );
    this.rigInstance = resources.rigInstance;
    this.runtime = resources.runtime;

    try {
      this.input.referenceSpeed = Math.max(options.patrol.speed, 0.001);
      this.placeOnPath(0);
      this.previousPosition.copy(this.worldPosition);
      this.runtime.reset(this.input);
      scene.add(this.root);
    } catch (error) {
      disposeActorResourceSafely("animation runtime construction", () =>
        this.runtime.dispose(),
      );
      disposeActorResourceSafely("rig construction", () =>
        this.rigInstance.dispose(),
      );
      disposeActorResourceSafely("unpublished scene root", () =>
        this.root.removeFromParent(),
      );
      throw error;
    }
  }

  static async create(
    scene: THREE.Scene,
    options: GltfHumanoidOptions,
    sampleHeight: (x: number, z: number) => number,
    terrainContact?: ActorTerrainContactSampler,
  ): Promise<GltfHumanoidActor> {
    const character = await loadGltfCharacter(options.url, options.textureUrl);
    try {
      return new GltfHumanoidActor(
        scene,
        character,
        options,
        sampleHeight,
        terrainContact,
      );
    } catch (error) {
      disposeActorResourceSafely("loaded character construction", () =>
        disposeGltfCharacter(character),
      );
      throw error;
    }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      0.1,
    );
    this.pathTime += delta;
    this.previousPosition.copy(this.worldPosition);
    this.placeOnPath(this.pathTime);

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
    this.input.acceleration =
      delta > 0 ? (speed - this.previousSpeed) / delta : 0;
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
    disposeActorResourceSafely("animation runtime", () => this.runtime.dispose());
    disposeActorResourceSafely("rig instance", () => this.rigInstance.dispose());
    disposeActorResourceSafely("loaded character", () =>
      disposeGltfCharacter(this.character),
    );
    disposeActorResourceSafely("scene root", () => this.root.removeFromParent());
  }

  /** Walks the patrol circle, halting on a fixed cycle. */
  private placeOnPath(time: number): void {
    const cycle = this.patrol.walkSeconds + this.patrol.pauseSeconds;
    const cycles = Math.floor(time / cycle);
    const withinCycle = time - cycles * cycle;
    const walked =
      cycles * this.patrol.walkSeconds +
      Math.min(withinCycle, this.patrol.walkSeconds);
    const angle =
      this.patrol.phase +
      (this.patrol.radius > 0
        ? (walked * this.patrol.speed) / this.patrol.radius
        : 0);
    const x = this.patrol.centerX + Math.cos(angle) * this.patrol.radius;
    const z = this.patrol.centerZ + Math.sin(angle) * this.patrol.radius;
    this.worldPosition.set(x, this.sampleHeight(x, z), z);
    // Actor forward is +Z, so a heading of -angle matches the circle tangent.
    this.input.facing = -angle;
    this.root.position.copy(this.worldPosition);
    this.heading.rotation.y = -angle;
  }
}

function createRuntimeResources(
  heading: THREE.Group,
  character: LoadedGltfCharacter,
  actorName: string,
  options: GltfHumanoidOptions,
  terrainContact?: ActorTerrainContactSampler,
): GltfHumanoidRuntimeResources {
  let rigInstance: ActorRigInstance | undefined;
  let runtime: ActorAnimationRuntime | undefined;
  try {
    const rig = buildKayKitHumanoidRig(character.skinBones, actorName);
    // Adopt the imported bones rather than build a parallel hierarchy, so the
    // pose reaches the very bones the skinned meshes are bound to.
    rigInstance = new ActorRigInstance(rig.definition, heading, {
      adoptBones: rig.orderedBones,
      adoptSkeleton: character.skeleton,
    });
    const profile = createHumanoidAnimationProfile({
      definition: rig.definition,
      bones: rig.bones,
      landingRecoverySeconds: options.landingRecoverySeconds ?? 0.25,
      ikStages:
        terrainContact === undefined
          ? undefined
          : [
              createHumanoidContactIk(
                rig.definition,
                rig.bones,
                terrainContact,
                heading,
              ),
            ],
    });
    runtime = new ActorAnimationRuntime(profile, rigInstance);
    return { rigInstance, profile, runtime };
  } catch (error) {
    disposeActorResourceSafely("animation runtime construction", () =>
      runtime?.dispose(),
    );
    disposeActorResourceSafely("rig construction", () => rigInstance?.dispose());
    throw error;
  }
}

function disposeActorResourceSafely(label: string, dispose: () => void): void {
  try {
    dispose();
  } catch (error) {
    console.warn(`[Drusniel World] GLTF actor ${label} cleanup failed.`, error);
  }
}