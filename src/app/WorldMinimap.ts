import { exitPointerLockSafely } from "../controls/InputTarget";
import type { WorldController } from "../controls/WorldController";
import type { TerrainField } from "../world/TerrainField";
import type { WorldConfig } from "../world/WorldConfig";
import {
  minimapUnitToWorld,
  worldToMinimapUnit,
  type MinimapPoint,
  type WorldMinimapExtent,
  type WorldPoint,
} from "./WorldMinimapProjection";
import { WorldMinimapRaster } from "./WorldMinimapRaster";

/**
 * Press-M travel map.
 *
 * The panel owns its own DOM so the scene markup stays a canvas, and it builds
 * its terrain raster lazily: a player who never opens the map never pays for
 * it. Once open it repaints only the marker layer, so an open map costs a
 * couple of hundred pixels of 2D work per frame rather than a re-raster.
 */

const RESOLUTION = 256;
/**
 * The map is a foreground panel, so spending a slice of the frame on it while
 * it charts is the right trade: the world behind it is not what the player is
 * looking at. At 60 Hz this finishes the raster in roughly a second.
 */
const BUILD_BUDGET_MS = 2.5;
const MARKER_RADIUS = 5;

export class WorldMinimap {
  private readonly extent: WorldMinimapExtent;
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly status: HTMLParagraphElement;
  private readonly terrainCanvas: HTMLCanvasElement;
  private readonly terrainContext: CanvasRenderingContext2D | null;
  private readonly unitScratch: MinimapPoint = { x: 0, y: 0 };
  private readonly worldScratch: WorldPoint = { x: 0, z: 0 };
  private raster?: WorldMinimapRaster;
  private terrainPainted = false;
  private open = false;
  private disposed = false;

  constructor(
    private readonly field: TerrainField,
    config: WorldConfig,
    private readonly controls: WorldController,
  ) {
    this.extent = { worldSize: config.worldSize, resolution: RESOLUTION };

    this.root = document.createElement("div");
    this.root.className = "world-minimap";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "World travel map");

    const title = document.createElement("h2");
    title.textContent = "World map";
    this.root.appendChild(title);

    this.canvas = document.createElement("canvas");
    this.canvas.width = RESOLUTION;
    this.canvas.height = RESOLUTION;
    this.canvas.className = "world-minimap-canvas";
    this.canvas.setAttribute("role", "button");
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "Click the map to travel there");
    this.root.appendChild(this.canvas);

    this.status = document.createElement("p");
    this.status.className = "world-minimap-status";
    this.root.appendChild(this.status);

    this.context = this.canvas.getContext("2d");
    this.terrainCanvas = document.createElement("canvas");
    this.terrainCanvas.width = RESOLUTION;
    this.terrainCanvas.height = RESOLUTION;
    this.terrainContext = this.terrainCanvas.getContext("2d");

    try {
      document.body.appendChild(this.root);
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("keydown", this.handleCanvasKey);
      window.addEventListener("keydown", this.handleKeyDown, true);
    } catch (error) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("keydown", this.handleCanvasKey);
      window.removeEventListener("keydown", this.handleKeyDown, true);
      this.root.remove();
      throw error;
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Called every frame; does nothing measurable while the map is closed. */
  update(): void {
    if (!this.open || this.disposed) {
      return;
    }
    try {
      const raster = this.raster;
      if (!raster) {
        return;
      }
      const advanced = raster.advance(BUILD_BUDGET_MS);
      if (advanced || !this.terrainPainted) {
        this.paintTerrain();
      }
      this.paint();
    } catch (error) {
      this.disableAfterFailure(error);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.open = false;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("keydown", this.handleCanvasKey);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    this.root.remove();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  private setOpen(open: boolean): void {
    if (this.disposed || open === this.open) {
      return;
    }
    if (!open) {
      this.open = false;
      this.root.hidden = true;
      return;
    }

    // First open pays for the raster; later opens reuse it. Build it before the
    // modal state is published so allocation failure cannot pause world input.
    const raster = this.raster ?? new WorldMinimapRaster(this.field, this.extent);
    if (document.pointerLockElement !== null) {
      exitPointerLockSafely();
    }
    this.raster = raster;
    this.open = true;
    this.root.hidden = false;
    try {
      this.canvas.focus();
      this.update();
    } catch (error) {
      this.open = false;
      this.root.hidden = true;
      throw error;
    }
  }

  private disableAfterFailure(error: unknown): void {
    this.open = false;
    this.root.hidden = true;
    try {
      this.dispose();
    } catch (cleanupError) {
      console.warn("[Drusniel World] Minimap cleanup failed.", cleanupError);
    }
    console.warn("[Drusniel World] Minimap disabled after a fault.", error);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) {
      return;
    }
    const hasModifier = event.altKey || event.ctrlKey || event.metaKey;
    if (event.code === "KeyM" && !event.repeat && !hasModifier) {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
      return;
    }
    if (event.code === "Escape" && this.open) {
      event.preventDefault();
      event.stopPropagation();
      this.setOpen(false);
      return;
    }
    if (
      !this.open ||
      (event.target === this.canvas &&
        (event.code === "Enter" || event.code === "Space"))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly handleCanvasKey = (event: KeyboardEvent): void => {
    if (event.code !== "Enter" && event.code !== "Space") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.travelTo(0.5, 0.5);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    this.travelTo(
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height,
    );
  };

  private travelTo(u: number, v: number): void {
    const destination = minimapUnitToWorld(
      this.extent,
      u,
      v,
      this.worldScratch,
    );
    try {
      this.controls.teleport(destination.x, destination.z);
    } finally {
      this.setOpen(false);
    }
  }

  private paintTerrain(): void {
    const raster = this.raster;
    if (!raster || !this.terrainContext) {
      return;
    }
    this.terrainContext.putImageData(raster.image, 0, 0);
    this.terrainPainted = true;
  }

  private paint(): void {
    const context = this.context;
    const raster = this.raster;
    if (!context || !raster) {
      return;
    }

    context.clearRect(0, 0, RESOLUTION, RESOLUTION);
    context.drawImage(this.terrainCanvas, 0, 0);

    const focus = this.controls.getStreamingPosition();
    const marker = worldToMinimapUnit(
      this.extent,
      focus.x,
      focus.z,
      this.unitScratch,
    );
    const markerX = marker.x * RESOLUTION;
    const markerY = marker.y * RESOLUTION;

    context.beginPath();
    context.arc(markerX, markerY, MARKER_RADIUS, 0, Math.PI * 2);
    context.fillStyle = "#ffd66b";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = "#26210f";
    context.stroke();

    if (raster.isComplete()) {
      this.status.textContent = `X ${focus.x.toFixed(0)} · Z ${focus.z.toFixed(0)} — click to travel · M or Esc to close`;
      return;
    }
    this.status.textContent = `Charting the world… ${Math.round(raster.getProgress() * 100)}%`;
  }
}

/**
 * The grass tuning panel puts real inputs on screen, so a bare window listener
 * would swallow every "m" typed into them.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
