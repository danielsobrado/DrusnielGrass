import * as THREE from "three";
import type Stats from "stats-gl";
import {
  GRASS_ART_DIRECTIONS,
  resolveGrassArtDirectionKey,
  type GrassArtDirection,
} from "../grass/GrassArtDirection";
import { grassTrailField } from "../grass/interaction/GrassTrailField";
import { FlyWorldController } from "../controls/FlyWorldController";
import { ThirdPersonController } from "../controls/ThirdPersonController";
import type { WorldController } from "../controls/WorldController";
import type { SnowflowCharacter } from "../character/SnowflowCharacter";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { resolvePixelRatio, resolveViewportSize } from "../runtime/ViewportSizing";
import { WORLD_TONE_MAPPING } from "./WorldEnvironmentTuning";
import { APP_VERSION } from "../version";
import { DenseSpawnLocator } from "../world/DenseSpawnLocator";
import { StoneField } from "../world/stones/StoneField";
import { WorldStoneSystem } from "../world/stones/WorldStoneSystem";
import { TerrainField } from "../world/TerrainField";
import { TerrainStreamer } from "../world/TerrainStreamer";
import type { WorldConfig } from "../world/WorldConfig";
import { setGrassPaletteDesaturation } from "../grass/materials/GrassPaletteShader";
import { WorldConfigLoader } from "../world/WorldConfigLoader";
import { WorldGrassSystem } from "../world/WorldGrassSystem";
import { GrassArtMenu } from "./GrassArtMenu";
import { DetailFoliageTuningMenu } from "./DetailFoliageTuningMenu";
import { WorldEnvironmentController } from "./WorldEnvironmentController";
import { WorldMinimap } from "./WorldMinimap";
import { WorldFrameMetrics, type WorldFrameSubsystem } from "./WorldFrameMetrics";
import { WorldRuntimeGuard } from "./WorldRuntimeGuard";
import { WorldStatusHud } from "./WorldStatusHud";
import { attachWorldStatsPanel } from "./WorldStatsPanel";
import type { WorldActorProofContext } from "./WorldActorProofContext";
import type { WorldVisualMatrixContext } from "./WorldVisualMatrixContext";
import { WorldRevealController } from "../runtime/WorldRevealController";
import { WorldScenicLayer } from "../world/scenic/WorldScenicLayer";
import {
  WORLD_COMPACT_GRASS_BUILD_RESERVE_MS,
  WORLD_COMPACT_STONE_BUILD_RESERVE_MS,
  WORLD_COMPACT_STREAMING_BUILD_BUDGET_MS,
  WORLD_DESKTOP_GRASS_BUILD_RESERVE_MS,
  WORLD_DESKTOP_STONE_BUILD_RESERVE_MS,
  WORLD_DESKTOP_STREAMING_BUILD_BUDGET_MS,
  WORLD_FRAME_STALL_THRESHOLD_MS,
  WORLD_FRAME_WATCHDOG_INTERVAL_MS,
  WORLD_MAX_RUNTIME_DELTA_SECONDS,
} from "./WorldAppTuning";

export class WorldApp {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private stats?: Stats;
  private artMenu?: GrassArtMenu;
  private detailFoliageMenu?: DetailFoliageTuningMenu;
  private riverArtMenu?: { dispose(): void };
  private readonly field: TerrainField;
  private readonly frameObservers = new Set<(deltaSeconds: number) => void>();
  private readonly terrain: TerrainStreamer;
  private readonly stones: WorldStoneSystem;
  private readonly grass: WorldGrassSystem;
  private readonly controls: WorldController;
  private readonly minimap: WorldMinimap;
  private readonly environment: WorldEnvironmentController;
  private readonly scenic: WorldScenicLayer;
  private readonly reveal: WorldRevealController;
  private readonly frameMetrics = new WorldFrameMetrics();
  private readonly runtimeGuard: WorldRuntimeGuard;
  private readonly statusHud = new WorldStatusHud(document.querySelector<HTMLElement>("#world-stats"));
  private readonly drawingBufferSize = new THREE.Vector2();
  private pixelRatio = 1;
  private readonly flyMode: boolean;
  private frameHandle = 0;
  private watchdogHandle = 0;
  private streamingBuildDeadline = Number.POSITIVE_INFINITY;
  private lastFrameTimestamp = performance.now();
  private sampledGroundX = Number.NaN;
  private sampledGroundZ = Number.NaN;
  private sampledGroundHeight = 0;
  private running = false;
  private disposed = false;
  private controlsEnabled = true;
  private terrainEnabled = true;
  private stonesEnabled = true;
  private grassEnabled = true;
  private rendererEnabled = true;
  private hudEnabled = true;
  private grassInitializing = true;
  private grassInitializationError?: string;

