import * as THREE from "three";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { TerrainField } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import { WorldTreeField, type WorldTreeInstance } from "./WorldTreeField";
import {
  TREE_CANOPY_RADIUS_SCALE,
  TREE_COMPACT_RADIUS,
  TREE_DESKTOP_RADIUS,
  TREE_REBUILD_STEP,
} from "./WorldScenicTuning";
import {
  createWorldTreeRenderResources,
  disposeWorldTreeRenderResources,
  type WorldTreeRenderResources,
} from "./WorldTreeRenderResources";
import {
  TREE_LOD_OVERLAP_METERS,
  TREE_LOD_UPDATE_STEP,
  TREE_LOD_VISIBLE_THRESHOLD,
  TREE_MAX_COUNT_COMPACT,
  TREE_MAX_COUNT_DESKTOP,
  TREE_NEAR_RADIUS_COMPACT,
  TREE_NEAR_RADIUS_DESKTOP,
  TREE_PHASE_X_SCALE,
  TREE_PHASE_Z_SCALE,
  TREE_SPECIES_CANOPY_RADIUS,
  TREE_WOOD_HORIZONTAL_SCALE,
  WORLD_TREE_SPECIES,
  type WorldTreeSpecies,
} from "./WorldTreeTuning";

const scratch = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);
const lean = new THREE.Vector3();
const TWO_PI = Math.PI * 2;

type SpeciesCounts = Record<WorldTreeSpecies, number>;

export class WorldTreeSystem {
  private readonly field: WorldTreeField;
  private readonly resources: WorldTreeRenderResources;
  private readonly radius: number;
  private readonly nearRadius: number;
  private readonly maxCount: number;
  private trees: WorldTreeInstance[] = [];
  private builtX = Number.NaN;
  private builtZ = Number.NaN;
  private publishedX = Number.NaN;
  private publishedZ = Number.NaN;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    terrain: TerrainField,
    config: WorldConfig,
    profile: RuntimeProfile,
    shadows: boolean,
    context?: WorldNodeMaterialContext,
  ) {
    this.field = new WorldTreeField(terrain, config);
    this.radius = profile.compact ? TREE_COMPACT_RADIUS : TREE_DESKTOP_RADIUS;
    this.nearRadius = profile.compact
      ? TREE_NEAR_RADIUS_COMPACT
      : TREE_NEAR_RADIUS_DESKTOP;
    this.maxCount = profile.compact
      ? TREE_MAX_COUNT_COMPACT
      : TREE_MAX_COUNT_DESKTOP;
    this.resources = createWorldTreeRenderResources(
      scene,
      this.maxCount,
      shadows,
      context,
    );
  }

  update(focus: THREE.Vector3): void {
    if (this.disposed) return;
    const rosterChanged = this.shouldRebuild(focus);
    if (rosterChanged) this.rebuildRoster(focus);
    if (!rosterChanged && !this.shouldPublish(focus)) return;
    this.publish(focus);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.trees.length = 0;
    disposeWorldTreeRenderResources(this.resources);
  }

  private rebuildRoster(focus: THREE.Vector3): void {
    this.builtX = focus.x;
    this.builtZ = focus.z;
    this.trees = this.field.collect(focus.x, focus.z, this.radius);
    this.trees.sort(
      (a, b) => distanceSquared(a, focus) - distanceSquared(b, focus),
    );
    if (this.trees.length > this.maxCount) {
      this.trees.length = this.maxCount;
    }
  }

  private publish(focus: THREE.Vector3): void {
    this.publishedX = focus.x;
    this.publishedZ = focus.z;
    const nearCounts = createSpeciesCounts();
    const farCounts = createSpeciesCounts();
    const overlapHalf = TREE_LOD_OVERLAP_METERS * 0.5;
    const fadeStart = Math.max(0, this.nearRadius - overlapHalf);
    const fadeEnd = this.nearRadius + overlapHalf;

    for (const tree of this.trees) {
      const distance = Math.sqrt(distanceSquared(tree, focus));
      const farOpacity = smoothstep(fadeStart, fadeEnd, distance);
      const nearOpacity = 1 - farOpacity;
      const canopyRadius =
        tree.canopyScale *
        TREE_CANOPY_RADIUS_SCALE *
        TREE_SPECIES_CANOPY_RADIUS[tree.species];
      if (nearOpacity > TREE_LOD_VISIBLE_THRESHOLD) {
        writeNearTree(
          this.resources,
          tree,
          canopyRadius,
          nearOpacity,
          nearCounts[tree.species]++,
        );
      }
      if (farOpacity > TREE_LOD_VISIBLE_THRESHOLD) {
        writeFarTree(
          this.resources,
          tree,
          canopyRadius,
          farOpacity,
          farCounts[tree.species]++,
        );
      }
    }
    publishCounts(this.resources, nearCounts, farCounts);
  }

  private shouldRebuild(focus: THREE.Vector3): boolean {
    return !Number.isFinite(this.builtX) ||
      Math.abs(focus.x - this.builtX) >= TREE_REBUILD_STEP ||
      Math.abs(focus.z - this.builtZ) >= TREE_REBUILD_STEP;
  }

  private shouldPublish(focus: THREE.Vector3): boolean {
    return !Number.isFinite(this.publishedX) ||
      Math.abs(focus.x - this.publishedX) >= TREE_LOD_UPDATE_STEP ||
      Math.abs(focus.z - this.publishedZ) >= TREE_LOD_UPDATE_STEP;
  }
}

