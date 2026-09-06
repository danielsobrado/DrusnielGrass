import * as THREE from "three";
import type { TerrainField } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import type { CascadeSite } from "./WaterCascadeSites";
import { createWaterCascadeGeometry } from "./WaterCascadeGeometry";
import { WaterCascadeMaterialController } from "./WaterCascadeMaterialController";

/** Beyond the streamed terrain there is no ground for a fall to sit on. */
const CASCADE_REBUILD_DISTANCE = 48;
const CASCADE_MAX_SITES = 24;

/**
 * Owns every waterfall curtain in view as one mesh.
 *
 * Cascades are rare — a handful within the streamed ring — so they do not
 * belong in the per-chunk build. Rebuilding one merged mesh when the focus
 * moves keeps them to a single draw call and, more importantly, keeps their
 * geometry completely independent of which LOD the terrain chunk beneath them
 * happens to be at. That independence is the whole point: a ledge carved into
 * a 10.67 m heightfield flattens into a ramp at distance, while this curtain
 * holds its vertical silhouette at any range.
 */
export class WorldCascadeSystem {
  private readonly materialController: WaterCascadeMaterialController;
  private mesh?: THREE.Mesh;
  private builtX = Number.POSITIVE_INFINITY;
  private builtZ = Number.POSITIVE_INFINITY;
  private readonly sites: CascadeSite[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly field: TerrainField,
    private readonly config: WorldConfig,
    private readonly radius: number,
    compact: boolean,
  ) {
    this.materialController = new WaterCascadeMaterialController(config, compact);
  }

  update(position: THREE.Vector3, elapsedSeconds: number): void {
    this.materialController.update(elapsedSeconds);
    if (
      Math.abs(position.x - this.builtX) < CASCADE_REBUILD_DISTANCE &&
      Math.abs(position.z - this.builtZ) < CASCADE_REBUILD_DISTANCE
    ) {
      return;
    }
    this.builtX = position.x;
    this.builtZ = position.z;
    this.rebuild(position);
  }

  dispose(): void {
    this.clearMesh();
    this.materialController.dispose();
  }

  private rebuild(position: THREE.Vector3): void {
    this.sites.length = 0;
    this.field.forEachCascade(
      position.x - this.radius,
      position.x + this.radius,
      position.z - this.radius,
      position.z + this.radius,
      (site) => {
        if (this.sites.length < CASCADE_MAX_SITES) this.sites.push(site);
      },
    );

    this.clearMesh();
    const geometry = createWaterCascadeGeometry(this.sites);
    if (!geometry) return;
    this.mesh = new THREE.Mesh(geometry, this.materialController.material);
    this.mesh.name = "world-water-cascades";
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Above the water sheet: a curtain stands in front of the river it feeds.
    this.mesh.renderOrder = this.config.waterfallEnabled >= 1 ? 4 : 0;
    this.scene.add(this.mesh);
  }

  private clearMesh(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = undefined;
  }
}
