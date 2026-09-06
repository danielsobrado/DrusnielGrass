import * as THREE from "three";

const PATCH_FLAG = "__fluffyGrassWorldIsolationHarness" as const;
const HUD_UPDATE_INTERVAL_MS = 500;
const VALIDATION_INTERVAL_MS = 500;
const MAX_ABS_TRANSFORM_VALUE = 1_000_000;
const MAX_ABS_POSITION_VALUE = 1_000_000;
const MIN_CAMERA_NEAR = 0.01;
const MAX_CAMERA_NEAR = 100;

export type GrassIsolationLayer =
  | "near"
  | "near-base"
  | "near-boost"
  | "near-bridge"
  | "near-detail"
  | "near-ultra"
  | "mid"
  | "far";

interface IsolationOptions {
  enabled: boolean;
  noGrass: boolean;
  noTerrain: boolean;
  noWater: boolean;
  noStones: boolean;
  noScenic: boolean;
  noCharacter: boolean;
  grassLayer?: GrassIsolationLayer;
  cameraNear?: number;
  basicMaterials: boolean;
  wireframe: boolean;
  validateGpu: boolean;
}

type SceneRenderHook = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  ...args: unknown[]
) => void;

interface ScenePrototype {
  onBeforeRender: SceneRenderHook;
  onAfterRender: SceneRenderHook;
  [PATCH_FLAG]?: boolean;
}

interface StoneRenderHooks {
  readonly original: THREE.Object3D["onBeforeRender"];
  readonly installed: THREE.Object3D["onBeforeRender"];
}

interface DebugRendererInfo {
  version: string;
  renderer: string;
  vendor: string;
  depthBits: number;
  maxTextureSize: number;
  maxVertexAttribs: number;
  vertexHighp: string;
  fragmentHighp: string;
}

interface ValidationIssue {
  key: string;
  message: string;
}

class IsolationState {
  private readonly overrideMaterial?: THREE.MeshBasicMaterial;
  private readonly overriddenScenes = new Map<
    THREE.Scene,
    THREE.Material | null
  >();
  private readonly hiddenObjects = new Map<THREE.Object3D, boolean>();
  private readonly originalCameraNear = new Map<THREE.PerspectiveCamera, number>();
  private readonly checkedStaticGeometries = new WeakSet<THREE.BufferGeometry>();
  private readonly reportedIssues = new Set<string>();
  private readonly trackedStoneMeshes = new Map<THREE.Mesh, StoneRenderHooks>();
  private readonly submittedStoneBatches = new Set<string>();
  private readonly hud?: HTMLPreElement;
  private rendererInfo?: DebugRendererInfo;
  private worldScene?: THREE.Scene;
  private lastHudUpdateMs = Number.NEGATIVE_INFINITY;
  private lastValidationMs = Number.NEGATIVE_INFINITY;
  private lastGlError = "NO_ERROR";
  private invalidValueCount = 0;
  private residentStoneBatches = 0;
  private renderHookActive = false;

  constructor(private readonly options: IsolationOptions) {
    if (options.basicMaterials || options.wireframe) {
      this.overrideMaterial = new THREE.MeshBasicMaterial({
        color: 0x9b9b9b,
        side: THREE.DoubleSide,
        wireframe: options.wireframe,
      });
      this.overrideMaterial.name = "debug-world-isolation-material";
    }
    this.hud = this.createHud();
    console.info(
      `[Drusniel World] Isolation harness enabled: ${this.describeOptions()}.`,
    );
  }

  beforeRender(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Object3D,
    camera: THREE.Camera,
  ): void {
    if (!(scene instanceof THREE.Scene)) {
      return;
    }

    const mainPass = renderer.getRenderTarget() === null;
    if (!this.worldScene) {
      if (!mainPass) {
        return;
      }
      this.worldScene = scene;
    }
    if (scene !== this.worldScene) {
      return;
    }

    if (mainPass) {
      this.renderHookActive = true;
      this.residentStoneBatches = 0;
      this.submittedStoneBatches.clear();
    }

    this.applyCameraNear(camera);
    this.applyVisibility(scene, mainPass);
    this.applyOverrideMaterial(scene);

    const now = performance.now();
    if (
      this.options.validateGpu &&
      now - this.lastValidationMs >= VALIDATION_INTERVAL_MS
    ) {
      this.lastValidationMs = now;
      this.validateScene(scene);
    }

    if (!this.rendererInfo) {
      this.rendererInfo = collectRendererInfo(renderer);
    }
  }

