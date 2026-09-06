import type * as THREE from "three";

const MID_INDICES_PER_BLADE = 3;
const FAR_INDICES_PER_CARD = 6;

type GrassMeshKind =
  | "near-base"
  | "near-bridge"
  | "near-detail"
  | "near-ultra"
  | "near-boost"
  | "mid"
  | "far"
  | "accent";
type RenderCallback = THREE.InstancedMesh["onBeforeRender"];

interface RuntimeTile {
  bladeCount: number;
  mesh: THREE.InstancedMesh;
}

interface RuntimeTileField {
  tiles?: Map<number, RuntimeTile>;
}

/**
 * The accent layer's tiles carry a card count rather than a blade count, and a
 * card is not a blade equivalent, so they are instrumented for submission only
 * and stay out of the logical-blade totals.
 */
interface RuntimeAccentField {
  tiles?: Map<number, { mesh: THREE.InstancedMesh }>;
}

interface RuntimeNearField {
  baseField?: RuntimeTileField;
  bridgeField?: RuntimeTileField;
  baseDetailedField?: RuntimeTileField;
  ultraNearField?: RuntimeTileField;
  densityBoostField?: RuntimeTileField;
  detailFoliageField?: RuntimeAccentField;
}

interface RuntimePatch {
  instanceCount: number;
  inFrustum: boolean;
  midCoverage: number;
  farCoverage: number;
  midMesh: THREE.InstancedMesh;
}

interface RuntimeFarGroup {
  mesh: THREE.InstancedMesh;
}

interface RuntimeGrassSystem {
  initialized?: boolean;
  patches?: Set<RuntimePatch>;
  farGroups?: Set<RuntimeFarGroup>;
  nearField?: RuntimeNearField;
  nearBladesPerPatch?: number;
  midBladesPerPatch?: number;
}

interface RuntimeWorldApp {
  scene?: THREE.Scene;
  renderer?: THREE.WebGLRenderer;
  grass?: RuntimeGrassSystem;
}

interface FrameWorkload {
  nearBaseInstances: number;
  nearBridgeInstances: number;
  nearDetailInstances: number;
  nearUltraInstances: number;
  nearSubmittedTriangles: number;
  midSubmittedBlades: number;
  midSubmittedVertices: number;
  farSubmittedCards: number;
  accentSubmittedCards: number;
}

interface RenderHook {
  original: RenderCallback;
  wrapped: RenderCallback;
}

export interface WorldDiagnosticsRuntime {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  grass: RuntimeGrassSystem;
}

export interface GrassWorkloadSnapshot extends FrameWorkload {
  ready: boolean;
  residentPatchInstances: number;
  logicalBladeEquivalents: number;
  visibleLogicalBladeEquivalents: number;
  nearResidentUniqueInstances: number;
}

export function resolveWorldDiagnosticsRuntime(
  app: unknown,
): WorldDiagnosticsRuntime {
  const runtime = app as RuntimeWorldApp;
  if (!runtime.scene || !runtime.renderer || !runtime.grass) {
    throw new Error(
      "World diagnostics require scene, renderer, and grass systems.",
    );
  }
  return {
    scene: runtime.scene,
    renderer: runtime.renderer,
    grass: runtime.grass,
  };
}

export class GrassWorkloadProbe {
  private readonly meshKinds = new WeakMap<THREE.InstancedMesh, GrassMeshKind>();
  private readonly renderHooks = new Map<THREE.InstancedMesh, RenderHook>();
  private readonly activeMeshes = new Set<THREE.InstancedMesh>();
  private currentFrame = createEmptyFrameWorkload();
  private lastFrame = createEmptyFrameWorkload();

  constructor(private readonly grass: RuntimeGrassSystem) {}

  prepareFrame(): void {
    this.currentFrame = createEmptyFrameWorkload();
    this.activeMeshes.clear();
    const near = this.grass.nearField;
    this.instrumentTileField(near?.baseField, "near-base");
    this.instrumentTileField(near?.bridgeField, "near-bridge");
    this.instrumentTileField(near?.baseDetailedField, "near-detail");
    this.instrumentTileField(near?.ultraNearField, "near-ultra");
    this.instrumentTileField(near?.densityBoostField, "near-boost");
    for (const tile of near?.detailFoliageField?.tiles?.values() ?? []) {
      this.instrumentMesh(tile.mesh, "accent");
    }

    for (const patch of this.grass.patches ?? []) {
      this.instrumentMesh(patch.midMesh, "mid");
    }
    for (const group of this.grass.farGroups ?? []) {
      this.instrumentMesh(group.mesh, "far");
    }
    this.releaseInactiveHooks();
  }

  finishFrame(): void {
    this.lastFrame = this.currentFrame;
  }

  dispose(): void {
    for (const [mesh, hook] of this.renderHooks) {
      this.restoreHook(mesh, hook);
    }
    this.renderHooks.clear();
    this.activeMeshes.clear();
  }

