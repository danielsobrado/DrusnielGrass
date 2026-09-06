import * as THREE from "three";
import {
  ActorAnimationQuality,
  ACTOR_QUALITY_CULLED,
  ACTOR_QUALITY_FULL,
} from "../../actor/animation/ActorAnimationQuality";
import { WORLD_SUN_SHADOW_HALF_EXTENT } from "../../app/WorldEnvironmentTuning";
import { ScriptedHumanoidActor } from "../../character/npc/ScriptedHumanoidActor";
import {
  createVillagerAssets,
  type VillagerAssets,
} from "../../character/npc/VillagerAssets";
import { VillagerRoute, type VillagerSteering } from "../../character/npc/VillagerRoute";
import { createDeerAssets, type DeerAssets } from "../../creatures/deer/DeerAssets";
import {
  DeerBehavior,
  type DeerSteering,
} from "../../creatures/deer/DeerBehavior";
import { createDeerBodyBuilder } from "../../creatures/deer/DeerBody";
import type { DeerVariant } from "../../creatures/deer/DeerGeometry";
import { setDeerCoatTint } from "../../creatures/deer/DeerPalette";
import { QuadrupedActor } from "../../creatures/quadruped/QuadrupedActor";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { TerrainField } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import { WorldTerrainContactSampler } from "../WorldTerrainContactSampler";
import type { WorldFaunaMember } from "./WorldFaunaField";
import { WorldFaunaHabitat } from "./WorldFaunaHabitat";
import { faunaMemberKey, WorldFaunaRoster } from "./WorldFaunaRoster";
import {
  FAUNA_ALERT_RADIUS,
  FAUNA_FAWN_SCALE,
  FAUNA_FLEE_RADIUS,
  FAUNA_POOL_VARIANTS,
  FAUNA_QUALITY_HYSTERESIS,
  FAUNA_RETIRE_MARGIN,
  FAUNA_VILLAGER_ROUTE_RADIUS,
} from "./WorldScenicTuning";

/** One live animal and everything that decides what it does. */
interface FaunaSlot {
  readonly actor: QuadrupedActor;
  readonly behavior: DeerBehavior;
  readonly quality: ActorAnimationQuality;
  readonly steering: DeerSteering;
  readonly meshes: readonly THREE.Mesh[];
  readonly variant: DeerVariant;
  memberKey?: string;
  active: boolean;
  castsShadow: boolean;
}

/** One villager and the route it walks. */
interface VillagerSlot {
  readonly actor: ScriptedHumanoidActor;
  readonly route: VillagerRoute;
  readonly quality: ActorAnimationQuality;
  readonly steering: VillagerSteering;
  castsShadow: boolean;
}

interface FaunaResources {
  readonly assets: DeerAssets;
  readonly villagerAssets: VillagerAssets;
  readonly habitat: WorldFaunaHabitat;
}

/**
 * The deer population, streamed around the player.
 *
 * The pool is allocated once and never grows. Recycling an actor is a teleport
 * and a reset, not a construction, which keeps traversal allocation-free.
 * Body variants are fixed per slot because swapping a member identity must not
 * leave a stag mesh representing a fawn or vice versa.
 */