  afterRender(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Object3D,
    camera: THREE.Camera,
  ): void {
    if (scene !== this.worldScene || renderer.getRenderTarget() !== null) {
      return;
    }

    const now = performance.now();
    if (now - this.lastHudUpdateMs < HUD_UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastHudUpdateMs = now;
    this.lastGlError = readGlError(renderer.getContext());
    this.updateHud(renderer, camera);
  }

  dispose(): void {
    this.restoreVisibility();
    this.restoreCameraNearOverrides();
    this.restoreOverrideMaterials();
    this.restoreStoneMeshHooks();
    this.worldScene = undefined;
    this.overrideMaterial?.dispose();
    this.hud?.remove();
  }

  private applyCameraNear(camera: THREE.Camera): void {
    const cameraNear = this.options.cameraNear;
    if (
      cameraNear === undefined ||
      !(camera instanceof THREE.PerspectiveCamera)
    ) {
      return;
    }
    if (camera.near === cameraNear) {
      return;
    }
    if (!this.originalCameraNear.has(camera)) {
      this.originalCameraNear.set(camera, camera.near);
    }
    camera.near = cameraNear;
    camera.updateProjectionMatrix();
  }

  private restoreCameraNearOverrides(): void {
    const appliedNear = this.options.cameraNear;
    for (const [camera, originalNear] of this.originalCameraNear) {
      if (appliedNear !== undefined && camera.near === appliedNear) {
        camera.near = originalNear;
        camera.updateProjectionMatrix();
      }
    }
    this.originalCameraNear.clear();
  }

  private applyVisibility(
    scene: THREE.Object3D,
    trackStoneSubmissions: boolean,
  ): void {
    const residentStoneMeshes = trackStoneSubmissions
      ? new Set<THREE.Mesh>()
      : undefined;

    scene.traverse((object) => {
      const stoneObject = isStoneObject(object);
      if (residentStoneMeshes && stoneObject && object instanceof THREE.Mesh) {
        this.residentStoneBatches += 1;
        residentStoneMeshes.add(object);
        this.instrumentStoneMesh(object);
      }

      if (this.options.noCharacter && object.name === "drusniel-character") {
        this.hideObject(object);
        return;
      }

      if (this.options.noTerrain && isTerrainObject(object)) {
        this.hideObject(object);
        return;
      }

      if (this.options.noWater && isWaterObject(object)) {
        this.hideObject(object);
        return;
      }

      if (this.options.noStones && stoneObject) {
        this.hideObject(object);
        return;
      }

      if (this.options.noScenic && isScenicObject(object)) {
        this.hideObject(object);
        return;
      }

      const grassLayer = classifyGrassObject(object);
      if (!grassLayer) {
        return;
      }
      if (
        this.options.noGrass ||
        (this.options.grassLayer !== undefined &&
          !matchesGrassLayer(this.options.grassLayer, grassLayer))
      ) {
        this.hideObject(object);
      }
    });

    if (residentStoneMeshes) {
      this.pruneStoneMeshHooks(residentStoneMeshes);
    }
  }

  private hideObject(object: THREE.Object3D): void {
    if (!this.hiddenObjects.has(object)) {
      this.hiddenObjects.set(object, object.visible);
    }
    object.visible = false;
  }

  private restoreVisibility(): void {
    for (const [object, originalVisible] of this.hiddenObjects) {
      if (!object.visible) {
        object.visible = originalVisible;
      }
    }
    this.hiddenObjects.clear();
  }

  private instrumentStoneMesh(mesh: THREE.Mesh): void {
    if (this.trackedStoneMeshes.has(mesh)) {
      return;
    }

    const original = mesh.onBeforeRender;
    const installed: THREE.Object3D["onBeforeRender"] = (
      renderer,
      scene,
      camera,
      geometry,
      material,
      group,
    ) => {
      if (renderer.getRenderTarget() === null) {
        this.submittedStoneBatches.add(mesh.uuid);
      }
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
    mesh.onBeforeRender = installed;
    this.trackedStoneMeshes.set(mesh, { original, installed });
  }

  private pruneStoneMeshHooks(resident: ReadonlySet<THREE.Mesh>): void {
    for (const [mesh, hooks] of this.trackedStoneMeshes) {
      if (resident.has(mesh)) {
        continue;
      }
      if (mesh.onBeforeRender === hooks.installed) {
        mesh.onBeforeRender = hooks.original;
      }
      this.trackedStoneMeshes.delete(mesh);
    }
  }

  private restoreStoneMeshHooks(): void {
    for (const [mesh, hooks] of this.trackedStoneMeshes) {
      if (mesh.onBeforeRender === hooks.installed) {
        mesh.onBeforeRender = hooks.original;
      }
    }
    this.trackedStoneMeshes.clear();
    this.submittedStoneBatches.clear();
  }

  private applyOverrideMaterial(scene: THREE.Object3D): void {
    if (!this.overrideMaterial || !(scene instanceof THREE.Scene)) {
      return;
    }
    if (!this.overriddenScenes.has(scene)) {
      this.overriddenScenes.set(scene, scene.overrideMaterial);
    }
    scene.overrideMaterial = this.overrideMaterial;
  }

  private restoreOverrideMaterials(): void {
    for (const [scene, originalMaterial] of this.overriddenScenes) {
      if (scene.overrideMaterial === this.overrideMaterial) {
        scene.overrideMaterial = originalMaterial;
      }
    }
    this.overriddenScenes.clear();
  }

  private validateScene(scene: THREE.Object3D): void {
    let invalidCount = 0;
    scene.traverse((object) => {
      invalidCount += this.validateTransform(object);
      invalidCount += this.validateGeometry(object);
      invalidCount += this.validateInstances(object);
    });
    this.invalidValueCount = invalidCount;
  }

  private validateTransform(object: THREE.Object3D): number {
    const values = [
      object.position.x,
      object.position.y,
      object.position.z,
      object.quaternion.x,
      object.quaternion.y,
      object.quaternion.z,
      object.quaternion.w,
      object.scale.x,
      object.scale.y,
      object.scale.z,
      ...object.matrix.elements,
      ...object.matrixWorld.elements,
    ];
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (
        !Number.isFinite(value) ||
        Math.abs(value) > MAX_ABS_TRANSFORM_VALUE
      ) {
        this.reportIssue({
          key: `transform:${object.uuid}:${index}`,
          message: `${describeObject(object)} has invalid transform value ${value} at index ${index}`,
        });
        return 1;
      }
    }
    return 0;
  }

  private validateGeometry(object: THREE.Object3D): number {
    const geometry = getGeometry(object);
    if (!geometry) {
      return 0;
    }
    const position = geometry.getAttribute("position");
    if (!position || this.checkedStaticGeometries.has(geometry)) {
      return 0;
    }

    const values = position.array as ArrayLike<number>;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (
        !Number.isFinite(value) ||
        Math.abs(value) > MAX_ABS_POSITION_VALUE
      ) {
        this.reportIssue({
          key: `geometry:${geometry.uuid}:${index}`,
          message: `${describeObject(object)} has invalid geometry position ${value} at index ${index}`,
        });
        return 1;
      }
    }

    // getAttribute widens to BufferAttribute | InterleavedBufferAttribute, and
    // only the former carries `usage` -- an interleaved attribute inherits it
    // from the buffer it views.
    const positionUsage =
      position instanceof THREE.InterleavedBufferAttribute
        ? position.data.usage
        : position.usage;
    if (
      positionUsage !== THREE.DynamicDrawUsage &&
      positionUsage !== THREE.StreamDrawUsage
    ) {
      this.checkedStaticGeometries.add(geometry);
    }
    return 0;
  }

