import * as THREE from "three";
import type { WorldActorProofContext } from "../app/WorldActorProofContext";
import { GltfHumanoidActor } from "../character/gltf/GltfHumanoidActor";
import { ScriptedHumanoidActor } from "../character/npc/ScriptedHumanoidActor";
import {
  createVillagerAssets,
  type VillagerAssets,
} from "../character/npc/VillagerAssets";
import { createDeerAssets, type DeerAssets } from "../creatures/deer/DeerAssets";
import { createDeerBodyBuilder } from "../creatures/deer/DeerBody";
import { setDeerCoatTint } from "../creatures/deer/DeerPalette";
import { QuadrupedActor } from "../creatures/quadruped/QuadrupedActor";
import { disposeResources } from "../render/ResourceDisposal";
import { WorldTerrainContactSampler } from "../world/WorldTerrainContactSampler";

interface AttachableWorld {
  attachActorProof(
    observer: (deltaSeconds: number) => void,
  ): WorldActorProofContext;
}

interface ActorProofResources {
  context: WorldActorProofContext;
  npc: ScriptedHumanoidActor;
  quadruped: QuadrupedActor;
  deerAssets: DeerAssets;
  villagerAssets: VillagerAssets;
  sampleHeight: (x: number, z: number) => number;
  contact: WorldTerrainContactSampler;
}

const NPC_PATH = {
  radius: 6,
  speed: 1.6,
  pauseSeconds: 2.2,
  walkSeconds: 5.5,
} as const;
const QUADRUPED_PATH = { radius: 9, speed: 1.9 } as const;
/**
 * The animal proof paces a line rather than wandering.
 *
 * The point of this harness is that starting, stopping and turning all work, and
 * a deterministic there-and-back exercises every one of those on a fixed cycle —
 * unlike the shipping behaviour, which is deliberately unpredictable.
 */
const QUADRUPED_PATROL_HALF_LENGTH = 7;
const QUADRUPED_PATROL_SECONDS = 9;

/**
 * Imported characters, patrolling a wider ring than the procedural proofs.
 *
 * The KayKit rigs stand roughly 1.7 units tall against this world's metre
 * scale, so they need no extra scaling; the patrol speeds are set to read as a
 * walk at their proportions rather than the player's.
 */
const SKELETON_PATROL = {
  radius: 13,
  speed: 1.35,
  pauseSeconds: 2.6,
  walkSeconds: 6.5,
} as const;
const SKELETON_MODELS = [
  "Skeleton_Warrior",
  "Skeleton_Rogue",
  "Skeleton_Mage",
  "Skeleton_Minion",
] as const;

/**
 * The development-only extensibility proof (`?actorProof=1`).
 *
 * It puts a scripted humanoid NPC and a quadruped into the running world beside
 * the player, all three animating simultaneously through the same actor
 * runtime. The humanoid shares the player's immutable rig definition without
 * touching player input; the quadruped uses a different topology with four
 * contact limbs. Disposing either leaves the other, and the player, untouched.
 *
 * This module is imported only when its query parameter is present, so it costs
 * the production bundle nothing.
 */
export class ActorExtensibilityProof {
  private readonly context: WorldActorProofContext;
  private readonly npc: ScriptedHumanoidActor;
  private readonly quadruped: QuadrupedActor;
  /** The proof owns its own libraries so it can be disposed independently. */
  private readonly deerAssets: DeerAssets;
  private readonly villagerAssets: VillagerAssets;
  private readonly npcSteering = {
    targetX: NPC_PATH.radius,
    targetZ: QUADRUPED_PATROL_HALF_LENGTH,
    desiredSpeed: NPC_PATH.speed,
  };
  private readonly quadrupedSteering = {
    targetX: QUADRUPED_PATH.radius,
    targetZ: QUADRUPED_PATROL_HALF_LENGTH,
    desiredSpeed: QUADRUPED_PATH.speed,
  };
  private patrolSeconds = 0;
  private readonly imported: GltfHumanoidActor[] = [];
  private disposed = false;

  static attach(world: unknown): ActorExtensibilityProof | undefined {
    try {
      return new ActorExtensibilityProof(world as AttachableWorld);
    } catch (error) {
      console.warn("[Drusniel World] Actor proof unavailable.", error);
      return undefined;
    }
  }

  private constructor(world: AttachableWorld) {
    const resources = createActorProofResources(world, this.update);
    this.context = resources.context;
    this.npc = resources.npc;
    this.quadruped = resources.quadruped;
    this.deerAssets = resources.deerAssets;
    this.villagerAssets = resources.villagerAssets;

    // Imported characters stream in. A missing or malformed asset must leave
    // the procedural proofs and the player running, so the load is fire and
    // forget and reports rather than throws.
    void this.spawnImported(resources.sampleHeight, resources.contact);
  }

