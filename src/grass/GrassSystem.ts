import type { GUI } from "dat.gui";
import * as THREE from "three";
import { disposeResources } from "../render/ResourceDisposal";
import type {
  GrassConfig,
  GrassImpostorConfig,
  GrassLodConfig,
  GrassQaConfig,
} from "./GrassConfig";
import { GrassConfigLoader } from "./internal/GrassConfigLoader";
import {
  GrassDistribution,
  type GrassPlacement,
} from "./GrassDistribution";
import {
  GrassGeometryFactory,
  type GrassGeometryVariants,
} from "./GrassGeometryFactory";
import { GrassLodController } from "./GrassLodController";
import {
  GrassLodLevel,
  GrassPatchGrid,
  type GrassPatch,
} from "./GrassPatchGrid";
import { GrassNearMaterial } from "./materials/GrassNearMaterial";
import { WindField } from "./wind/WindField";

interface GrassSystemDependencies {
  scene: THREE.Scene;
}

interface PatchBucket {
  id: string;
  gridX: number;
  gridZ: number;
  placements: GrassPlacement[];
}

type IslandGrassPatch = GrassPatch & { nearMesh: THREE.InstancedMesh };

export interface GrassDiagnostics {
  patchCount: number;
  patchesInFrustum: number;
  visibleNearPatches: number;
  visibleMidPatches: number;
  totalClumps: number;
  submittedNearClumps: number;
  submittedMidClumps: number;
}

export interface GrassImpostorBakeTarget {
  patchId: string;
  object: THREE.InstancedMesh;
  bounds: THREE.Box3;
}

const MID_WIND_SCALE = 0.62;
const LEGACY_DITHER_SEED = 0x85ebca6b;

export class GrassSystem {
  private readonly configLoader = new GrassConfigLoader();
  private readonly distribution = new GrassDistribution();
  private readonly geometryFactory = new GrassGeometryFactory();
  private readonly nearMaterial = new GrassNearMaterial({
    name: "grass-near-material",
    cacheKey: "grass-near-material-v17-legacy-near",
    ditherSeed: LEGACY_DITHER_SEED,
    worldLod: false,
  });
  private readonly midMaterial = new GrassNearMaterial({
    name: "grass-mid-material",
    cacheKey: "grass-near-material-v17-legacy-mid",
    invertLodCoverage: true,
    windLodScale: MID_WIND_SCALE,
    ditherSeed: LEGACY_DITHER_SEED,
    worldLod: false,
  });
  private readonly lodSamplePoint = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly wind = new WindField();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly sourceGeometries: THREE.BufferGeometry[] = [];
  private readonly worldBounds = new THREE.Box3();
  private patchGrid?: GrassPatchGrid;
  private lodController?: GrassLodController;
  private config?: GrassConfig;
  private initialization?: Promise<void>;
  private lodOverridden = false;
  private disposed = false;

  constructor(private readonly dependencies: GrassSystemDependencies) {}

  attachGui(gui: GUI): void {
    this.assertNotDisposed();
    this.nearMaterial.setupGUI(gui, [this.midMaterial]);
  }

  initialize(surface: THREE.Mesh): Promise<void> {
    this.assertNotDisposed();
    if (!this.initialization) {
      this.initialization = this.createGrass(surface);
    }
    return this.initialization;
  }

  update(deltaSeconds: number, camera: THREE.Camera): void {
    if (this.disposed) {
      return;
    }
    const elapsedSeconds = this.wind.update(deltaSeconds);
    this.nearMaterial.update(elapsedSeconds);
    this.midMaterial.update(elapsedSeconds);
    if (this.patchGrid && this.lodController) {
      this.lodController.update(camera, this.patchGrid.values());
    }
    this.updateLodThreshold(camera);
  }

  private updateLodThreshold(camera: THREE.Camera): void {
    const config = this.config;
    if (!config || this.lodOverridden || this.worldBounds.isEmpty()) {
      return;
    }
    camera.getWorldPosition(this.cameraPosition);
    this.worldBounds.clampPoint(this.cameraPosition, this.lodSamplePoint);
    const distance = this.cameraPosition.distanceTo(this.lodSamplePoint);
    const { nearMaxDistance, farMaxDistance, transitionDistance } = config.lod;
    const nearCoverage =
      1 -
      THREE.MathUtils.smoothstep(
        distance,
        nearMaxDistance - transitionDistance,
        nearMaxDistance + transitionDistance,
      );
    const distanceFade =
      1 -
      THREE.MathUtils.smoothstep(
        distance,
        farMaxDistance - transitionDistance,
        farMaxDistance + transitionDistance,
      );
    this.nearMaterial.setLodThreshold(nearCoverage);
    this.midMaterial.setLodThreshold(nearCoverage, distanceFade);
  }