  private validateInstances(object: THREE.Object3D): number {
    if (!(object instanceof THREE.InstancedMesh)) {
      return 0;
    }
    const values = object.instanceMatrix.array as ArrayLike<number>;
    const valueCount = Math.min(values.length, object.count * 16);
    for (let index = 0; index < valueCount; index += 1) {
      const value = values[index];
      if (
        !Number.isFinite(value) ||
        Math.abs(value) > MAX_ABS_TRANSFORM_VALUE
      ) {
        this.reportIssue({
          key: `instance:${object.uuid}:${index}`,
          message: `${describeObject(object)} has invalid instance matrix value ${value} at index ${index}`,
        });
        return 1;
      }
    }
    return 0;
  }

  private reportIssue(issue: ValidationIssue): void {
    if (this.reportedIssues.has(issue.key)) {
      return;
    }
    this.reportedIssues.add(issue.key);
    console.error(`[Drusniel World] GPU isolation validation: ${issue.message}.`);
  }

  private createHud(): HTMLPreElement {
    const hud = document.createElement("pre");
    hud.id = "world-isolation-hud";
    hud.setAttribute("role", "status");
    hud.style.position = "fixed";
    hud.style.left = "8px";
    hud.style.bottom = "8px";
    hud.style.zIndex = "10000";
    hud.style.maxWidth = "calc(100vw - 16px)";
    hud.style.margin = "0";
    hud.style.padding = "8px 10px";
    hud.style.background = "rgba(0, 0, 0, 0.78)";
    hud.style.color = "#d9ffd9";
    hud.style.font = "11px/1.35 monospace";
    hud.style.whiteSpace = "pre-wrap";
    hud.style.pointerEvents = "none";
    document.body.appendChild(hud);
    hud.textContent = `Isolation debug\nhook=pending\n${this.describeOptions()}`;
    return hud;
  }

