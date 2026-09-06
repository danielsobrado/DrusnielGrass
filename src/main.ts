import { RuntimeConfigLoader } from "./runtime/RuntimeConfigLoader";
import { installMobileGpuCompatibility } from "./runtime/MobileGpuCompatibility";
import { UiVisibilityController } from "./runtime/UiVisibilityController";
import { resolveRuntimeProfile } from "./runtime/ViewportProfile";
import { APP_VERSION, BUILD_LABEL } from "./version";

interface RunnableApp {
  start(): void;
  dispose(): void;
}

interface Disposable {
  dispose(): void;
}

const WORLD_NAME = "Drusniel World";
const THIRD_PERSON_HELP =
  "Click to look · WASD move · Shift run · Space jump · F reset · M map";
const FLY_HELP =
  "Click to look · WASD move · Q/E altitude · Shift boost · F reset";

async function bootstrap(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) {
    throw new Error("Canvas element #canvas was not found.");
  }

  const params = new URLSearchParams(window.location.search);
  const uiController = new UiVisibilityController();
  let app: RunnableApp | undefined;
  let diagnostics: Disposable | undefined;
  let actorProof: Disposable | undefined;
  let animationHud: Disposable | undefined;
  let visualMatrix: Disposable | undefined;
  let isolationHarness: Disposable | undefined;
  let disposed = false;

  const disposeRuntime = (): void => {
    disposeRuntimeSafely(
      app,
      uiController,
      diagnostics,
      actorProof,
      animationHud,
      visualMatrix,
      isolationHarness,
    );
  };
  const handlePageHide = (event: PageTransitionEvent): void => {
    if (event.persisted || disposed) {
      return;
    }
    disposed = true;
    disposeRuntime();
  };
  window.addEventListener("pagehide", handlePageHide);

  try {
    const runtimeConfig = await new RuntimeConfigLoader().load(
      `./config/runtime.yaml?v=${encodeURIComponent(APP_VERSION)}`,
    );
    if (disposed) {
      return;
    }
    const profileParam = params.get("profile");
    const profile = resolveRuntimeProfile(runtimeConfig, {
      compact:
        profileParam === "compact"
          ? true
          : profileParam === "desktop"
            ? false
            : undefined,
    });
    document.documentElement.dataset.viewport = profile.compact
      ? "compact"
      : "desktop";
    installMobileGpuCompatibility(profile.compact);

    const sceneMode = params.get("scene") === "island" ? "island" : "world";
    const isolationEnabled =
      sceneMode === "world" && params.get("debug") === "1";
    if (isolationEnabled) {
      const { installWorldIsolationHarness } = await import(
        "./runtime/WorldIsolationHarness"
      );
      if (disposed) {
        return;
      }
      isolationHarness = installWorldIsolationHarness(params);
    }
    const flyMode =
      sceneMode === "world" &&
      (params.get("control") === "fly" || params.get("view") === "aerial");
    const animationHudEnabled = params.get("diagnostics") === "1";
    document.body.dataset.scene = sceneMode;
    document.body.dataset.control = flyMode ? "fly" : "third-person";

    const versionElement = document.querySelector<HTMLElement>("#build-version");
    const titleElement = document.querySelector<HTMLElement>(".app-title strong");
    const sceneElement = document.querySelector<HTMLElement>("#scene-mode");
    const helpElement = document.querySelector<HTMLElement>("#control-help");
    if (versionElement) {
      versionElement.textContent = `${APP_VERSION} · ${BUILD_LABEL}`;
    }
    if (titleElement) {
      titleElement.textContent = `${WORLD_NAME} · ${APP_VERSION}`;
    }
    if (sceneElement) {
      sceneElement.textContent = resolveSceneLabel(sceneMode, flyMode);
    }
    if (helpElement && sceneMode === "world") {
      helpElement.textContent = flyMode ? FLY_HELP : THIRD_PERSON_HELP;
    }
    document.title =
      sceneMode === "world"
        ? `${WORLD_NAME} · ${APP_VERSION}`
        : `${WORLD_NAME} · Island Regression`;

    uiController.initialize();
    if (sceneMode === "island") {
      const { IslandApp } = await import("./app/IslandApp");
      if (disposed) {
        return;
      }
      const island = new IslandApp(canvas, profile);
      app = island;
      await island.initialize();
      if (disposed) {
        return;
      }
    } else {
      const { WorldApp } = await import("./app/WorldApp");
      if (disposed) {
        return;
      }
      const world = await WorldApp.create(canvas, profile);
      app = world;
      if (disposed) {
        disposeRuntime();
        return;
      }
      const character = world.getThirdPersonCharacter();
      if (character && animationHudEnabled) {
        const { AnimationBlendingHud } = await import(
          "./runtime/AnimationBlendingHud"
        );
        if (disposed) {
          return;
        }
        const hud = new AnimationBlendingHud();
        let detachObserver: (() => void) | undefined;
        animationHud = {
          dispose: () => {
            detachObserver?.();
            hud.dispose();
          },
        };
        hud.attachCharacter(character);
        detachObserver = world.addFrameObserver((delta) => {
          hud.update(delta);
        });
      }
      const diagnosticsEnabled =
        params.get("diagnostics") === "1" ||
        params.get("gpuTiming") === "1" ||
        params.get("stats") === "1";
      if (diagnosticsEnabled) {
        const { WorldDiagnosticsController } = await import(
          "./runtime/WorldDiagnosticsController"
        );
        if (disposed) {
          return;
        }
        diagnostics = WorldDiagnosticsController.attach(world, {
          gpuTiming: params.get("gpuTiming") === "1",
          statsPanelEnabled: params.get("stats") === "1",
        });
      }
      if (params.get("qa") === "visual-matrix") {
        const { WorldVisualMatrixRunner } = await import(
          "./qa/WorldVisualMatrixRunner"
        );
        if (disposed) {
          return;
        }
        const runner = new WorldVisualMatrixRunner(world.attachVisualMatrix());
        visualMatrix = runner;
        void runner.start();
      }
      if (params.get("actorProof") === "1") {
        const { ActorExtensibilityProof } = await import(
          "./dev/ActorExtensibilityProof"
        );
        if (disposed) {
          return;
        }
        actorProof = ActorExtensibilityProof.attach(world);
      }
    }

    if (disposed) {
      disposeRuntime();
      return;
    }
    app.start();
  } catch (error) {
    disposed = true;
    window.removeEventListener("pagehide", handlePageHide);
    disposeRuntime();
    throw error;
  }
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
  try {
    dispose();
  } catch (error) {
    console.warn(`[${WORLD_NAME}] ${label} cleanup failed.`, error);
  }
}

function resolveSceneLabel(
  sceneMode: "island" | "world",
  flyMode: boolean,
): string {
  if (sceneMode === "island") {
    return `${WORLD_NAME} · Island Regression`;
  }
  return flyMode
    ? `${WORLD_NAME} · Continuous Grass LOD · Flight`
    : `${WORLD_NAME} · 2× Ultra-Near Grass · Drow Jump Rig`;
}

bootstrap().catch((error) => {
  console.error(`[${WORLD_NAME}] Startup failed.`, error);
  const output = document.createElement("pre");
  output.className = "startup-error";
  output.setAttribute("role", "alert");
  const message = error instanceof Error ? error.message : String(error);
  output.textContent = `Unable to start ${WORLD_NAME}. ${message}`;
  document.body.appendChild(output);
});