  private constructor(
    canvas: HTMLCanvasElement,
    private readonly profile: RuntimeProfile,
    private readonly worldConfig: WorldConfig,
  ) {
    const config = this.worldConfig;
    this.camera = new THREE.PerspectiveCamera(
      profile.cameraFov,
      resolveViewportSize().aspect,
      0.1,
      5000,
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      precision: "highp",
      powerPreference: "high-performance",
    });

    let environment: WorldEnvironmentController | undefined;
    let terrain: TerrainStreamer | undefined;
    let stones: WorldStoneSystem | undefined;
    let grass: WorldGrassSystem | undefined;
    let controls: WorldController | undefined;
    let minimap: WorldMinimap | undefined;
    let scenic: WorldScenicLayer | undefined;
    let reveal: WorldRevealController | undefined;
    let runtimeGuard: WorldRuntimeGuard | undefined;

    try {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = WORLD_TONE_MAPPING;
      this.renderer.shadowMap.enabled = profile.shadows;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.applyRendererSize();

      this.field = new TerrainField(config);
      const stoneField = new StoneField(this.field, config);
      const spawn = new DenseSpawnLocator(this.field, config, stoneField).find();
      const params = new URLSearchParams(window.location.search);
      const useFlyControls =
        params.get("control") === "fly" || params.get("view") === "aerial";
      this.flyMode = useFlyControls;
      if (params.get("view") === "aerial") {
        spawn.position.y += 48;
        spawn.pitch = THREE.MathUtils.degToRad(-34);
      }

      environment = new WorldEnvironmentController(
        this.scene,
        this.renderer,
        profile,
        profile.shadows && !useFlyControls,
      );
      this.environment = environment;
      terrain = new TerrainStreamer(
        this.scene,
        this.field,
        config,
        profile.compact,
        profile.shadows && !useFlyControls,
      );
      this.terrain = terrain;
      stones = new WorldStoneSystem(
        this.scene,
        stoneField,
        config,
        profile.compact,
        profile.shadows && !useFlyControls,
      );
      this.stones = stones;
      grass = new WorldGrassSystem(this.scene, this.field, config, profile);
      this.grass = grass;

      const tierOverride = params.get("tier");
      if (tierOverride !== null && /^\d+$/.test(tierOverride)) {
        this.grass.setQualityTierOverride(Number(tierOverride));
      }
      this.applyGrassViewportScale();
      grassTrailField.configure({
        resolution: config.grassTrailResolution,
        coverage: config.grassTrailCoverage,
        recoveryRate: config.grassTrailRecoveryRate,
        freshnessRate: config.grassTrailFreshnessRate,
      });
      if (!useFlyControls) {
        grassTrailField.attach(this.renderer);
      }
      const artKey = resolveGrassArtDirectionKey(params.get("grassArt"));
      this.applyGrassArtDirection(GRASS_ART_DIRECTIONS[artKey]);
      if (profile.showGui && params.get("diagnostics") === "1") {
        this.artMenu = new GrassArtMenu(artKey, this.applyGrassArtDirection);
        this.detailFoliageMenu = new DetailFoliageTuningMenu(
          this.grass.getDetailFoliageTuning(),
          (tuning) => this.grass.setDetailFoliageTuning(tuning));
      }

      controls = useFlyControls
        ? new FlyWorldController(
            this.camera,
            canvas,
            config,
            profile,
            spawn,
            this.field,
          )
        : new ThirdPersonController(
            this.scene,
            this.camera,
            canvas,
            this.field,
            config,
            profile,
            spawn,
          );
      this.controls = controls;
      minimap = new WorldMinimap(this.field, config, this.controls);
      this.minimap = minimap;
      scenic = new WorldScenicLayer(
        this.scene,
        this.field,
        config,
        profile,
        spawn.position,
        profile.shadows && !useFlyControls,
      );
      this.scenic = scenic;

      console.info(
        `[Drusniel World] Dense ground spawn X ${spawn.position.x.toFixed(0)} / Z ${spawn.position.z.toFixed(0)} / suitability ${spawn.suitability.toFixed(3)} / controls ${this.controls.getMode()}.`,
      );
      this.environment.updateShadow(this.controls.getStreamingPosition());
      reveal = new WorldRevealController();
      this.reveal = reveal;
      runtimeGuard = new WorldRuntimeGuard(
        canvas,
        this.handleResize,
        (enabled) => {
          this.rendererEnabled = enabled;
          if (enabled && !useFlyControls) {
            this.disposeSafely("Grass trail context restore", () =>
              grassTrailField.configure({}),
            );
          }
        },
      );
      this.runtimeGuard = runtimeGuard;
    } catch (error) {
      disposeConstructionSafely("Runtime guard", () => runtimeGuard?.dispose());
      disposeConstructionSafely("World reveal", () => reveal?.dispose());
      disposeConstructionSafely("Scenic layer", () => scenic?.dispose());
      disposeConstructionSafely("Minimap", () => minimap?.dispose());
      disposeConstructionSafely("World controls", () => controls?.dispose());
      disposeConstructionSafely("Detail foliage menu", () => this.detailFoliageMenu?.dispose());
      disposeConstructionSafely("Grass art menu", () => this.artMenu?.dispose());
      disposeConstructionSafely("Grass trail field", () => grassTrailField.dispose());
      disposeConstructionSafely("Grass system", () => grass?.dispose());
      disposeConstructionSafely("Stone system", () => stones?.dispose());
      disposeConstructionSafely("Terrain streamer", () => terrain?.dispose());
      disposeConstructionSafely("Environment", () => environment?.dispose());
      disposeConstructionSafely("Renderer", () => this.renderer.dispose());
      throw error;
    }
  }

  static async create(
    canvas: HTMLCanvasElement,
    profile: RuntimeProfile,
  ): Promise<WorldApp> {
    const params = new URLSearchParams(window.location.search);
    const loaded = await new WorldConfigLoader().load(
      `./config/world.yaml?v=${encodeURIComponent(APP_VERSION)}`,
    );
    const config =
      params.get("riverTuning") === "1"
        ? (await import("../dev/RiverDevelopmentConfig")).applyRiverDevelopmentConfig(
            loaded,
          )
        : loaded;
    // Before anything resolves a palette. `TerrainSurfacePalette` balances its
    // rows in its own constructor and the grass materials do the same at build,
    // so a lever applied after this point would reach some LODs and not others
    // — which is the one failure a global saturation control must not have.
    setGrassPaletteDesaturation(config.grassPaletteDesaturation);
    const app = new WorldApp(canvas, profile, config);
    if (profile.showGui && params.get("riverTuning") === "1") {
      try {
        await app.attachRiverArtMenu();
      } catch (error) {
        console.warn("[Drusniel World] Optional river tuning unavailable.", error);
      }
    }
    if (
      !profile.compact &&
      params.get("stats") === "1"
    ) {
      const stats = await attachWorldStatsPanel(app.renderer);
      if (app.disposed) {
        stats?.dom.remove();
      } else {
        app.stats = stats;
      }
    }
    void app.initializeGrass();
    return app;
  }

  start(): void {
    if (this.running || this.disposed) {
      return;
    }
    this.running = true;
    this.clock.start();
    this.lastFrameTimestamp = performance.now();
    this.frameHandle = requestAnimationFrame(this.render);
    this.watchdogHandle = window.setInterval(
      this.checkFrameHeartbeat,
      WORLD_FRAME_WATCHDOG_INTERVAL_MS,
    );
  }

  getThirdPersonCharacter(): SnowflowCharacter | undefined {
    return this.controls instanceof ThirdPersonController
      ? this.controls.getCharacter()
      : undefined;
  }

  addFrameObserver(observer: (deltaSeconds: number) => void): () => void {
    this.frameObservers.add(observer);
    return () => {
      this.frameObservers.delete(observer);
    };
  }

  /**
   * Development-only hook for the actor extensibility proof (`?actorProof=1`).
   *
   * Hands a standalone actor the scene and terrain it needs plus a per-frame
   * subscription. Nothing on the production path calls this, and the proof
   * module is only imported when its query parameter is present.
   */
  attachActorProof(
    observer: (deltaSeconds: number) => void,
  ): WorldActorProofContext {
    this.frameObservers.add(observer);
    return {
      scene: this.scene,
      field: this.field,
      detach: (): void => {
        this.frameObservers.delete(observer);
      },
    };
  }

  /** Development-only hook for `?qa=visual-matrix`. */
  attachVisualMatrix(): WorldVisualMatrixContext {
    this.grass.setQualityTierOverride(1);
    return {
      camera: this.camera,
      renderer: this.renderer,
      field: this.field,
      profile: this.profile,
      controls: this.controls,
      isReady: () => !this.grassInitializing && this.grassEnabled,
    };
  }

  /** Development-only hook for `?riverTuning=1`. */
  async attachRiverArtMenu(): Promise<void> {
    if (this.disposed || this.riverArtMenu || !this.profile.showGui) {
      return;
    }
    const { RiverArtMenu } = await import("./RiverArtMenu");
    if (this.disposed || this.riverArtMenu) {
      return;
    }
    this.riverArtMenu = new RiverArtMenu({
      worldConfig: this.worldConfig,
      field: this.field,
      controls: this.controls,
      applyLiveWaterVisuals: (visuals) => {
        this.terrain.setLiveWaterVisuals(visuals);
      },
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.running = false;
    this.frameObservers.clear();
    this.clock.stop();
    cancelAnimationFrame(this.frameHandle);
    window.clearInterval(this.watchdogHandle);
    this.disposeSafely("Runtime guard", () => this.runtimeGuard.dispose());
    this.disposeSafely("World reveal", () => this.reveal.dispose());
    this.disposeSafely("Scenic layer", () => this.scenic.dispose());
    this.disposeSafely("Minimap", () => this.minimap.dispose());
    this.disposeSafely("World controls", () => this.controls.dispose());
    this.disposeSafely("Terrain streamer", () => this.terrain.dispose());
    this.disposeSafely("Stone system", () => this.stones.dispose());
    this.disposeGrassResources();
    this.disposeSafely("Stats panel", () => this.stats?.dom.remove());
    this.stats = undefined;
    this.disposeSafely("Grass art menu", () => this.artMenu?.dispose());
    this.disposeSafely("Detail foliage menu", () => this.detailFoliageMenu?.dispose());
    this.disposeSafely("River art menu", () => this.riverArtMenu?.dispose());
    this.artMenu = undefined;
    this.detailFoliageMenu = undefined;
    this.riverArtMenu = undefined;
    this.disposeSafely("Environment", () => this.environment.dispose());
    this.disposeSafely("Renderer", () => this.renderer.dispose());
  }

  private readonly applyGrassArtDirection = (
    direction: GrassArtDirection,
  ): void => {
    if (this.disposed) {
      return;
    }
    this.terrain.setGrassArtDirection(direction);
    this.grass.setArtDirection(direction);
    this.environment.applyArtDirection(direction);
  };

  private async initializeGrass(): Promise<void> {
    try {
      await this.grass.initialize();
      if (this.disposed) {
        return;
      }
      if (new URLSearchParams(window.location.search).get("accentAtlas") === "1") {
        const atlas = this.grass.getDetailFoliageAtlas();
        if (atlas) {
          const { appendDetailFoliageAtlasDebugCanvas } = await import(
            "../world/grass/WorldDetailFoliageAtlasDebug"
          );
          if (!this.disposed) {
            appendDetailFoliageAtlasDebugCanvas(atlas);
          }
        }
      }
    } catch (error) {
      if (this.disposed) {
        return;
      }
      console.error("[Drusniel World] Grass initialization failed.", error);
      this.grassInitializationError = this.runtimeGuard.formatError(error);
      this.grassEnabled = false;
      this.disposeGrassResources();
    } finally {
      if (!this.disposed) {
        this.grassInitializing = false;
        this.lastFrameTimestamp = performance.now();
      }
    }
  }

  private render = (): void => {
    if (!this.running || this.disposed) {
      return;
    }

    try {
      this.renderFrame();
    } catch (error) {
      this.running = false;
      this.clock.stop();
      window.clearInterval(this.watchdogHandle);
      this.runtimeGuard.recordSubsystemFailure("frame", error);
      return;
    }

    if (this.running && !this.disposed) {
      this.frameHandle = requestAnimationFrame(this.render);
    }
  };

  private renderFrame(): void {
    this.lastFrameTimestamp = performance.now();
    const rawDeltaSeconds = this.clock.getDelta();
    const deltaSeconds = THREE.MathUtils.clamp(
      Number.isFinite(rawDeltaSeconds) ? rawDeltaSeconds : 0,
      0,
      WORLD_MAX_RUNTIME_DELTA_SECONDS,
    );
    const streamingBudgetMs = this.profile.compact
      ? WORLD_COMPACT_STREAMING_BUILD_BUDGET_MS
      : WORLD_DESKTOP_STREAMING_BUILD_BUDGET_MS;
    this.streamingBuildDeadline = performance.now() + streamingBudgetMs;
    this.frameMetrics.beginFrame(deltaSeconds);

    if (this.controlsEnabled) {
      this.runFrameSubsystem("controls", this.updateControls, deltaSeconds);
    }

    this.notifyFrameObservers(deltaSeconds);

    if (this.terrainEnabled) {
      this.runFrameSubsystem("terrain", this.updateTerrain, deltaSeconds);
    }

    if (this.stonesEnabled) {
      this.runFrameSubsystem("stones", this.updateStones, deltaSeconds);
    }

    if (this.grassEnabled) {
      this.runFrameSubsystem("grass", this.updateGrass, deltaSeconds);
    }

    if (this.rendererEnabled) {
      this.runFrameSubsystem("renderer", this.renderScene, deltaSeconds);
    }

    if (this.hudEnabled) {
      this.runFrameSubsystem("hud", this.updateHud, deltaSeconds);
    }
  }

  private notifyFrameObservers(deltaSeconds: number): void {
    for (const observer of this.frameObservers) {
      try {
        observer(deltaSeconds);
      } catch (error) {
        this.frameObservers.delete(observer);
        this.runtimeGuard.recordSubsystemFailure("frame-observer", error);
      }
    }
  }

  private readonly updateControls = (deltaSeconds: number): void => {
    if (!this.minimap.isOpen()) {
      this.controls.update(deltaSeconds);
    }
    const focus = this.controls.getStreamingPosition();
    this.environment.update(deltaSeconds, focus);
    this.scenic.update(deltaSeconds, focus);
    this.reveal.noteHeroRing(
      !this.grassInitializing && this.grassEnabled,
      this.grassEnabled && this.grass.isHeroRingReady() ? 4 : 0,
    );
  };

  private readonly updateTerrain = (): void => {
    const grassBuildReserveMs = this.profile.compact
      ? WORLD_COMPACT_GRASS_BUILD_RESERVE_MS
      : WORLD_DESKTOP_GRASS_BUILD_RESERVE_MS;
    const stoneBuildReserveMs = this.profile.compact
      ? WORLD_COMPACT_STONE_BUILD_RESERVE_MS
      : WORLD_DESKTOP_STONE_BUILD_RESERVE_MS;
    const terrainBuildDeadline = this.streamingBuildDeadline - grassBuildReserveMs - stoneBuildReserveMs;
    this.terrain.update(
      this.controls.getStreamingPosition(),
      terrainBuildDeadline,
    );
  };

  private readonly updateStones = (): void => {
    const grassBuildReserveMs = this.profile.compact
      ? WORLD_COMPACT_GRASS_BUILD_RESERVE_MS
      : WORLD_DESKTOP_GRASS_BUILD_RESERVE_MS;
    const stoneBuildDeadline = this.streamingBuildDeadline - grassBuildReserveMs;
    this.stones.update(this.controls.getStreamingPosition(), stoneBuildDeadline);
  };

  private readonly updateGrass = (deltaSeconds: number): void => {
    grassTrailField.render(deltaSeconds);
    const cameraGroundHeight = this.flyMode ? this.sampleGroundHeight(this.camera.position) : undefined;
    this.grass.update(
      deltaSeconds,
      this.camera,
      cameraGroundHeight,
      this.streamingBuildDeadline,
    );
  };

  private readonly renderScene = (): void => {
    this.terrain.renderWaterRefraction(this.renderer, this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.stats?.update();
  };

  private readonly checkFrameHeartbeat = (): void => {
    if (!this.running || this.disposed || document.hidden) {
      return;
    }
    if (this.grassInitializing) {
      this.lastFrameTimestamp = performance.now();
      return;
    }
    const stalledForMs = performance.now() - this.lastFrameTimestamp;
    if (stalledForMs < WORLD_FRAME_STALL_THRESHOLD_MS) {
      return;
    }

    this.runtimeGuard.recordWatchdogRestart(stalledForMs);
    this.lastFrameTimestamp = performance.now();
    this.clock.stop();
    this.clock.start();
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = requestAnimationFrame(this.render);
  };

  private runFrameSubsystem(
    subsystem: WorldFrameSubsystem,
    callback: (deltaSeconds: number) => void,
    deltaSeconds: number,
  ): void {
    try {
      this.frameMetrics.measure(subsystem, callback, deltaSeconds);
    } catch (error) {
      this.runtimeGuard.recordSubsystemFailure(subsystem, error);
      if (subsystem === "controls") {
        this.controlsEnabled = false;
      } else if (subsystem === "terrain") {
        this.terrainEnabled = false;
      } else if (subsystem === "stones") {
        this.stonesEnabled = false;
        this.disposeSafely("Stone system", () => this.stones.dispose());
      } else if (subsystem === "grass") {
        this.grassEnabled = false;
        this.disposeGrassResources();
      } else if (subsystem === "renderer") {
        this.rendererEnabled = false;
      } else {
        this.hudEnabled = false;
      }
    }
  }

  private disposeGrassResources(): void {
    this.disposeSafely("Grass system", () => this.grass.dispose());
    this.disposeSafely("Grass trail field", () => grassTrailField.dispose());
  }

  private disposeSafely(label: string, dispose: () => void): void {
    try {
      dispose();
    } catch (error) {
      console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
    }
  }

  private applyRendererSize(): void {
    const viewport = resolveViewportSize();
    this.pixelRatio = resolvePixelRatio(this.profile.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(viewport.width, viewport.height);
  }

  private applyGrassViewportScale(): void {
    const bufferHeight = this.renderer.getDrawingBufferSize(
      this.drawingBufferSize,
    ).y;
    if (bufferHeight <= 0) {
      return;
    }
    const halfFovTangent = Math.tan(
      THREE.MathUtils.degToRad(this.camera.fov) * 0.5,
    );
    this.grass.setViewportPixelScale((2 * halfFovTangent) / bufferHeight);
  }

  private readonly updateHud = (deltaSeconds: number): void => {
    this.minimap.update();
    if (!this.statusHud.shouldUpdate(deltaSeconds)) {
      return;
    }
    const terrain = this.terrain.getDiagnostics();
    const stones = this.stones.getDiagnostics();
    const grass = this.grass.getDiagnostics();
    const focus = this.controls.getStreamingPosition();
    this.statusHud.render({
      frameCount: this.frameMetrics.getFrameCount(),
      averageFps: this.frameMetrics.getAverageFps(),
      runtimeError: this.runtimeGuard.error,
      controlMode: this.controls.getMode(),
      focus,
      camera: this.camera.position,
      groundHeight: this.sampleGroundHeight(focus),
      speed: this.controls.getSpeed(),
      inputDiagnostics: this.controls.getInputDiagnostics(),
      terrain,
      stones,
      grass,
      grassInitializationError: this.grassInitializationError,
      render: this.renderer.info.render,
      pixelRatio: this.pixelRatio,
      frameTimings: this.frameMetrics.getTimings(),
    });
  };

  private sampleGroundHeight(position: THREE.Vector3): number {
    const { x, z } = position;
    if (x !== this.sampledGroundX || z !== this.sampledGroundZ) {
      this.sampledGroundX = x;
      this.sampledGroundZ = z;
      this.sampledGroundHeight = this.field.sampleHeight(x, z);
    }
    return this.sampledGroundHeight;
  }

  private readonly handleResize = (): void => {
    if (this.disposed) {
      return;
    }
    this.camera.aspect = resolveViewportSize().aspect;
    this.camera.updateProjectionMatrix();
    this.applyRendererSize();
    this.applyGrassViewportScale();
  };
}

function disposeConstructionSafely(label: string, dispose: () => void): void {
  try {
    dispose();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} construction rollback failed.`, error);
  }
}