  private updateHud(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ): void {
    if (!this.hud) {
      return;
    }
    const info = this.rendererInfo;
    const render = renderer.info.render;
    const perspective =
      camera instanceof THREE.PerspectiveCamera ? camera : undefined;
    const lines = [
      "Isolation debug",
      `hook=${this.renderHookActive ? "active" : "pending"}`,
      this.describeOptions(),
      `stone batches=${this.submittedStoneBatches.size}/${this.residentStoneBatches} submitted/resident`,
      `viewport=${document.documentElement.dataset.viewport ?? "unknown"}`,
      `camera near=${perspective?.near ?? "n/a"} far=${perspective?.far ?? "n/a"}`,
      info ? `GPU=${info.renderer} | ${info.vendor}` : "GPU=unknown",
      info
        ? `${info.version} depth=${info.depthBits} maxTex=${info.maxTextureSize} attribs=${info.maxVertexAttribs}`
        : "WebGL=unknown",
      info
        ? `highp vertex=${info.vertexHighp} fragment=${info.fragmentHighp}`
        : "highp=unknown",
      `draws=${render.calls} tris=${render.triangles} lines=${render.lines} points=${render.points}`,
      `validateGpu=${this.options.validateGpu ? "on" : "off"} invalid=${this.invalidValueCount}`,
      `glError=${this.lastGlError}`,
    ];
    this.hud.textContent = lines.join("\n");
  }

  private describeOptions(): string {
    const flags: string[] = [];
    if (this.options.noGrass) flags.push("noGrass");
    if (this.options.noTerrain) flags.push("noTerrain");
    if (this.options.noWater) flags.push("noWater");
    if (this.options.noStones) flags.push("noStones");
    if (this.options.noScenic) flags.push("noScenic");
    if (this.options.noCharacter) flags.push("noCharacter");
    if (this.options.grassLayer) flags.push(`grass=${this.options.grassLayer}`);
    if (this.options.cameraNear !== undefined) {
      flags.push(`near=${this.options.cameraNear}`);
    }
    if (this.options.basicMaterials) flags.push("basicMaterials");
    if (this.options.wireframe) flags.push("wireframe");
    if (this.options.validateGpu) flags.push("validateGpu");
    return flags.length > 0 ? flags.join(" ") : "no isolation filters";
  }
}