export class WorldFaunaSystem {
  private readonly assets: DeerAssets;
  private readonly villagerAssets: VillagerAssets;
  private readonly villagers: VillagerSlot[] = [];
  private readonly habitat: WorldFaunaHabitat;
  private readonly roster: WorldFaunaRoster;
  private readonly slots: FaunaSlot[] = [];
  private readonly tint = new THREE.Color();
  private readonly walkSpeed: number;
  private readonly behaviorInterval: number;
  private readonly shadows: boolean;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    field: TerrainField,
    private readonly config: WorldConfig,
    profile: RuntimeProfile,
    spawn: THREE.Vector3,
    shadows: boolean,
  ) {
    const resources = createFaunaResources(field);
    this.assets = resources.assets;
    this.villagerAssets = resources.villagerAssets;
    this.habitat = resources.habitat;
    this.roster = new WorldFaunaRoster(field, config);
    this.walkSpeed = config.faunaDeerWalkSpeed;
    this.behaviorInterval = 1 / config.faunaBehaviorHz;
    this.shadows = shadows;

    try {
      const count =
        config.faunaEnabled < 1
          ? 0
          : profile.compact
            ? config.faunaDeerCompactCount
            : config.faunaDeerDesktopCount;
      const sampleHeight = (x: number, z: number): number =>
        field.sampleHeight(x, z);
      const contact = new WorldTerrainContactSampler(field);

      if (count > 0) {
        this.rebuildRoster(spawn, true);
      }
      for (let index = 0; index < count; index += 1) {
        this.slots.push(
          this.createSlot(scene, index, count, spawn, sampleHeight, contact),
        );
      }

      // Villagers stay near the player's own spawn rather than streaming: people
      // belong to a place, and a person who materialises in open country every
      // time you cross a lattice boundary reads as a glitch, not a neighbour.
      const villagerCount =
        config.faunaEnabled < 1
          ? 0
          : profile.compact
            ? config.faunaVillagerCompactCount
            : config.faunaVillagerDesktopCount;
      for (let index = 0; index < villagerCount; index += 1) {
        this.villagers.push(
          this.createVillager(
            scene,
            index,
            villagerCount,
            spawn,
            sampleHeight,
            contact,
          ),
        );
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private createVillager(
    scene: THREE.Scene,
    index: number,
    count: number,
    spawn: THREE.Vector3,
    sampleHeight: (x: number, z: number) => number,
    contact: WorldTerrainContactSampler,
  ): VillagerSlot {
    const angle = (index / Math.max(count, 1)) * Math.PI * 2;
    const radius = FAUNA_VILLAGER_ROUTE_RADIUS;
    const centerX = spawn.x + Math.cos(angle) * radius;
    const centerZ = spawn.z + Math.sin(angle) * radius;
    const actor = new ScriptedHumanoidActor(
      scene,
      1,
      centerX,
      centerZ,
      this.villagerAssets,
      index,
      this.shadows,
      sampleHeight,
      contact,
    );
    try {
      actor.setReferenceSpeed(this.config.faunaVillagerWalkSpeed);
      return {
        actor,
        route: new VillagerRoute({
          centerX,
          centerZ,
          radius,
          walkSpeed: this.config.faunaVillagerWalkSpeed,
          seed: index + 17,
        }),
        quality: this.createQuality(),
        steering: { targetX: centerX, targetZ: centerZ, desiredSpeed: 0 },
        castsShadow: this.shadows,
      };
    } catch (error) {
      disposeActor(actor, "Villager actor");
      throw error;
    }
  }

  update(deltaSeconds: number, focus: THREE.Vector3): void {
    if (
      this.disposed ||
      (this.slots.length === 0 && this.villagers.length === 0)
    ) {
      return;
    }
    const rosterRebuilt =
      this.slots.length > 0 ? this.rebuildRoster(focus) : false;

    for (const slot of this.slots) {
      if (!slot.active) {
        if (rosterRebuilt) {
          this.recycle(slot, focus);
        }
        if (!slot.active) {
          continue;
        }
      }

      const distance = slot.actor.position.distanceTo(focus);
      if (distance > this.config.faunaCullDistance + FAUNA_RETIRE_MARGIN) {
        this.recycle(slot, focus);
        continue;
      }
      if (slot.quality.setDistance(distance)) {
        this.applyQuality(slot);
      }

      slot.behavior.update(
        deltaSeconds,
        slot.actor.position.x,
        slot.actor.position.z,
        focus.x,
        focus.y,
        focus.z,
        slot.steering,
      );

      if (!slot.quality.shouldUpdate(deltaSeconds)) {
        continue;
      }
      slot.actor.update(slot.quality.takeAccumulatedSeconds(), slot.steering);
    }

    for (const villager of this.villagers) {
      villager.route.update(
        deltaSeconds,
        villager.actor.position.x,
        villager.actor.position.z,
        villager.steering,
      );
      villager.actor.setReferenceSpeed(villager.steering.desiredSpeed);
      if (villager.quality.setDistance(villager.actor.position.distanceTo(focus))) {
        this.applyVillagerQuality(villager);
      }
      if (villager.quality.shouldUpdate(deltaSeconds)) {
        villager.actor.update(
          villager.quality.takeAccumulatedSeconds(),
          villager.steering,
        );
      }
    }
  }

  private rebuildRoster(focus: THREE.Vector3, force = false): boolean {
    const occupied = new Set<string>();
    for (const slot of this.slots) {
      if (slot.active && slot.memberKey) {
        occupied.add(slot.memberKey);
      }
    }
    return this.roster.refresh(focus.x, focus.z, force, occupied);
  }

  private takeMember(
    focus: THREE.Vector3,
    variant?: DeerVariant,
  ): WorldFaunaMember | undefined {
    return this.roster.take(focus, variant);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const slot of this.slots) {
      disposeActor(slot.actor, "Deer actor");
    }
    this.slots.length = 0;
    for (const villager of this.villagers) {
      disposeActor(villager.actor, "Villager actor");
    }
    this.villagers.length = 0;
    disposeResource(() => this.assets.dispose(), "Deer assets");
    disposeResource(() => this.villagerAssets.dispose(), "Villager assets");
  }

  private createSlot(
    scene: THREE.Scene,
    index: number,
    count: number,
    spawn: THREE.Vector3,
    sampleHeight: (x: number, z: number) => number,
    contact: WorldTerrainContactSampler,
  ): FaunaSlot {
    const variant = FAUNA_POOL_VARIANTS[index % FAUNA_POOL_VARIANTS.length];
    const member = this.takeMember(spawn, variant);
    setDeerCoatTint(
      this.tint,
      member?.coatValue ?? 0.5,
      member?.coatWarmth ?? 0.5,
    );
    const scale = variant === "fawn" ? FAUNA_FAWN_SCALE : 1;
    const actor = new QuadrupedActor(
      scene,
      scale,
      member?.x ?? spawn.x,
      member?.z ?? spawn.z,
      createDeerBodyBuilder(this.assets, variant, this.tint, this.shadows),
      sampleHeight,
      contact,
    );
    try {
      const seed = member?.seed ?? index + 1;
      const behavior = new DeerBehavior({
        habitat: this.habitat,
        facts: actor.facts,
        walkSpeed: this.walkSpeed,
        seed,
        decisionIntervalSeconds: this.behaviorInterval,
        decisionPhaseSeconds:
          (index / Math.max(count, 1)) * this.behaviorInterval,
        alertRadius: FAUNA_ALERT_RADIUS,
        fleeRadius: FAUNA_FLEE_RADIUS,
      });
      behavior.reset(
        member?.x ?? spawn.x,
        member?.z ?? spawn.z,
        actor.position.x,
        actor.position.z,
        seed,
      );
      const slot: FaunaSlot = {
        actor,
        behavior,
        quality: this.createQuality(),
        steering: {
          targetX: actor.position.x,
          targetZ: actor.position.z,
          desiredSpeed: 0,
        },
        meshes: actor.meshes,
        variant,
        memberKey: member ? faunaMemberKey(member) : undefined,
        active: member !== undefined,
        castsShadow: this.shadows,
      };
      this.applyQuality(slot);
      return slot;
    } catch (error) {
      disposeActor(actor, "Deer actor");
      throw error;
    }
  }

  private createQuality(): ActorAnimationQuality {
    return new ActorAnimationQuality({
      fullDistance: this.config.faunaFullDistance,
      reducedDistance: this.config.faunaReducedDistance,
      minimalDistance: this.config.faunaMinimalDistance,
      cullDistance: this.config.faunaCullDistance,
      reducedIntervalSeconds: 1 / this.config.faunaReducedUpdateHz,
      minimalIntervalSeconds: 1 / this.config.faunaMinimalUpdateHz,
      hysteresisDistance: FAUNA_QUALITY_HYSTERESIS,
    });
  }

  private recycle(slot: FaunaSlot, focus: THREE.Vector3): void {
    const member = this.takeMember(focus, slot.variant);
    if (member === undefined) {
      slot.memberKey = undefined;
      slot.active = false;
      slot.actor.object.visible = false;
      return;
    }
    slot.memberKey = faunaMemberKey(member);
    slot.active = true;
    slot.actor.object.visible = true;
    this.applyMemberCoat(slot, member);
    slot.actor.respawn(member.x, member.z, this.walkSpeed);
    slot.behavior.reset(
      member.x,
      member.z,
      member.x,
      member.z,
      member.seed,
    );
    slot.quality.reset();
    slot.steering.targetX = member.x;
    slot.steering.targetZ = member.z;
    slot.steering.desiredSpeed = 0;
    this.applyQuality(slot);
  }

  private applyMemberCoat(slot: FaunaSlot, member: WorldFaunaMember): void {
    setDeerCoatTint(this.tint, member.coatValue, member.coatWarmth);
    for (const mesh of slot.meshes) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.copy(this.tint);
        }
      }
    }
  }

  private applyQuality(slot: FaunaSlot): void {
    const level = slot.quality.getLevel();
    const culled = level === ACTOR_QUALITY_CULLED;
    slot.actor.object.visible = slot.active && !culled;
    slot.actor.setQuality(
      slot.quality.runsIk(),
      slot.quality.runsSecondaryMotion(),
    );

    const casts =
      this.shadows &&
      slot.active &&
      level === ACTOR_QUALITY_FULL &&
      this.config.faunaFullDistance <= WORLD_SUN_SHADOW_HALF_EXTENT * 2;
    if (casts === slot.castsShadow) {
      return;
    }
    slot.castsShadow = casts;
    for (const mesh of slot.meshes) {
      mesh.castShadow = casts;
    }
  }

  private applyVillagerQuality(villager: VillagerSlot): void {
    const level = villager.quality.getLevel();
    const culled = level === ACTOR_QUALITY_CULLED;
    villager.actor.object.visible = !culled;
    villager.actor.setQuality(
      villager.quality.runsIk(),
      villager.quality.runsSecondaryMotion(),
    );

    const casts =
      this.shadows &&
      level === ACTOR_QUALITY_FULL &&
      this.config.faunaFullDistance <= WORLD_SUN_SHADOW_HALF_EXTENT * 2;
    if (casts === villager.castsShadow) {
      return;
    }
    villager.castsShadow = casts;
    for (const mesh of villager.actor.meshes) {
      mesh.castShadow = casts;
    }
  }
}

function createFaunaResources(field: TerrainField): FaunaResources {
  const assets = createDeerAssets();
  let villagerAssets: VillagerAssets | undefined;
  try {
    villagerAssets = createVillagerAssets();
    return {
      assets,
      villagerAssets,
      habitat: new WorldFaunaHabitat(field),
    };
  } catch (error) {
    disposeResource(() => villagerAssets?.dispose(), "Villager assets");
    disposeResource(() => assets.dispose(), "Deer assets");
    throw error;
  }
}

interface DisposableActor {
  dispose(): void;
}

function disposeActor(actor: DisposableActor, label: string): void {
  disposeResource(() => actor.dispose(), label);
}

function disposeResource(dispose: () => void, label: string): void {
  try {
    dispose();
  } catch (error) {
    console.warn(`[World Fauna] ${label} cleanup failed.`, error);
  }
}
