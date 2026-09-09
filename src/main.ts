import { RuntimeConfigLoader } from "./runtime/RuntimeConfigLoader";
import { installMobileGpuCompatibility } from "./runtime/MobileGpuCompatibility";
import { UiVisibilityController } from "./runtime/UiVisibilityController";
import { resolveRuntimeProfile } from "./runtime/ViewportProfile";
import { APP_VERSION, BUILD_LABEL } from "./version";
import { resolveRendererRequest, type RendererSession } from "./render/RendererSession";
import { RendererRecovery } from "./render/RendererRecovery";
import { createWorldRendererSession } from "./app/WorldRendererSession";
import type { RuntimeRecoveryState } from "./app/RuntimeRecoveryState";

interface RunnableApp {
  start(): void;
  dispose(): void;
  captureRecoveryState?(): RuntimeRecoveryState;
  restoreRecoveryState?(state: RuntimeRecoveryState): void;
}

interface Disposable { dispose(): void; }

const WORLD_NAME = "Drusniel World";
const THIRD_PERSON_HELP = "Click to look · WASD move · Shift run · Space jump · F reset · M map";
const FLY_HELP = "Click to look · WASD move · Q/E altitude · Shift boost · F reset";
const BOOTSTRAP_STATUS = Object.freeze({
  runtime: "Loading runtime settings…",
  renderer: "Starting the renderer…",
  world: "Preparing the world and character…",
  grass: "Growing the near meadow…",
  recovery: "Restoring the renderer…",
});