export function installWorldIsolationHarness(
  params: URLSearchParams,
): { dispose(): void } | undefined {
  const options = resolveIsolationOptions(params);
  if (!options.enabled) {
    return undefined;
  }

  const prototype = THREE.Scene.prototype as unknown as ScenePrototype;
  if (prototype[PATCH_FLAG]) {
    console.warn("[Drusniel World] Isolation harness is already installed.");
    return undefined;
  }

  const originalBeforeRender = prototype.onBeforeRender;
  const originalAfterRender = prototype.onAfterRender;
  const beforeRenderWasOwn = Object.prototype.hasOwnProperty.call(
    prototype,
    "onBeforeRender",
  );
  const afterRenderWasOwn = Object.prototype.hasOwnProperty.call(
    prototype,
    "onAfterRender",
  );
  const originalPatchDescriptor = Object.getOwnPropertyDescriptor(
    prototype,
    PATCH_FLAG,
  );
  const state = new IsolationState(options);
  let disposed = false;
  const installedBeforeRender: SceneRenderHook = (
    renderer,
    scene,
    camera,
    ...args
  ) => {
    originalBeforeRender.call(scene, renderer, scene, camera, ...args);
    state.beforeRender(renderer, scene, camera);
  };
  const installedAfterRender: SceneRenderHook = (
    renderer,
    scene,
    camera,
    ...args
  ) => {
    originalAfterRender.call(scene, renderer, scene, camera, ...args);
    state.afterRender(renderer, scene, camera);
  };

  Object.defineProperty(prototype, PATCH_FLAG, {
    configurable: true,
    writable: true,
    value: true,
  });
  prototype.onBeforeRender = installedBeforeRender;
  prototype.onAfterRender = installedAfterRender;

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      restoreScenePrototypeHook(
        prototype,
        "onBeforeRender",
        installedBeforeRender,
        originalBeforeRender,
        beforeRenderWasOwn,
      );
      restoreScenePrototypeHook(
        prototype,
        "onAfterRender",
        installedAfterRender,
        originalAfterRender,
        afterRenderWasOwn,
      );
      restorePatchFlag(prototype, originalPatchDescriptor);
      state.dispose();
    },
  };
}

function restoreScenePrototypeHook(
  prototype: ScenePrototype,
  key: "onBeforeRender" | "onAfterRender",
  installed: SceneRenderHook,
  original: SceneRenderHook,
  wasOwn: boolean,
): void {
  if (prototype[key] !== installed) {
    return;
  }
  if (wasOwn) {
    prototype[key] = original;
    return;
  }
  delete (prototype as Partial<ScenePrototype>)[key];
}

function restorePatchFlag(
  prototype: ScenePrototype,
  originalDescriptor: PropertyDescriptor | undefined,
): void {
  if (prototype[PATCH_FLAG] !== true) {
    return;
  }
  if (originalDescriptor) {
    Object.defineProperty(prototype, PATCH_FLAG, originalDescriptor);
    return;
  }
  delete prototype[PATCH_FLAG];
}

function resolveIsolationOptions(params: URLSearchParams): IsolationOptions {
  const enabled = params.get("debug") === "1";
  const grassLayer = resolveGrassLayer(params.get("grassLayer"));
  return {
    enabled,
    noGrass: enabled && params.get("noGrass") === "1",
    noTerrain: enabled && params.get("noTerrain") === "1",
    noWater: enabled && params.get("noWater") === "1",
    noStones: enabled && params.get("noStones") === "1",
    noScenic: enabled && params.get("noScenic") === "1",
    noCharacter: enabled && params.get("noCharacter") === "1",
    grassLayer: enabled ? grassLayer : undefined,
    cameraNear: enabled ? resolveCameraNear(params.get("cameraNear")) : undefined,
    basicMaterials: enabled && params.get("basicMaterials") === "1",
    wireframe: enabled && params.get("wireframe") === "1",
    validateGpu: enabled && params.get("validateGpu") === "1",
  };
}

function resolveGrassLayer(
  value: string | null,
): GrassIsolationLayer | undefined {
  switch (value) {
    case "near":
    case "near-base":
    case "near-boost":
    case "near-bridge":
    case "near-detail":
    case "near-ultra":
    case "mid":
    case "far":
      return value;
    default:
      return undefined;
  }
}

function matchesGrassLayer(
  requested: GrassIsolationLayer,
  actual: GrassIsolationLayer,
): boolean {
  return requested === actual || (requested === "near" && actual.startsWith("near-"));
}

function resolveCameraNear(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return THREE.MathUtils.clamp(parsed, MIN_CAMERA_NEAR, MAX_CAMERA_NEAR);
}

