import * as THREE from "three";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { TerrainField } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import { WorldFaunaSystem } from "./WorldFaunaSystem";
import { WorldTreeSystem } from "./WorldTreeSystem";

/**
 * Trees and fauna owned beside stones and grass without sharing player-control
 * failure state. Ground rock is the stone field, not a second quad layer.
 */
export class WorldScenicLayer {
  private trees?: WorldTreeSystem;
  private life?: WorldFaunaSystem;
  private treesEnabled = true;
  private faunaEnabled = true;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    field: TerrainField,
    config: WorldConfig,
    profile: RuntimeProfile,
    spawn: THREE.Vector3,
    shadows: boolean,
  ) {
    try {
      this.trees = new WorldTreeSystem(scene, field, config, profile, shadows);
    } catch (error) {
      this.treesEnabled = false;
      console.warn("[Drusniel World] Trees unavailable during initialization.", error);
    }

    const faunaCount = profile.compact
      ? config.faunaDeerCompactCount + config.faunaVillagerCompactCount
      : config.faunaDeerDesktopCount + config.faunaVillagerDesktopCount;
    if (config.faunaEnabled < 1 || faunaCount === 0) {
      this.faunaEnabled = false;
      return;
    }

    try {
      this.life = new WorldFaunaSystem(scene, field, config, profile, spawn, shadows);
    } catch (error) {
      this.faunaEnabled = false;
      console.warn("[Drusniel World] Fauna unavailable during initialization.", error);
    }
  }

  update(deltaSeconds: number, focus: THREE.Vector3): void {
    if (this.disposed) {
      return;
    }

    if (this.treesEnabled && this.trees) {
      try {
        this.trees.update(focus);
      } catch (error) {
        console.warn("[Drusniel World] Trees disabled after a fault.", error);
        this.treesEnabled = false;
        this.disposeTrees();
      }
    }

    const life = this.life;
    if (!this.faunaEnabled || !life) {
      return;
    }
    // Scenic systems are ticked inside the controls subsystem, so faults here
    // must release only the failing scenic owner and keep player input alive.
    try {
      life.update(deltaSeconds, focus);
    } catch (error) {
      console.warn("[Drusniel World] Fauna disabled after a fault.", error);
      this.faunaEnabled = false;
      this.disposeFauna();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.treesEnabled = false;
    this.faunaEnabled = false;
    this.disposeTrees();
    this.disposeFauna();
  }

  private disposeTrees(): void {
    const trees = this.trees;
    this.trees = undefined;
    if (!trees) {
      return;
    }
    try {
      trees.dispose();
    } catch (error) {
      console.warn("[Drusniel World] Tree cleanup failed.", error);
    }
  }

  private disposeFauna(): void {
    const life = this.life;
    this.life = undefined;
    if (!life) {
      return;
    }
    try {
      life.dispose();
    } catch (error) {
      console.warn("[Drusniel World] Fauna cleanup failed.", error);
    }
  }
}