async function bootstrap(): Promise<void> {
  let canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) throw new Error("Canvas element #canvas was not found.");

  const params = new URLSearchParams(window.location.search);
  const uiController = new UiVisibilityController();
  let app: RunnableApp | undefined;
  let session: RendererSession | undefined;
  let diagnostics: Disposable | undefined;
  let actorProof: Disposable | undefined;
  let animationHud: Disposable | undefined;
  let visualMatrix: Disposable | undefined;
  let isolationHarness: Disposable | undefined;
  let disposed = false;
  const lifetime = new AbortController();
  let recovery: RendererRecovery<RuntimeRecoveryState | undefined> | undefined;

  const releaseApp = (): void => {
    uiController.detachWorld();
    disposeSafely("Animation HUD", () => animationHud?.dispose());
    disposeSafely("Actor proof", () => actorProof?.dispose());
    disposeSafely("Visual matrix", () => visualMatrix?.dispose());
    disposeSafely("Diagnostics", () => diagnostics?.dispose());
    animationHud = actorProof = visualMatrix = diagnostics = undefined;
    const previousApp = app, previousSession = session;
    app = undefined;
    session = undefined;
    disposeSafely("Application", () => previousApp?.dispose());
    disposeSafely("Renderer session", () => previousSession?.dispose());
  };

  const disposeRuntime = (): void => {
    lifetime.abort();
    recovery?.dispose();
    releaseApp();
    disposeRuntimeSafely(app, uiController, diagnostics, actorProof, animationHud,
      visualMatrix, isolationHarness);
  };
  const handlePageHide = (event: PageTransitionEvent): void => {
    if (event.persisted || disposed) return;
    disposed = true;
    disposeRuntime();
  };
  window.addEventListener("pagehide", handlePageHide);

  try {
    if (import.meta.env.DEV && params.get("rendererHarness") === "1") {
      const { RendererMigrationHarness } = await import("./dev/RendererMigrationHarness");
      if (disposed) return;
      const candidate = await RendererMigrationHarness.create(canvas);
      if (disposed) { candidate.dispose(); return; }
      app = candidate;
      app.start();
      return;
    }

    setBootstrapStatus(BOOTSTRAP_STATUS.runtime);
    const runtimeConfig = await new RuntimeConfigLoader().load(
      `./config/runtime.yaml?v=${encodeURIComponent(APP_VERSION)}`,
    );
    if (disposed) return;
    const profileParam = params.get("profile");
    const profile = resolveRuntimeProfile(runtimeConfig, {
      compact: profileParam === "compact" ? true : profileParam === "desktop" ? false : undefined,
    });
    document.documentElement.dataset.viewport = profile.compact ? "compact" : "desktop";
    installMobileGpuCompatibility(profile.compact);

    const sceneMode = params.get("scene") === "island" ? "island" : "world";
    const isolationEnabled = sceneMode === "world" && params.get("debug") === "1";
    if (isolationEnabled) {
      const { installWorldIsolationHarness } = await import("./runtime/WorldIsolationHarness");
      if (disposed) return;
      isolationHarness = installWorldIsolationHarness(params);
    }
    const flyMode = sceneMode === "world"
      && (params.get("control") === "fly" || params.get("view") === "aerial");
    const animationHudEnabled = params.get("diagnostics") === "1";
    document.body.dataset.scene = sceneMode;
    document.body.dataset.control = flyMode ? "fly" : "third-person";

    const versionElement = document.querySelector<HTMLElement>("#build-version");
    const titleElement = document.querySelector<HTMLElement>(".app-title strong");
    const sceneElement = document.querySelector<HTMLElement>("#scene-mode");
    const helpElement = document.querySelector<HTMLElement>("#control-help");
    if (versionElement) versionElement.textContent = `${APP_VERSION} · ${BUILD_LABEL}`;
    if (titleElement) titleElement.textContent = `${WORLD_NAME} · ${APP_VERSION}`;
    if (sceneElement) sceneElement.textContent = resolveSceneLabel(sceneMode, flyMode);
    if (helpElement && sceneMode === "world") helpElement.textContent = flyMode ? FLY_HELP : THIRD_PERSON_HELP;
    document.title = sceneMode === "world" ? `${WORLD_NAME} · ${APP_VERSION}` : `${WORLD_NAME} · Island Regression`;

    uiController.initialize();
    const rendererRequest = resolveRendererRequest(window.location.search);
    setBootstrapStatus(BOOTSTRAP_STATUS.renderer);
    session = await createWorldRendererSession(canvas, rendererRequest,
      window.location.search, lifetime.signal);
    if (disposed) { session.dispose(); session = undefined; return; }
    publishRendererDiagnostics(canvas, session);

    const initializeApp = async (nextSession: RendererSession): Promise<void> => {
      if (sceneMode === "island") {
        const { IslandApp } = await import("./app/IslandApp");
        if (disposed) return;
        const island = IslandApp.create(nextSession, profile);
        app = island;
        await island.initialize();
        return;
      }

      setBootstrapStatus(BOOTSTRAP_STATUS.world);
      const { WorldApp } = await import("./app/WorldApp");
      if (disposed) return;
      const world = await WorldApp.create(nextSession, profile, lifetime.signal);
      app = world;
      if (disposed) { disposeRuntime(); return; }

      setBootstrapStatus(BOOTSTRAP_STATUS.grass);
      uiController.attachWorld(
        world.getExperiencePanelHost(),
        world.getRevealController(),
        shouldBypassStartGate(params),
      );

      const character = world.getThirdPersonCharacter();
      if (character && animationHudEnabled) {
        const { AnimationBlendingHud } = await import("./runtime/AnimationBlendingHud");
        if (disposed) return;
        const hud = new AnimationBlendingHud();
        let detachObserver: (() => void) | undefined;
        animationHud = { dispose: () => { detachObserver?.(); hud.dispose(); } };
        hud.attachCharacter(character);
        detachObserver = world.addFrameObserver((delta) => hud.update(delta));
      }

      const diagnosticsEnabled = params.get("diagnostics") === "1"
        || params.get("gpuTiming") === "1" || params.get("stats") === "1";
      if (diagnosticsEnabled) {
        const { WorldDiagnosticsController } = await import("./runtime/WorldDiagnosticsController");
        if (disposed) return;
        diagnostics = WorldDiagnosticsController.attach(world, {
          gpuTiming: params.get("gpuTiming") === "1",
          statsPanelEnabled: params.get("stats") === "1",
        });
      }
      if (params.get("qa") === "visual-matrix") {
        const { WorldVisualMatrixRunner } = await import("./qa/WorldVisualMatrixRunner");
        if (disposed) return;
        const runner = new WorldVisualMatrixRunner(world.attachVisualMatrix());
        visualMatrix = runner;
        void runner.start();
      }
      if (params.get("actorProof") === "1") {
        const { ActorExtensibilityProof } = await import("./dev/ActorExtensibilityProof");
        if (disposed) return;
        actorProof = ActorExtensibilityProof.attach(world);
      }
    };

    await initializeApp(session);
    if (disposed) { disposeRuntime(); return; }
    if (!app) throw new Error("Application initialization did not produce a runtime.");
    app.start();

    recovery = new RendererRecovery<RuntimeRecoveryState | undefined>({
      capture: () => app?.captureRecoveryState?.(),
      release: releaseApp,
      restart: async (backend, state) => {
        if (disposed) return;
        setBootstrapStatus(BOOTSTRAP_STATUS.recovery);
        const replacement = canvas!.cloneNode(false) as HTMLCanvasElement;
        canvas!.replaceWith(replacement);
        canvas = replacement;
        const next = await createWorldRendererSession(canvas, backend,
          window.location.search, lifetime.signal);
        if (disposed) { next.dispose(); return; }
        session = next;
        publishRendererDiagnostics(canvas, next);
        await initializeApp(next);
        if (disposed) { releaseApp(); return; }
        if (state) app?.restoreRecoveryState?.(state);
        app!.start();
        attachDeviceLoss();
      },
      onFailure: (error) => {
        console.error("[Drusniel World] Renderer recovery failed.", error);
        presentFatalError(error);
      },
    });
    const attachDeviceLoss = (): void => {
      const current = session;
      if (!current) return;
      current.subscribeDeviceLoss(() => {
        if (disposed) return;
        void recovery!.recover(rendererRequest, current.diagnostics.actual).catch((error) => {
          if (!disposed) presentFatalError(error);
        });
      });
    };
    attachDeviceLoss();
  } catch (error) {
    const abandoned = disposed;
    disposed = true;
    window.removeEventListener("pagehide", handlePageHide);
    disposeRuntime();
    if (abandoned) return;
    throw error;
  }
}