  getSnapshot(): GrassWorkloadSnapshot {
    const near = this.grass.nearField;
    const nearResidentUniqueInstances =
      sumResidentInstances(near?.baseField) +
      sumResidentInstances(near?.ultraNearField) +
      sumResidentInstances(near?.densityBoostField);
    const nearBladesPerPatch = this.grass.nearBladesPerPatch ?? 0;
    const midBladesPerPatch = this.grass.midBladesPerPatch ?? 0;
    let residentPatchInstances = 0;
    let patchLogical = 0;
    let visiblePatchLogical = 0;

    for (const patch of this.grass.patches ?? []) {
      residentPatchInstances += patch.instanceCount;
      const logical = Math.round(
        patch.instanceCount *
          (patch.midCoverage * midBladesPerPatch +
            patch.farCoverage * nearBladesPerPatch),
      );
      patchLogical += logical;
      if (patch.inFrustum) {
        visiblePatchLogical += logical;
      }
    }

    return {
      ...this.lastFrame,
      ready: this.grass.initialized === true,
      residentPatchInstances,
      nearResidentUniqueInstances,
      logicalBladeEquivalents: nearResidentUniqueInstances + patchLogical,
      visibleLogicalBladeEquivalents:
        this.lastFrame.nearBaseInstances +
        this.lastFrame.nearBridgeInstances +
        this.lastFrame.nearUltraInstances +
        visiblePatchLogical,
    };
  }

  private instrumentTileField(
    field: RuntimeTileField | undefined,
    kind: GrassMeshKind,
  ): void {
    for (const tile of field?.tiles?.values() ?? []) {
      this.instrumentMesh(tile.mesh, kind);
    }
  }

  private instrumentMesh(
    mesh: THREE.InstancedMesh,
    kind: GrassMeshKind,
  ): void {
    this.activeMeshes.add(mesh);
    this.meshKinds.set(mesh, kind);
    if (this.renderHooks.has(mesh)) {
      return;
    }
    const original = mesh.onBeforeRender;
    const wrapped: RenderCallback = (
      renderer,
      scene,
      camera,
      geometry,
      material,
      group,
    ): void => {
      this.recordSubmission(mesh);
      original.call(
        mesh,
        renderer,
        scene,
        camera,
        geometry,
        material,
        group,
      );
    };
    this.renderHooks.set(mesh, { original, wrapped });
    mesh.onBeforeRender = wrapped;
  }

  private releaseInactiveHooks(): void {
    for (const [mesh, hook] of this.renderHooks) {
      if (this.activeMeshes.has(mesh)) {
        continue;
      }
      this.restoreHook(mesh, hook);
      this.renderHooks.delete(mesh);
      this.meshKinds.delete(mesh);
    }
  }

  private restoreHook(mesh: THREE.InstancedMesh, hook: RenderHook): void {
    if (mesh.onBeforeRender === hook.wrapped) {
      mesh.onBeforeRender = hook.original;
    }
  }

  private recordSubmission(mesh: THREE.InstancedMesh): void {
    const kind = this.meshKinds.get(mesh);
    if (!kind) {
      return;
    }
    const instances = Math.max(0, mesh.count);
    const submittedIndices = resolveSubmittedIndexCount(mesh.geometry);

    switch (kind) {
      case "near-base":
        this.currentFrame.nearBaseInstances += instances;
        this.addNearTriangles(instances, submittedIndices);
        break;
      case "near-bridge":
        this.currentFrame.nearBridgeInstances += instances;
        this.addNearTriangles(instances, submittedIndices);
        break;
      case "near-detail":
        this.currentFrame.nearDetailInstances += instances;
        this.addNearTriangles(instances, submittedIndices);
        break;
      case "near-ultra":
        this.currentFrame.nearUltraInstances += instances;
        this.addNearTriangles(instances, submittedIndices);
        break;
      case "mid":
        this.currentFrame.midSubmittedVertices += submittedIndices * instances;
        this.currentFrame.midSubmittedBlades +=
          Math.floor(submittedIndices / MID_INDICES_PER_BLADE) * instances;
        break;
      case "far":
        this.currentFrame.farSubmittedCards +=
          Math.floor(submittedIndices / FAR_INDICES_PER_CARD) * instances;
        break;
      case "accent":
        this.currentFrame.accentSubmittedCards += instances;
        break;
    }
  }

  private addNearTriangles(instances: number, submittedIndices: number): void {
    this.currentFrame.nearSubmittedTriangles +=
      Math.floor(submittedIndices / 3) * instances;
  }
}

function createEmptyFrameWorkload(): FrameWorkload {
  return {
    nearBaseInstances: 0,
    nearBridgeInstances: 0,
    nearDetailInstances: 0,
    nearUltraInstances: 0,
    nearSubmittedTriangles: 0,
    midSubmittedBlades: 0,
    midSubmittedVertices: 0,
    farSubmittedCards: 0,
    accentSubmittedCards: 0,
  };
}

function sumResidentInstances(field: RuntimeTileField | undefined): number {
  let total = 0;
  for (const tile of field?.tiles?.values() ?? []) {
    total += tile.bladeCount;
  }
  return total;
}

function resolveSubmittedIndexCount(geometry: THREE.BufferGeometry): number {
  const available =
    geometry.index?.count ?? geometry.getAttribute("position").count;
  const start = Math.max(0, geometry.drawRange.start);
  const remaining = Math.max(0, available - start);
  const requested = Number.isFinite(geometry.drawRange.count)
    ? Math.max(0, geometry.drawRange.count)
    : remaining;
  return Math.min(remaining, requested);
}
