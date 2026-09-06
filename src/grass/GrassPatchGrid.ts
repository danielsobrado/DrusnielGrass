import * as THREE from "three";

export enum GrassLodLevel {
  Near = 0,
  Mid = 1,
  Far = 2,
  Terrain = 3,
}

export interface GrassPatch {
  id: string;
  gridX: number;
  gridZ: number;
  bounds: THREE.Box3;
  boundingSphere: THREE.Sphere;
  // The streamed three-stage world path has no near clump mesh: single-blade
  // tiles own everything inside the near band. Only the legacy two-stage
  // island path still builds one.
  nearMesh?: THREE.InstancedMesh;
  midMesh: THREE.InstancedMesh;
  /**
   * Legacy island path only. The streamed world emits one far-card mesh per
   * 64 m chunk instead of one per 32 m render batch: a chunk is angularly tiny
   * past 44 m, so the finer culling granularity bought nothing while
   * quadrupling the draw calls of the layer that owns most of them.
   */
  farMesh?: THREE.InstancedMesh;
  /** True when a chunk-level far group covers this patch's band. */
  hasFarImpostor?: boolean;
  /**
   * Mid blade dithers, descending, matching the mid geometry's triangle order.
   * Present only on patches whose mid draw can be prefix-trimmed.
   */
  midSortedDithers?: Float32Array;
  /**
   * Unfaded per-instance coverage, indexed with the live instance buffers.
   * Compacted with those buffers so streaming fade and mid-instance culling
   * stay on the same slots.
   */
  baseMidCoverage?: Float32Array;
  instanceCount: number;
  lod: GrassLodLevel;
  distance: number;
  inFrustum: boolean;
  nearCoverage: number;
  midCoverage?: number;
  farCoverage?: number;
  midDistanceFade?: number;
}

/**
 * A chunk-sized batch of far impostor cards. Far cards are drawn one mesh per
 * streamed chunk rather than per render batch, so this is what the LOD
 * controller iterates for the far band.
 */
export interface GrassFarGroup {
  bounds: THREE.Box3;
  boundingSphere: THREE.Sphere;
  mesh: THREE.InstancedMesh;
  distance: number;
  inFrustum: boolean;
}

export class GrassPatchGrid {
  private readonly patches = new Map<string, GrassPatch>();

  constructor(readonly patchSize: number) {}

  keyFor(position: THREE.Vector3): string {
    return this.key(
      Math.floor(position.x / this.patchSize),
      Math.floor(position.z / this.patchSize),
    );
  }

  coordinatesFor(position: THREE.Vector3): readonly [number, number] {
    return [
      Math.floor(position.x / this.patchSize),
      Math.floor(position.z / this.patchSize),
    ];
  }

  register(patch: GrassPatch): void {
    if (this.patches.has(patch.id)) {
      throw new Error(`Grass patch ${patch.id} is already registered.`);
    }

    this.patches.set(patch.id, patch);
  }

  values(): IterableIterator<GrassPatch> {
    return this.patches.values();
  }

  clear(): void {
    this.patches.clear();
  }

  private key(gridX: number, gridZ: number): string {
    return `${gridX}:${gridZ}`;
  }
}