function shouldBypassStartGate(params: URLSearchParams): boolean {
  return params.has("qa") || params.get("capture") === "1";
}

function setBootstrapStatus(message: string): void {
  const reveal = document.querySelector<HTMLElement>("#world-reveal");
  if (!reveal) return;
  delete reveal.dataset.revealed;
  reveal.removeAttribute("aria-hidden");
  reveal.textContent = message;
}

function disposeRuntimeSafely(
  app: RunnableApp | undefined,
  uiController: UiVisibilityController,
  diagnostics: Disposable | undefined,
  actorProof: Disposable | undefined,
  animationHud: Disposable | undefined,
  visualMatrix: Disposable | undefined,
  isolationHarness: Disposable | undefined,
): void {
  disposeSafely("Animation HUD", () => animationHud?.dispose());
  disposeSafely("Actor proof", () => actorProof?.dispose());
  disposeSafely("Visual matrix", () => visualMatrix?.dispose());
  disposeSafely("Diagnostics", () => diagnostics?.dispose());
  disposeSafely("UI controller", () => uiController.dispose());
  disposeSafely("Application", () => app?.dispose());
  disposeSafely("Isolation harness", () => isolationHarness?.dispose());
}

function disposeSafely(label: string, dispose: () => void): void {
  try { dispose(); }
  catch (error) { console.warn(`[${WORLD_NAME}] ${label} cleanup failed.`, error); }
}

function resolveSceneLabel(sceneMode: "island" | "world", flyMode: boolean): string {
  if (sceneMode === "island") return `${WORLD_NAME} · Island Regression`;
  return flyMode ? `${WORLD_NAME} · Continuous Grass LOD · Flight`
    : `${WORLD_NAME} · 2× Ultra-Near Grass · Drow Jump Rig`;
}

function publishRendererDiagnostics(canvas: HTMLCanvasElement, session: RendererSession): void {
  const { requested, actual, fallbackReason } = session.diagnostics;
  canvas.dataset.rendererRequested = requested;
  canvas.dataset.renderer = actual;
  canvas.dataset.rendererGpuTiming = String(session.capabilities.gpuTiming);
  if (fallbackReason) canvas.dataset.rendererFallback = fallbackReason;
  else delete canvas.dataset.rendererFallback;
}

function presentFatalError(error: unknown): void {
  const output = document.createElement("pre");
  output.className = "startup-error";
  output.setAttribute("role", "alert");
  const message = error instanceof Error ? error.message : String(error);
  output.textContent = `Unable to start ${WORLD_NAME}. ${message}`;
  document.body.appendChild(output);
}

bootstrap().catch((error) => {
  console.error(`[${WORLD_NAME}] Startup failed.`, error);
  presentFatalError(error);
});