function classifyGrassObject(
  object: THREE.Object3D,
): GrassIsolationLayer | undefined {
  const objectName = object.name.toLowerCase();
  const materialNames = getMaterialNames(object);
  const joinedMaterials = materialNames.join(" ");

  if (
    objectName.startsWith("world-grass-far-") ||
    joinedMaterials.includes("world-grass-subpatch-hemi-octahedral-impostor")
  ) {
    return "far";
  }
  if (
    objectName.startsWith("world-grass-mid-") ||
    joinedMaterials.includes("world-grass-mid-material")
  ) {
    return "mid";
  }
  if (
    objectName.startsWith("world-grass-near-density-boost") ||
    joinedMaterials.includes("world-grass-near-density-boost-material")
  ) {
    return "near-boost";
  }
  if (
    objectName.startsWith("world-grass-near-bridge") ||
    joinedMaterials.includes("world-grass-near-bridge-material")
  ) {
    return "near-bridge";
  }
  if (
    objectName.startsWith("world-grass-ultra-near-base-detail") ||
    joinedMaterials.includes("world-grass-base-detail-material")
  ) {
    return "near-detail";
  }
  if (
    objectName.startsWith("world-grass-ultra-near-blades") ||
    joinedMaterials.includes("world-grass-ultra-near-single-blade-material")
  ) {
    return "near-ultra";
  }
  if (
    objectName.startsWith("world-grass-single-blades") ||
    joinedMaterials.includes("world-grass-single-blade-material")
  ) {
    return "near-base";
  }
  if (
    objectName.startsWith("world-grass-") ||
    objectName.includes("detail-foliage") ||
    joinedMaterials.includes("grass") ||
    joinedMaterials.includes("foliage")
  ) {
    return "near";
  }
  return undefined;
}

function isTerrainObject(object: THREE.Object3D): boolean {
  const name = object.name.toLowerCase();
  return (
    name.startsWith("terrain-") ||
    name.startsWith("water-") ||
    name === "world-horizon-shell" ||
    name === "world-water-cascades"
  );
}

function isWaterObject(object: THREE.Object3D): boolean {
  const name = object.name.toLowerCase();
  return name.startsWith("water-") || name === "world-water-cascades";
}

function isStoneObject(object: THREE.Object3D): boolean {
  const name = object.name.toLowerCase();
  return (
    name.startsWith("world-stones-") ||
    getMaterialNames(object).some((value) => value.includes("world-stone-"))
  );
}

function isScenicObject(object: THREE.Object3D): boolean {
  const name = object.name.toLowerCase();
  return (
    name.startsWith("world-tree-") ||
    name.includes("deer") ||
    name.includes("villager") ||
    name.includes("fauna")
  );
}

function getMaterialNames(object: THREE.Object3D): string[] {
  const material = (object as THREE.Mesh).material as
    | THREE.Material
    | THREE.Material[]
    | undefined;
  if (!material) {
    return [];
  }
  return (Array.isArray(material) ? material : [material])
    .map((entry) => entry.name.toLowerCase())
    .filter((name) => name.length > 0);
}

function getGeometry(
  object: THREE.Object3D,
): THREE.BufferGeometry | undefined {
  const geometry = (object as THREE.Mesh).geometry;
  return geometry instanceof THREE.BufferGeometry ? geometry : undefined;
}

function describeObject(object: THREE.Object3D): string {
  return object.name.length > 0
    ? `${object.type}(${object.name})`
    : `${object.type}(${object.uuid})`;
}

function collectRendererInfo(
  renderer: THREE.WebGLRenderer,
): DebugRendererInfo {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as
    | {
        UNMASKED_RENDERER_WEBGL: number;
        UNMASKED_VENDOR_WEBGL: number;
      }
    | null;
  const rendererName = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const vendor = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
    : String(gl.getParameter(gl.VENDOR));

  return {
    version: String(gl.getParameter(gl.VERSION)),
    renderer: rendererName,
    vendor,
    depthBits: Number(gl.getParameter(gl.DEPTH_BITS)),
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    maxVertexAttribs: Number(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)),
    vertexHighp: describePrecision(
      gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT),
    ),
    fragmentHighp: describePrecision(
      gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT),
    ),
  };
}

function describePrecision(
  format: WebGLShaderPrecisionFormat | null,
): string {
  return format
    ? `p${format.precision} [${format.rangeMin},${format.rangeMax}]`
    : "unavailable";
}

function readGlError(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): string {
  const error = gl.getError();
  if (error === gl.NO_ERROR) {
    return "NO_ERROR";
  }
  return `0x${error.toString(16)}`;
}
