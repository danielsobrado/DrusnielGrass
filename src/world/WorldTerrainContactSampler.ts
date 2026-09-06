import * as THREE from "three";
import type {
  ActorContactSample,
  ActorTerrainContactSampler,
} from "../actor/ik/ActorTerrainContact";
import type { TerrainField } from "./TerrainField";

/**
 * Adapts the world's terrain field to the actor contact-sampler contract.
 *
 * This is the only place the two know about each other: the actor animation
 * layer never imports terrain, and the terrain field never learns what a foot
 * is.
 */
export class WorldTerrainContactSampler implements ActorTerrainContactSampler {
  private readonly normal = new THREE.Vector3(0, 1, 0);

  constructor(private readonly field: TerrainField) {}

  sampleContact(
    worldX: number,
    worldZ: number,
    target: ActorContactSample,
  ): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
      target.height = 0;
      target.normalX = 0;
      target.normalY = 1;
      target.normalZ = 0;
      return;
    }
    target.height = this.field.sampleHeight(worldX, worldZ);
    this.field.sampleNormal(worldX, worldZ, this.normal);
    target.normalX = this.normal.x;
    target.normalY = this.normal.y;
    target.normalZ = this.normal.z;
  }
}
