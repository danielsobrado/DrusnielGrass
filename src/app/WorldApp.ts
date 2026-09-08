import * as THREE from "three";
import {
  GRASS_ART_DIRECTIONS,
  resolveGrassArtDirectionKey,
  type GrassArtDirection,
} from "../grass/GrassArtDirection";
import { grassInteractionField } from "../grass/interaction/GrassInteractionField";
import { grassTrailField } from "../grass/interaction/GrassTrailField";
import { WorldDevelopmentHooks } from "./WorldDevelopmentHooks";
import { WorldExperience } from "./WorldExperience";
import { WorldExperiencePanelHostAdapter } from "./WorldExperiencePanelHost";
import { WorldFrameSubsystems } from "./WorldFrameSubsystems";
import { WorldExperienceConfigLoader } from "../world/experience/WorldExperienceConfigLoader";
import { DEFAULT_WEATHER_PRESET } from "../world/experience/WorldExperienceCatalog";
import {
  attachWorldWeather,
  type WorldWeatherState,
} from "../world/weather/WorldWeatherState";
import { WorldLightingState } from "../render/WorldLightingState";
import { hudSettingsStore } from "../runtime/HudSettingsStore";
import { WorldViewState } from "../runtime/WorldViewState";
import type { WorldExperiencePanelHost } from "../ui/WorldExperiencePanel";
import type { WorldExperienceConfig } from "../world/experience/WorldExperienceConfig";
import { FlyWorldController } from "../controls/FlyWorldController";
import { ThirdPersonController } from "../controls/ThirdPersonController";
import type { WorldController } from "../controls/WorldController";
import type { SnowflowCharacter } from "../character/SnowflowCharacter";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { resolvePixelRatio, resolveViewportSize } from "../runtime/ViewportSizing";
import { WORLD_TONE_MAPPING } from "./WorldEnvironmentTuning";
import { createGrassTrailNodePass } from "../grass/interaction/GrassTrailNodePass";
import type { RendererSession } from "../render/RendererSession";
import { APP_VERSION } from "../version";
import { DenseSpawnLocator } from "../world/DenseSpawnLocator";
import { StoneField } from "../world/stones/StoneField";
import { WorldStoneSystem } from "../world/stones/WorldStoneSystem";
import { TerrainField } from "../world/TerrainField";
import { TerrainStreamer } from "../world/TerrainStreamer";
import type { WorldConfig } from "../world/WorldConfig";
import {
  setGrassPaletteDesaturation,
  setGrassWeatherPaletteMultiplier,
} from "../grass/materials/GrassPaletteShader";
import { WorldConfigLoader } from "../world/WorldConfigLoader";
import { WorldGrassSystem } from "../world/WorldGrassSystem";
import { WorldEnvironmentController } from "./WorldEnvironmentController";
import { WorldMinimap } from "./WorldMinimap";
import { WorldFrameMetrics } from "./WorldFrameMetrics";
import { WorldRuntimeGuard } from "./WorldRuntimeGuard";
import { WorldStatusHud } from "./WorldStatusHud";
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
  private readonly renderer: RendererSession["renderer"];
  private readonly lighting: WorldLightingState;
  private readonly clock = new THREE.Clock();
  private development!: WorldDevelopmentHooks;
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
  private renderScale = 1;
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
  private grassEnabled = true;
  private experience?: WorldExperience;
  private weather?: WorldWeatherState;
  private grassArtDirection?: GrassArtDirection;
  private rendererPaused = false;
  private subsystems!: WorldFrameSubsystems;
  private viewState?: WorldViewState;
  private experiencePanelHost?: WorldExperiencePanelHostAdapter;
  private grassInitializing = true;
  private grassInitializationError?: string;

  private constructor(
    private readonly session: RendererSession,
    private readonly profile: RuntimeProfile,
    private readonly worldConfig: WorldConfig,
    experienceConfig: WorldExperienceConfig,
  ) {
    const config = this.worldConfig;
    this.camera = new THREE.PerspectiveCamera(
      profile.cameraFov,
      resolveViewportSize().aspect,
      0.1,
      5000,
    );

    this.renderer = session.renderer;
    this.lighting = new WorldLightingState(profile);
    this.renderScale = hudSettingsStore.getRenderScale();
    setGrassWeatherPaletteMultiplier([1, 1, 1]);
    const canvas = this.renderer.domElement;

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

      this.experience = new WorldExperience(experienceConfig, profile.compact);
      environment = new WorldEnvironmentController(
        this.scene,
        this.renderer,
        profile,
        profile.shadows && !useFlyControls,
        session.capabilities,
        this.lighting,
      );
      this.environment = environment;

      this.weather = attachWorldWeather(this.experience, {
        renderer: this.renderer,
        params,
        lighting: this.lighting,
        storedPreset: hudSettingsStore.getWeather(),
        focus: () => controls?.getStreamingPosition() ?? spawn.position,
        onPresetApplied: (preset) => {
          setGrassWeatherPaletteMultiplier(preset.paletteMultiplier);
          environment?.applyWeatherPreset();
          const direction = this.grassArtDirection;
          if (direction) {
            terrain?.setGrassArtDirection(direction);
            grass?.setArtDirection(direction);
          }
        },
      });
      environment.materialContext.setWorldWindUniforms(this.weather?.windUniforms);

      terrain = new TerrainStreamer(
        this.scene,
        this.field,
        config,
        profile.compact,
        profile.shadows && !useFlyControls,
        environment.materialContext,
      );
      this.terrain = terrain;
      stones = new WorldStoneSystem(
        this.scene,
        stoneField,
        config,
        profile.compact,
        profile.shadows && !useFlyControls,
        environment.materialContext,
      );
      this.stones = stones;
      grass = new WorldGrassSystem(
        this.scene,
        this.field,
        config,
        profile,
        environment.materialContext,
        this.weather?.windUniforms,
      );
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
        grassTrailField.attachNodePass((uniforms, size) =>
          createGrassTrailNodePass(this.renderer, session.capabilities, uniforms, size),
        );
      }
      const artKey = resolveGrassArtDirectionKey(params.get("grassArt"));
      this.applyGrassArtDirection(GRASS_ART_DIRECTIONS[artKey]);

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
      this.viewState = new WorldViewState(controls, useFlyControls ? "fly" : "play");
      grassInteractionField.setInteractionEnabled(hudSettingsStore.getInteractionEnabled());
      if (hudSettingsStore.getInteractionEnabled()) {
        grassInteractionField.reset(controls.getStreamingPosition());
      }
      this.experiencePanelHost = new WorldExperiencePanelHostAdapter({
        weather: this.weather,
        viewState: this.viewState,
        getRenderScale: () => this.renderScale,
        setRenderScale: this.setRenderScale,
      });
      this.development = new WorldDevelopmentHooks({
        scene: this.scene, camera: this.camera, renderer: this.renderer,
        field: this.field, profile, worldConfig: config, controls,
        addFrameObserver: (observer) => this.addFrameObserver(observer),
        setGrassQualityTierOverride: (tier) => this.grass.setQualityTierOverride(tier),
        isGrassReady: () => !this.grassInitializing && this.grassEnabled,
        getDetailFoliageTuning: () => this.grass.getDetailFoliageTuning(),
        setDetailFoliageTuning: (tuning) => this.grass.setDetailFoliageTuning(tuning),
        applyGrassArtDirection: this.applyGrassArtDirection,
        setLiveWaterVisuals: (visuals) => this.terrain.setLiveWaterVisuals(visuals),
        setWeatherPreset: (value) => this.weather?.setPreset(value) ?? false,
        getWeatherPreset: () => this.weather?.getPresetId() ?? DEFAULT_WEATHER_PRESET,
      });
      if (params.get("diagnostics") === "1") {
        this.development.attachWeatherPresetHook();
        this.development.attachTuningMenus(artKey, GRASS_ART_DIRECTIONS[artKey]);
      }
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
          this.rendererPaused = !enabled;
          if (enabled) {
            this.disposeSafely("Environment context restore", () =>
              this.environment.handleContextRestore(),
            );
            if (!useFlyControls) {
              this.disposeSafely("Grass trail context restore", () =>
                grassTrailField.configure({}),
              );
            }
          }
        },
      );
      this.runtimeGuard = runtimeGuard;
      this.subsystems = new WorldFrameSubsystems(this.frameMetrics, runtimeGuard);
      this.registerFrameSubsystems();
    } catch (error) {
      setGrassWeatherPaletteMultiplier([1, 1, 1]);
      disposeConstructionSafely("Runtime guard", () => runtimeGuard?.dispose());
      disposeConstructionSafely("World reveal", () => reveal?.dispose());
      disposeConstructionSafely("Scenic layer", () => scenic?.dispose());
      disposeConstructionSafely("Minimap", () => minimap?.dispose());
      disposeConstructionSafely("World controls", () => controls?.dispose());
      disposeConstructionSafely("Experience", () => this.experience?.dispose());
      disposeConstructionSafely("Development hooks", () => this.development.dispose());
      disposeConstructionSafely("Grass trail field", () => grassTrailField.dispose());
      disposeConstructionSafely("Grass system", () => grass?.dispose());
      disposeConstructionSafely("Stone system", () => stones?.dispose());
      disposeConstructionSafely("Terrain streamer", () => terrain?.dispose());
      disposeConstructionSafely("Environment", () => environment?.dispose());
      disposeConstructionSafely("Renderer", () => this.session.dispose());
      throw error;
    }
  }

  static async create(
    session: RendererSession,
    profile: RuntimeProfile,
    signal?: AbortSignal,
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
    signal?.throwIfAborted();
    setGrassPaletteDesaturation(config.grassPaletteDesaturation);
    const experienceConfig = await new WorldExperienceConfigLoader().load();
    signal?.throwIfAborted();
    let app: WorldApp;
    try { app = new WorldApp(session, profile, config, experienceConfig); }
    catch (error) { session.dispose(); throw error; }
    if (profile.showGui && params.get("riverTuning") === "1") {
      try {
        await app.attachRiverArtMenu();
      } catch (error) {
        console.warn("[Drusniel World] Optional river tuning unavailable.", error);
      }
    }
    if (params.get("stats") === "1") {
      await app.development.attachStatsPanel();
    }
    void app.initializeGrass();
    return app;
  }

  start(): void {
    if (this.running || this.disposed) return;
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
    return this.controls instanceof ThirdPersonController ? this.controls.getCharacter() : undefined;
  }

  getExperiencePanelHost(): WorldExperiencePanelHost {
    if (!this.experiencePanelHost) throw new Error("World experience panel host is unavailable.");
    return this.experiencePanelHost;
  }

  getRevealController(): WorldRevealController {
    return this.reveal;
  }

  captureRecoveryState = () => this.controls.captureRecoveryState();
  restoreRecoveryState = (state: ReturnType<WorldController["captureRecoveryState"]>) => this.controls.restoreRecoveryState(state);

  addFrameObserver(observer: (deltaSeconds: number) => void): () => void {
    this.frameObservers.add(observer);
    return () => { this.frameObservers.delete(observer); };
  }

  attachActorProof(observer: (deltaSeconds: number) => void): WorldActorProofContext {
    return this.development.attachActorProof(observer);
  }

  attachVisualMatrix(): WorldVisualMatrixContext {
    return this.development.attachVisualMatrix();
  }

  attachRiverArtMenu(): Promise<void> {
    return this.development.attachRiverArtMenu();
  }

  dispose(): void {
    if (this.disposed) return;
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
    this.disposeSafely("Experience", () => this.experience?.dispose());
    this.weather = undefined;
    this.experience = undefined;
    this.experiencePanelHost = undefined;
    this.disposeSafely("View state", () => this.viewState?.dispose());
    this.disposeSafely("Development hooks", () => this.development.dispose());
    this.disposeSafely("Environment", () => this.environment.dispose());
    this.disposeSafely("Renderer", () => this.session.dispose());
    setGrassWeatherPaletteMultiplier([1, 1, 1]);
  }

  private readonly applyGrassArtDirection = (direction: GrassArtDirection): void => {
    if (this.disposed) return;
    this.grassArtDirection = direction;
    this.terrain.setGrassArtDirection(direction);
    this.grass.setArtDirection(direction);
    this.environment.applyArtDirection(direction);
  };

  private async initializeGrass(): Promise<void> {
    try {
      await this.grass.initialize();
      if (this.disposed) return;
      await this.development.attachAccentAtlasDebug(this.grass.getDetailFoliageAtlas());
    } catch (error) {
      if (this.disposed) return;
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
    if (!this.running || this.disposed) return;
    try {
      this.renderFrame();
    } catch (error) {
      this.running = false;
      this.clock.stop();
      window.clearInterval(this.watchdogHandle);
      this.runtimeGuard.recordSubsystemFailure("frame", error);
      return;
    }
    if (this.running && !this.disposed) this.frameHandle = requestAnimationFrame(this.render);
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
    this.renderer.info.reset();
    this.frameMetrics.beginFrame(deltaSeconds);
    this.subsystems.run(deltaSeconds, (name) => {
      if (name === "controls") this.notifyFrameObservers(deltaSeconds);
    });
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
    if (!this.minimap.isOpen()) this.controls.update(deltaSeconds);
  };

  private readonly updateEnvironment = (deltaSeconds: number): void => {
    const focus = this.controls.getStreamingPosition();
    this.environment.update(deltaSeconds, focus);
    this.scenic.update(deltaSeconds, focus);
    this.reveal.noteHeroRing(
      !this.grassInitializing && this.grassEnabled,
      this.grassEnabled && this.grass.isHeroRingReady() ? 4 : 0,
    );
  };

  private readonly updateExperience = (deltaSeconds: number): void => {
    this.experience?.update(deltaSeconds);
  };

  private readonly updateTerrain = (): void => {
    const grassBuildReserveMs = this.profile.compact
      ? WORLD_COMPACT_GRASS_BUILD_RESERVE_MS : WORLD_DESKTOP_GRASS_BUILD_RESERVE_MS;
    const stoneBuildReserveMs = this.profile.compact
      ? WORLD_COMPACT_STONE_BUILD_RESERVE_MS : WORLD_DESKTOP_STONE_BUILD_RESERVE_MS;
    this.terrain.update(
      this.controls.getStreamingPosition(),
      this.streamingBuildDeadline - grassBuildReserveMs - stoneBuildReserveMs,
    );
  };

  private readonly updateStones = (): void => {
    const grassBuildReserveMs = this.profile.compact
      ? WORLD_COMPACT_GRASS_BUILD_RESERVE_MS : WORLD_DESKTOP_GRASS_BUILD_RESERVE_MS;
    this.stones.update(this.controls.getStreamingPosition(), this.streamingBuildDeadline - grassBuildReserveMs);
  };

  private readonly updateGrass = (deltaSeconds: number): void => {
    grassTrailField.render(deltaSeconds);
    const cameraGroundHeight = this.flyMode ? this.sampleGroundHeight(this.camera.position) : undefined;
    this.grass.update(deltaSeconds, this.camera, cameraGroundHeight, this.streamingBuildDeadline);
  };

  private readonly renderScene = (): void => {
    this.environment.prepareFrame(this.camera);
    this.terrain.renderWaterRefraction(this.renderer, this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.development.update();
  };

  private readonly checkFrameHeartbeat = (): void => {
    if (!this.running || this.disposed || document.hidden) return;
    if (this.grassInitializing) {
      this.lastFrameTimestamp = performance.now();
      return;
    }
    const stalledForMs = performance.now() - this.lastFrameTimestamp;
    if (stalledForMs < WORLD_FRAME_STALL_THRESHOLD_MS) return;
    this.runtimeGuard.recordWatchdogRestart(stalledForMs);
    this.lastFrameTimestamp = performance.now();
    this.clock.stop();
    this.clock.start();
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = requestAnimationFrame(this.render);
  };

  private registerFrameSubsystems(): void {
    const runner = this.subsystems;
    runner.register({ name: "controls", run: this.updateControls, onFailure: () => {} });
    runner.register({
      name: "experience",
      run: this.updateExperience,
      onFailure: () => {
        this.disposeSafely("Experience", () => this.experience?.dispose());
        this.weather = undefined;
        this.experience = undefined;
      },
    });
    runner.register({ name: "environment", run: this.updateEnvironment, onFailure: () => {} });
    runner.register({ name: "terrain", run: this.updateTerrain, onFailure: () => {} });
    runner.register({
      name: "stones",
      run: this.updateStones,
      onFailure: () => this.disposeSafely("Stone system", () => this.stones.dispose()),
    });
    runner.register({ name: "grass", run: this.updateGrass, onFailure: () => this.disposeGrassResources() });
    runner.register({
      name: "renderer",
      run: () => { if (!this.rendererPaused) this.renderScene(); },
      onFailure: () => {},
    });
    runner.register({ name: "hud", run: this.updateHud, onFailure: () => {} });
  }

  private disposeGrassResources(): void {
    this.disposeSafely("Grass system", () => this.grass.dispose());
    this.disposeSafely("Grass trail field", () => grassTrailField.dispose());
  }

  private disposeSafely(label: string, dispose: () => void): void {
    try { dispose(); }
    catch (error) { console.warn(`[Drusniel World] ${label} cleanup failed.`, error); }
  }

  private readonly setRenderScale = (value: number): void => {
    if (this.disposed || !Number.isFinite(value)) return;
    const next = THREE.MathUtils.clamp(value, 0.5, 1);
    if (next === this.renderScale) return;
    this.renderScale = next;
    this.applyRendererSize();
    this.applyGrassViewportScale();
  };

  private applyRendererSize(): void {
    const viewport = resolveViewportSize();
    this.pixelRatio = resolvePixelRatio(this.profile.maxPixelRatio * this.renderScale);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(viewport.width, viewport.height);
  }

  private applyGrassViewportScale(): void {
    const bufferHeight = this.renderer.getDrawingBufferSize(this.drawingBufferSize).y;
    if (bufferHeight <= 0) return;
    const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5);
    this.grass.setViewportPixelScale((2 * halfFovTangent) / bufferHeight);
  }

  private readonly updateHud = (deltaSeconds: number): void => {
    this.minimap.update();
    if (!this.statusHud.shouldUpdate(deltaSeconds)) return;
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
    if (this.disposed) return;
    this.camera.aspect = resolveViewportSize().aspect;
    this.camera.updateProjectionMatrix();
    this.applyRendererSize();
    this.applyGrassViewportScale();
  };
}

function disposeConstructionSafely(label: string, dispose: () => void): void {
  try { dispose(); }
  catch (error) { console.warn(`[Drusniel World] ${label} construction rollback failed.`, error); }
}
