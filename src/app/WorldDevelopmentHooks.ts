import type * as THREE from "three";
import type Stats from "stats-gl";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { WorldConfig } from "../world/WorldConfig";
import type { TerrainField } from "../world/TerrainField";
import type { WorldController } from "../controls/WorldController";
import type { RendererWithFrameInfo } from "../render/RendererDiagnosticsTypes";
import type { WorldActorProofContext } from "./WorldActorProofContext";
import type { WorldVisualMatrixContext } from "./WorldVisualMatrixContext";
import type { GrassArtDirection, GrassArtDirectionKey } from "../grass/GrassArtDirection";
import type { DetailFoliageTuning } from "../world/grass/DetailFoliageTuning";
import type { RiverArtMenuHost } from "./RiverArtMenu";
import { GrassArtMenu } from "./GrassArtMenu";
import { DetailFoliageTuningMenu } from "./DetailFoliageTuningMenu";
import { attachWorldStatsPanel } from "./WorldStatsPanel";

export interface WorldWeatherDevelopmentHook {
  setPreset(value: string): boolean;
  getPreset(): string;
}

declare global {
  interface Window {
    __drusnielWeather?: WorldWeatherDevelopmentHook;
  }
}

/** What development-only attachments are allowed to reach in the world. */
export interface WorldDevelopmentHost {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: RendererWithFrameInfo;
  readonly field: TerrainField;
  readonly profile: RuntimeProfile;
  readonly worldConfig: WorldConfig;
  readonly controls: WorldController;
  addFrameObserver(observer: (deltaSeconds: number) => void): () => void;
  setGrassQualityTierOverride(tier: number): void;
  isGrassReady(): boolean;
  getDetailFoliageTuning(): DetailFoliageTuning;
  setDetailFoliageTuning(tuning: DetailFoliageTuning): void;
  applyGrassArtDirection(direction: GrassArtDirection): void;
  setLiveWaterVisuals: RiverArtMenuHost["applyLiveWaterVisuals"];
  setWeatherPreset(value: string): boolean;
  getWeatherPreset(): string;
}

/** Owns every development-only attachment exposed by the running world. */
export class WorldDevelopmentHooks {
  private artMenu?: GrassArtMenu;
  private detailFoliageMenu?: DetailFoliageTuningMenu;
  private riverArtMenu?: { dispose(): void };
  private weatherHook?: WorldWeatherDevelopmentHook;
  private stats?: Stats;
  private disposed = false;

  constructor(private readonly host: WorldDevelopmentHost) {}

  /** The grass art and detail foliage menus, behind `?diagnostics=1`. */
  attachTuningMenus(artKey: GrassArtDirectionKey, direction: GrassArtDirection): void {
    if (this.disposed || !this.host.profile.showGui) {
      return;
    }
    this.artMenu = new GrassArtMenu(artKey, this.host.applyGrassArtDirection);
    this.detailFoliageMenu = new DetailFoliageTuningMenu(
      this.host.getDetailFoliageTuning(),
      (tuning) => this.host.setDetailFoliageTuning(tuning),
    );
    void direction;
  }

  /** Console hook used by T03 until the ordinary settings UI lands in T04. */
  attachWeatherPresetHook(): void {
    if (this.disposed || this.weatherHook) {
      return;
    }
    const hook: WorldWeatherDevelopmentHook = {
      setPreset: (value) => this.host.setWeatherPreset(value),
      getPreset: () => this.host.getWeatherPreset(),
    };
    this.weatherHook = hook;
    window.__drusnielWeather = hook;
  }

  /** The stats-gl profiler, behind `?stats=1`. Declines what it cannot time. */
  async attachStatsPanel(): Promise<void> {
    if (this.disposed || this.host.profile.compact) {
      return;
    }
    const stats = await attachWorldStatsPanel(
      this.host.renderer as Parameters<typeof attachWorldStatsPanel>[0],
    );
    if (this.disposed) {
      stats?.dom.remove();
      return;
    }
    this.stats = stats;
  }

  /** Called once per frame by the world's own loop. */
  update(): void {
    if (!this.disposed) {
      this.stats?.update();
    }
  }

  attachActorProof(observer: (deltaSeconds: number) => void): WorldActorProofContext {
    const detach = this.host.addFrameObserver(observer);
    return { scene: this.host.scene, field: this.host.field, detach };
  }

  /** Development-only hook for `?qa=visual-matrix`. */
  attachVisualMatrix(): WorldVisualMatrixContext {
    this.host.setGrassQualityTierOverride(1);
    return {
      camera: this.host.camera,
      renderer: this.host.renderer,
      field: this.host.field,
      profile: this.host.profile,
      controls: this.host.controls,
      isReady: () => this.host.isGrassReady(),
    };
  }

  /** Development-only hook for `?riverTuning=1`. */
  async attachRiverArtMenu(): Promise<void> {
    if (this.disposed || this.riverArtMenu || !this.host.profile.showGui) {
      return;
    }
    const { RiverArtMenu } = await import("./RiverArtMenu");
    if (this.disposed || this.riverArtMenu) {
      return;
    }
    this.riverArtMenu = new RiverArtMenu({
      worldConfig: this.host.worldConfig,
      field: this.host.field,
      controls: this.host.controls,
      applyLiveWaterVisuals: (visuals) => {
        this.host.setLiveWaterVisuals(visuals);
      },
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (window.__drusnielWeather === this.weatherHook) {
      delete window.__drusnielWeather;
    }
    disposeSafely("Stats panel", () => this.stats?.dom.remove());
    disposeSafely("Grass art menu", () => this.artMenu?.dispose());
    disposeSafely("Detail foliage menu", () => this.detailFoliageMenu?.dispose());
    disposeSafely("River art menu", () => this.riverArtMenu?.dispose());
    this.stats = undefined;
    this.artMenu = undefined;
    this.detailFoliageMenu = undefined;
    this.riverArtMenu = undefined;
    this.weatherHook = undefined;
  }
}

function disposeSafely(label: string, release: () => void): void {
  try {
    release();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}
