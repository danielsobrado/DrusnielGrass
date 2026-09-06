import * as THREE from "three";
import {
  ActorAnimationQuality,
  ACTOR_QUALITY_CULLED,
  ACTOR_QUALITY_FULL,
} from "../../actor/animation/ActorAnimationQuality";
import { ScriptedHumanoidActor } from "../../character/npc/ScriptedHumanoidActor";
import {
  createVillagerAssets,
  type VillagerAssets,
} from "../../character/npc/VillagerAssets";
import { VillagerRoute, type VillagerSteering } from "../../character/npc/VillagerRoute";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { WorldConfig } from "../WorldConfig";
import type { WorldTerrainContactSampler } from "../WorldTerrainContactSampler";
import { FAUNA_VILLAGER_ROUTE_RADIUS } from "./WorldScenicTuning";

/** One villager and the route it walks. */
interface VillagerSlot {
  readonly actor: ScriptedHumanoidActor;
  readonly route: VillagerRoute;
  readonly quality: ActorAnimationQuality;
  readonly steering: VillagerSteering;
  castsShadow: boolean;
}

/**
 * The people near the player's spawn.
 *
 * Villagers deliberately do not stream the way deer do. A herd that reshuffles
 * as you cross a lattice boundary reads as wildlife moving about; a person doing
 * the same reads as a bug. So these are placed once, around the spawn, and walk
 * fixed routes there — few enough that they cost nothing to keep alive, and
 * always somewhere a player can go back and find.
 *
 * Quality still falls away with distance, because a villager on the far side of
 * a valley is as invisible as a deer is.
 */
export class WorldVillagerGroup {
  private readonly assets: VillagerAssets;
  private readonly villagers: VillagerSlot[] = [];
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    config: WorldConfig,
    profile: RuntimeProfile,
    spawn: THREE.Vector3,
    private readonly shadows: boolean,
    sampleHeight: (x: number, z: number) => number,
    contact: WorldTerrainContactSampler,
    createQuality: () => ActorAnimationQuality,
  ) {
    this.assets = createVillagerAssets();
    const count =
      config.faunaEnabled < 1
        ? 0
        : profile.compact
          ? config.faunaVillagerCompactCount
          : config.faunaVillagerDesktopCount;

    for (let index = 0; index < count; index += 1) {
      const angle = (index / Math.max(count, 1)) * Math.PI * 2;
      const centerX = spawn.x + Math.cos(angle) * FAUNA_VILLAGER_ROUTE_RADIUS;
      const centerZ = spawn.z + Math.sin(angle) * FAUNA_VILLAGER_ROUTE_RADIUS;
      const actor = new ScriptedHumanoidActor(
        scene,
        1,
        centerX,
        centerZ,
        this.assets,
        index,
        shadows,
        sampleHeight,
        contact,
      );
      actor.setReferenceSpeed(config.faunaVillagerWalkSpeed);
      this.villagers.push({
        actor,
        route: new VillagerRoute({
          centerX,
          centerZ,
          radius: FAUNA_VILLAGER_ROUTE_RADIUS,
          walkSpeed: config.faunaVillagerWalkSpeed,
          seed: index + 17,
        }),
        quality: createQuality(),
        steering: { targetX: centerX, targetZ: centerZ, desiredSpeed: 0 },
        castsShadow: shadows,
      });
    }
  }

  update(deltaSeconds: number, focus: THREE.Vector3): void {
    if (this.disposed) {
      return;
    }
    for (const villager of this.villagers) {
      const distance = villager.actor.position.distanceTo(focus);
      if (villager.quality.setDistance(distance)) {
        this.applyQuality(villager);
      }
      // The route always advances, so a villager whose animation is culled is
      // still walking its errand and is somewhere plausible on return.
      villager.route.update(
        deltaSeconds,
        villager.actor.position.x,
        villager.actor.position.z,
        villager.steering,
      );
      if (!villager.quality.shouldUpdate(deltaSeconds)) {
        continue;
      }
      villager.actor.update(
        villager.quality.takeAccumulatedSeconds(),
        villager.steering,
      );
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const villager of this.villagers) {
      villager.actor.dispose();
    }
    this.villagers.length = 0;
    this.assets.dispose();
  }

  /** Visibility, solver depth and shadow casting, set only on level changes. */
  private applyQuality(villager: VillagerSlot): void {
    const level = villager.quality.getLevel();
    villager.actor.object.visible = level !== ACTOR_QUALITY_CULLED;
    villager.actor.setQuality(
      villager.quality.runsIk(),
      villager.quality.runsSecondaryMotion(),
    );
    const casts = this.shadows && level === ACTOR_QUALITY_FULL;
    if (casts === villager.castsShadow) {
      return;
    }
    villager.castsShadow = casts;
    for (const mesh of villager.actor.meshes) {
      mesh.castShadow = casts;
    }
  }
}