function writeNearTree(
  resources: WorldTreeRenderResources,
  tree: WorldTreeInstance,
  canopyRadius: number,
  opacity: number,
  index: number,
): void {
  const meshes = resources.species[tree.species];
  setTreeTransform(tree, canopyRadius * TREE_WOOD_HORIZONTAL_SCALE, tree.height);
  meshes.wood.setMatrixAt(index, scratch.matrix);
  meshes.woodOpacity.setX(index, opacity);
  setTreeTransform(tree, canopyRadius, tree.height);
  meshes.foliage.setMatrixAt(index, scratch.matrix);
  meshes.foliagePhase.setX(index, treeWindPhase(tree));
  meshes.foliageOpacity.setX(index, opacity);
}

function writeFarTree(
  resources: WorldTreeRenderResources,
  tree: WorldTreeInstance,
  canopyRadius: number,
  opacity: number,
  index: number,
): void {
  const meshes = resources.species[tree.species];
  setTreeTransform(tree, canopyRadius, tree.height);
  meshes.far.setMatrixAt(index, scratch.matrix);
  meshes.farPhase.setX(index, treeWindPhase(tree));
  meshes.farOpacity.setX(index, opacity);
}

function setTreeTransform(
  tree: WorldTreeInstance,
  horizontalScale: number,
  height: number,
): void {
  lean.set(tree.leanX, 1, tree.leanZ).normalize();
  scratch.position.set(tree.x, tree.y, tree.z);
  scratch.quaternion.setFromUnitVectors(up, lean);
  scratch.rotateY(tree.yaw);
  scratch.scale.set(horizontalScale, height, horizontalScale);
  scratch.updateMatrix();
}

function publishCounts(
  resources: WorldTreeRenderResources,
  near: SpeciesCounts,
  far: SpeciesCounts,
): void {
  for (const species of WORLD_TREE_SPECIES) {
    const meshes = resources.species[species];
    meshes.wood.count = near[species];
    meshes.foliage.count = near[species];
    meshes.far.count = far[species];
    meshes.wood.instanceMatrix.needsUpdate = true;
    meshes.foliage.instanceMatrix.needsUpdate = true;
    meshes.far.instanceMatrix.needsUpdate = true;
    meshes.woodOpacity.needsUpdate = true;
    meshes.foliagePhase.needsUpdate = true;
    meshes.foliageOpacity.needsUpdate = true;
    meshes.farPhase.needsUpdate = true;
    meshes.farOpacity.needsUpdate = true;
  }
}

function createSpeciesCounts(): SpeciesCounts {
  return { oak: 0, birch: 0, evergreen: 0 };
}

function distanceSquared(
  tree: WorldTreeInstance,
  focus: THREE.Vector3,
): number {
  const dx = tree.x - focus.x;
  const dz = tree.z - focus.z;
  return dx * dx + dz * dz;
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const t = (value - minimum) / (maximum - minimum);
  return t * t * (3 - 2 * t);
}

function treeWindPhase(tree: WorldTreeInstance): number {
  const phase =
    tree.yaw + tree.x * TREE_PHASE_X_SCALE + tree.z * TREE_PHASE_Z_SCALE;
  return ((phase % TWO_PI) + TWO_PI) % TWO_PI;
}