  private async spawnImported(
    sampleHeight: (x: number, z: number) => number,
    contact: WorldTerrainContactSampler,
  ): Promise<void> {
    for (let index = 0; index < SKELETON_MODELS.length; index += 1) {
      if (this.disposed) {
        return;
      }
      const name = SKELETON_MODELS[index];
      try {
        const actor = await GltfHumanoidActor.create(
          this.context.scene,
          {
            url: `./models/skeletons/${name}.glb`,
            textureUrl: "./models/skeletons/skeleton_texture.png",
            scale: 1,
            patrol: {
              centerX: 0,
              centerZ: 0,
              ...SKELETON_PATROL,
              phase: (index / SKELETON_MODELS.length) * Math.PI * 2,
            },
          },
          sampleHeight,
          contact,
        );
        if (this.disposed) {
          actor.dispose();
          return;
        }
        this.imported.push(actor);
      } catch (error) {
        console.warn(`[Drusniel World] ${name} did not load.`, error);
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const imported = this.imported.splice(0);
    disposeActorProofResources(
      {
        context: this.context,
        npc: this.npc,
        quadruped: this.quadruped,
        deerAssets: this.deerAssets,
        villagerAssets: this.villagerAssets,
      },
      imported,
      "cleanup",
    );
  }

  private readonly update = (deltaSeconds: number): void => {
    if (this.disposed) {
      return;
    }
    this.patrolSeconds += deltaSeconds;
    this.npcSteering.targetZ =
      this.patrolSeconds % (QUADRUPED_PATROL_SECONDS * 2) < QUADRUPED_PATROL_SECONDS
        ? -QUADRUPED_PATROL_HALF_LENGTH
        : QUADRUPED_PATROL_HALF_LENGTH;
    this.npc.update(deltaSeconds, this.npcSteering);
    const outbound =
      this.patrolSeconds % (QUADRUPED_PATROL_SECONDS * 2) < QUADRUPED_PATROL_SECONDS;
    this.quadrupedSteering.targetZ = outbound
      ? QUADRUPED_PATROL_HALF_LENGTH
      : -QUADRUPED_PATROL_HALF_LENGTH;
    this.quadruped.update(deltaSeconds, this.quadrupedSteering);
    for (let index = 0; index < this.imported.length; index += 1) {
      this.imported[index].update(deltaSeconds);
    }
  };
}

function createActorProofResources(
  world: AttachableWorld,
  observer: (deltaSeconds: number) => void,
): ActorProofResources {
  let context: WorldActorProofContext | undefined;
  let npc: ScriptedHumanoidActor | undefined;
  let quadruped: QuadrupedActor | undefined;
  let deerAssets: DeerAssets | undefined;
  let villagerAssets: VillagerAssets | undefined;

  try {
    context = world.attachActorProof(observer);
    deerAssets = createDeerAssets();
    villagerAssets = createVillagerAssets();
    const field = context.field;
    const sampleHeight = (x: number, z: number): number =>
      field.sampleHeight(x, z);
    const contact = new WorldTerrainContactSampler(field);

    npc = new ScriptedHumanoidActor(
      context.scene,
      1,
      NPC_PATH.radius,
      0,
      villagerAssets,
      0,
      true,
      sampleHeight,
      contact,
    );
    npc.setReferenceSpeed(NPC_PATH.speed);

    const tint = new THREE.Color();
    setDeerCoatTint(tint, 0.5, 0.5);
    quadruped = new QuadrupedActor(
      context.scene,
      1,
      QUADRUPED_PATH.radius,
      0,
      createDeerBodyBuilder(deerAssets, "stag", tint, true),
      sampleHeight,
      contact,
    );

    return {
      context,
      npc,
      quadruped,
      deerAssets,
      villagerAssets,
      sampleHeight,
      contact,
    };
  } catch (error) {
    disposeActorProofResources(
      { context, npc, quadruped, deerAssets, villagerAssets },
      [],
      "construction rollback",
    );
    throw error;
  }
}

function disposeActorProofResources(
  resources: {
    context?: WorldActorProofContext;
    npc?: ScriptedHumanoidActor;
    quadruped?: QuadrupedActor;
    deerAssets?: DeerAssets;
    villagerAssets?: VillagerAssets;
  },
  imported: readonly GltfHumanoidActor[],
  label: string,
): void {
  try {
    disposeResources([
      resources.context
        ? { dispose: () => resources.context?.detach() }
        : undefined,
      resources.npc,
      resources.quadruped,
      ...imported,
      resources.deerAssets,
      resources.villagerAssets,
    ]);
  } catch (cleanupError) {
    console.warn(`[Drusniel World] Actor proof ${label} failed.`, cleanupError);
  }
}