  getBounds(): THREE.Box3 {
    this.assertReady();
    return this.worldBounds.clone();
  }

  setLodBakeOverride(enabled: boolean): void {
    this.assertReady();
    this.lodOverridden = enabled;
    if (enabled) {
      this.nearMaterial.setLodThreshold(1);
      this.midMaterial.setLodThreshold(1);
    }
  }

  getLodConfig(): GrassLodConfig {
    return this.assertReady().lod;
  }

  getQaConfig(): GrassQaConfig {
    return this.assertReady().qa;
  }

  getImpostorConfig(): GrassImpostorConfig {
    return this.assertReady().impostor;
  }

  getDiagnostics(): GrassDiagnostics {
    let patchCount = 0;
    let patchesInFrustum = 0;
    let visibleNearPatches = 0;
    let visibleMidPatches = 0;
    let totalClumps = 0;
    let submittedNearClumps = 0;
    let submittedMidClumps = 0;

    if (this.patchGrid) {
      for (const patch of this.patchGrid.values()) {
        patchCount += 1;
        totalClumps += patch.instanceCount;
        if (patch.inFrustum) {
          patchesInFrustum += 1;
        }
        if (patch.nearMesh?.visible) {
          visibleNearPatches += 1;
          submittedNearClumps += patch.instanceCount;
        }
        if (patch.midMesh.visible) {
          visibleMidPatches += 1;
          submittedMidClumps += patch.instanceCount;
        }
      }
    }

    return {
      patchCount,
      patchesInFrustum,
      visibleNearPatches,
      visibleMidPatches,
      totalClumps,
      submittedNearClumps,
      submittedMidClumps,
    };
  }

  getImpostorBakeTarget(): GrassImpostorBakeTarget | undefined {
    let selected: GrassPatch | undefined;
    if (this.patchGrid) {
      for (const patch of this.patchGrid.values()) {
        if (!selected || patch.instanceCount > selected.instanceCount) {
          selected = patch;
        }
      }
    }

    const bakeSource = selected?.nearMesh;
    return selected && bakeSource
      ? {
          patchId: selected.id.replace(":", "-"),
          object: bakeSource,
          bounds: selected.bounds.clone(),
        }
      : undefined;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const meshes = this.meshes.splice(0);
    const sourceGeometries = this.sourceGeometries.splice(0);
    this.patchGrid?.clear();
    this.patchGrid = undefined;
    this.lodController = undefined;
    this.worldBounds.makeEmpty();
    this.config = undefined;

    disposeResources([
      ...meshes.map((mesh) => ({
        dispose: () =>
          disposeResources([
            { dispose: () => this.dependencies.scene.remove(mesh) },
            { dispose: () => this.geometryFactory.disposeInstancedMesh(mesh) },
          ]),
      })),
      ...sourceGeometries,
      this.nearMaterial.material,
      this.midMaterial.material,
    ]);
  }

  private async createGrass(surface: THREE.Mesh): Promise<void> {
    const config = await this.configLoader.load();
    this.assertNotDisposed();
    this.config = config;
    const variants = this.geometryFactory.createLodVariants(
      config.geometry,
      config.distribution.seed,
    );
    this.assertNotDisposed();
    this.sourceGeometries.push(...variants.near, ...variants.mid);

    for (const material of [this.nearMaterial, this.midMaterial]) {
      material.configure(config.material, config.wind);
      material.configureLod(config.lod);
    }
    this.patchGrid = new GrassPatchGrid(config.patchSize);
    this.lodController = new GrassLodController(config.lod);
    this.worldBounds.makeEmpty();

    const placements = this.distribution.generate(
      surface,
      config.instanceCount,
      config.distribution,
    );
    this.assertNotDisposed();
    const buckets = this.createPatchBuckets(placements, this.patchGrid);

    for (const bucket of buckets.values()) {
      const patch = this.createPatch(bucket, variants, config);
      this.meshes.push(patch.nearMesh, patch.midMesh);
      this.dependencies.scene.add(patch.nearMesh, patch.midMesh);
      this.patchGrid.register(patch);
      this.worldBounds.union(patch.bounds);
    }

    console.info(
      `[FluffyGrass] Created ${buckets.size} grass patches from ${placements.length} clumps.`,
    );
  }

