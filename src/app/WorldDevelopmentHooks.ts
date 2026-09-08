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

/**
 * What the development hooks need from the running world.
 *
 * Declared as a narrow interface rather than taking `WorldApp` itself: these
 * hooks exist only behind query parameters, and giving them the whole app would
 * make it impossible to see, from here, what a development tool can reach into.
 */
export interface WorldDevelopmentHost {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: RendererWithFrameInfo;
  readonly field: TerrainField;
  readonly profile: RuntimeProfile;
  readonly worldConfig: WorldConfig;
  readonly controls: WorldController;
  /** Returns the detach function, so a caller cannot remove someone else's. */
  addFrameObserver(observer: (deltaSeconds: number) => void): () => void;
  setGrassQualityTierOverride(tier: number): void;
  isGrassReady(): boolean;
  getDetailFoliageTuning(): DetailFoliageTuning;
  setDetailFoliageTuning(tuning: DetailFoliageTuning): void;
  applyGrassArtDirection(direction: GrassArtDirection): void;
  setLiveWaterVisuals: RiverArtMenuHost["applyLiveWaterVisuals"];
}

/**
 * Every development-only attachment the world offers, in one owner.
 *
 * These are the tuning menus, the profiler panel and the three `attach*` hooks
 * the bootstrap reaches for behind `?diagnostics=1`, `?stats=1`, `?qa=`,
 * `?riverTuning=1` and the actor proof. None of them are part of playing the
 * world, and keeping them here is what lets the composition root stay inside
 * its size budget while the experience integration adds real systems to it.
 *
 * Ownership is complete: whatever this attaches, it disposes, and a failure in
 * one attachment never abandons the others.
 */
export class WorldDevelopmentHooks {
  private artMenu?: GrassArtMenu;
  private detailFoliageMenu?: DetailFoliageTuningMenu;
  private riverArtMenu?: { dispose(): void };
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
    // The menu reflects the direction the world already applied, so opening it
    // cannot silently re-apply a different one.
    void direction;
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

  /**
   * Development-only hook for the actor extensibility proof.
   *
   * The proof adds an actor of its own and needs the world's scene and terrain
   * to place it, plus a frame callback to drive it.
   */
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
    disposeSafely("Stats panel", () => this.stats?.dom.remove());
    disposeSafely("Grass art menu", () => this.artMenu?.dispose());
    disposeSafely("Detail foliage menu", () => this.detailFoliageMenu?.dispose());
    disposeSafely("River art menu", () => this.riverArtMenu?.dispose());
    this.stats = undefined;
    this.artMenu = undefined;
    this.detailFoliageMenu = undefined;
    this.riverArtMenu = undefined;
  }
}

/** One failed development tool must not abandon the rest of the teardown. */
function disposeSafely(label: string, release: () => void): void {
  try {
    release();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}