  private createPatchBuckets(
    placements: GrassPlacement[],
    grid: GrassPatchGrid,
  ): Map<string, PatchBucket> {
    const buckets = new Map<string, PatchBucket>();

    for (const placement of placements) {
      const id = grid.keyFor(placement.position);
      let bucket = buckets.get(id);
      if (!bucket) {
        const [gridX, gridZ] = grid.coordinatesFor(placement.position);
        bucket = { id, gridX, gridZ, placements: [] };
        buckets.set(id, bucket);
      }
      bucket.placements.push(placement);
    }

    return buckets;
  }

  private createPatch(
    bucket: PatchBucket,
    variants: GrassGeometryVariants,
    config: GrassConfig,
  ): IslandGrassPatch {
    const variantIndex =
      this.hashPatch(bucket.gridX, bucket.gridZ, config.distribution.seed) %
      config.geometry.variantCount;
    const variationValues = this.createVariationValues(bucket.placements);
    let nearMesh: THREE.InstancedMesh | undefined;
    let midMesh: THREE.InstancedMesh | undefined;
    try {
      nearMesh = this.createMesh(
        `grass-near-${bucket.id}`,
        variants.near[variantIndex],
        bucket.placements,
        variationValues,
        this.nearMaterial.material,
      );
      midMesh = this.createMesh(
        `grass-mid-${bucket.id}`,
        variants.mid[variantIndex],
        bucket.placements,
        variationValues,
        this.midMaterial.material,
      );
      midMesh.visible = false;

      const bounds = new THREE.Box3();
      if (nearMesh.boundingBox) {
        bounds.copy(nearMesh.boundingBox);
      }
      if (midMesh.boundingBox) {
        bounds.union(midMesh.boundingBox);
      }
      bounds.expandByScalar(
        config.wind.strength +
          config.wind.flutterStrength +
          config.geometry.bladeLeanMax,
      );
      const boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());

      return {
        id: bucket.id,
        gridX: bucket.gridX,
        gridZ: bucket.gridZ,
        bounds,
        boundingSphere,
        nearMesh,
        midMesh,
        instanceCount: bucket.placements.length,
        lod: GrassLodLevel.Near,
        distance: 0,
        inFrustum: true,
        nearCoverage: 1,
        midDistanceFade: 1,
      };
    } catch (error) {
      disposeIslandGrassMesh(this.geometryFactory, midMesh);
      disposeIslandGrassMesh(this.geometryFactory, nearMesh);
      throw error;
    }
  }

  private createMesh(
    name: string,
    sourceGeometry: THREE.BufferGeometry,
    placements: GrassPlacement[],
    variationValues: Float32Array,
    material: THREE.Material,
  ): THREE.InstancedMesh {
    const geometry = this.geometryFactory.createInstancedGeometry(
      sourceGeometry,
      variationValues,
    );
    let mesh: THREE.InstancedMesh | undefined;
    try {
      mesh = new THREE.InstancedMesh(
        geometry,
        material,
        placements.length,
      );
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.frustumCulled = false;

      placements.forEach((placement, index) => {
        mesh!.setMatrixAt(index, placement.matrix);
      });
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      return mesh;
    } catch (error) {
      if (mesh) {
        disposeIslandGrassMesh(this.geometryFactory, mesh);
      } else {
        try {
          this.geometryFactory.disposeInstancedGeometry(geometry);
        } catch (cleanupError) {
          console.warn(
            "[FluffyGrass] Unpublished grass geometry cleanup failed.",
            cleanupError,
          );
        }
      }
      throw error;
    }
  }

  private createVariationValues(placements: GrassPlacement[]): Float32Array {
    const values = new Float32Array(placements.length * 4);
    placements.forEach((placement, index) => {
      values.set(placement.variation, index * 4);
    });
    return values;
  }

  private hashPatch(gridX: number, gridZ: number, seed: number): number {
    let value = Math.imul(gridX, 374761393) + Math.imul(gridZ, 668265263) + seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value ^ (value >>> 16)) >>> 0;
  }

  private assertReady(): GrassConfig {
    this.assertNotDisposed();
    if (!this.config || this.worldBounds.isEmpty()) {
      throw new Error("GrassSystem is not initialized.");
    }
    return this.config;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("GrassSystem has been disposed.");
    }
  }
}

function disposeIslandGrassMesh(
  geometryFactory: GrassGeometryFactory,
  mesh: THREE.InstancedMesh | undefined,
): void {
  if (!mesh) {
    return;
  }
  try {
    geometryFactory.disposeInstancedMesh(mesh);
  } catch (cleanupError) {
    console.warn(
      "[FluffyGrass] Unpublished grass mesh cleanup failed.",
      cleanupError,
    );
  }
}
