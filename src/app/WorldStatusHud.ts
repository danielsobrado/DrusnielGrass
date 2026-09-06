import { WORLD_HUD_UPDATE_INTERVAL_SECONDS } from "./WorldAppTuning";

interface VectorSnapshot {
  x: number;
  y: number;
  z: number;
}

interface TerrainSnapshot {
  activeChunks: number;
  queuedChunks: number;
  lastBuildMs: number;
  maxBuildMs: number;
}

interface StoneSnapshot {
  activeChunks: number;
  queuedChunks: number;
  stones: number;
  triangles: number;
  drawCalls: number;
  lastBuildMs: number;
  maxBuildMs: number;
}

interface GrassSnapshot {
  ready: boolean;
  status: string;
  clumps: number;
  blades: number;
  impostors: number;
  lastBuildMs: number;
  maxBuildMs: number;
  submittedMidVertices: number;
  submittedFarInstances: number;
  qualityTier: number;
  qualityTierSeconds: number;
  qualityDensityScale: number;
  nearTiles: number;
  nearTileBuildMs: number;
  maxNearTileBuildMs: number;
}

interface RenderSnapshot {
  calls: number;
  triangles: number;
}

interface FrameTimingSnapshot {
  controls: number;
  terrain: number;
  stones: number;
  grass: number;
  renderer: number;
}

export interface WorldStatusSnapshot {
  frameCount: number;
  averageFps: number;
  runtimeError?: string;
  controlMode: string;
  focus: VectorSnapshot;
  camera: VectorSnapshot;
  groundHeight: number;
  speed: number;
  inputDiagnostics: string;
  terrain: TerrainSnapshot;
  stones: StoneSnapshot;
  grass: GrassSnapshot;
  grassInitializationError?: string;
  render: RenderSnapshot;
  pixelRatio: number;
  frameTimings: FrameTimingSnapshot;
}

export class WorldStatusHud {
  private elapsedSeconds = 0;
  private readonly fpsElement = document.querySelector<HTMLElement>("#world-fps");

  constructor(private readonly element: HTMLElement | null) {}

  shouldUpdate(deltaSeconds: number): boolean {
    if (!this.element) {
      return false;
    }
    this.elapsedSeconds += deltaSeconds;
    if (this.elapsedSeconds < WORLD_HUD_UPDATE_INTERVAL_SECONDS) {
      return false;
    }
    this.elapsedSeconds = 0;
    return true;
  }

  render(snapshot: WorldStatusSnapshot): void {
    if (!this.element) {
      return;
    }

    const grassStatus = snapshot.grassInitializationError
      ? `Grass error: ${snapshot.grassInitializationError}`
      : snapshot.grass.status;
    if (this.fpsElement) {
      this.fpsElement.textContent = `${snapshot.averageFps.toFixed(0)} FPS`;
    }
    this.element.textContent = [
      `Frame ${snapshot.frameCount.toLocaleString()} · ${snapshot.averageFps.toFixed(1)} FPS · ${snapshot.runtimeError ? "DEGRADED" : "running"} · ${snapshot.controlMode}`,
      `Focus ${snapshot.focus.x.toFixed(0)} / ${snapshot.focus.y.toFixed(0)} / ${snapshot.focus.z.toFixed(0)}`,
      `Camera ${snapshot.camera.x.toFixed(0)} / ${snapshot.camera.y.toFixed(0)} / ${snapshot.camera.z.toFixed(0)}`,
      `AGL ${(snapshot.focus.y - snapshot.groundHeight).toFixed(1)} m · Speed ${snapshot.speed.toFixed(1)} m/s`,
      `Input ${snapshot.inputDiagnostics}`,
      `Terrain ${snapshot.terrain.activeChunks} +${snapshot.terrain.queuedChunks} · Build ${snapshot.terrain.lastBuildMs.toFixed(1)} / peak ${snapshot.terrain.maxBuildMs.toFixed(1)} ms`,
      `Stones ${snapshot.stones.stones.toLocaleString()} · ${snapshot.stones.activeChunks} +${snapshot.stones.queuedChunks} batches · ${snapshot.stones.triangles.toLocaleString()} tris · Build ${snapshot.stones.lastBuildMs.toFixed(1)} / peak ${snapshot.stones.maxBuildMs.toFixed(1)} ms`,
      snapshot.grass.ready
        ? `Grass ${snapshot.grass.clumps.toLocaleString()} patches · ${snapshot.grass.blades.toLocaleString()} blades · ${snapshot.grass.impostors.toLocaleString()} impostors`
        : grassStatus,
      `Draws ${snapshot.render.calls} · Triangles ${snapshot.render.triangles.toLocaleString()} · Scale ${snapshot.pixelRatio.toFixed(2)} · Build ${snapshot.grass.lastBuildMs.toFixed(1)} / peak ${snapshot.grass.maxBuildMs.toFixed(1)} ms`,
      `Grass submit mid ${snapshot.grass.submittedMidVertices.toLocaleString()} verts · far ${snapshot.grass.submittedFarInstances.toLocaleString()} inst · quality T${snapshot.grass.qualityTier} ${snapshot.grass.qualityTierSeconds.toFixed(1)}s (${snapshot.grass.qualityDensityScale.toFixed(2)})`,
      `Frame ctrl ${snapshot.frameTimings.controls.toFixed(2)} · terr ${snapshot.frameTimings.terrain.toFixed(2)} · stone ${snapshot.frameTimings.stones.toFixed(2)} · grass ${snapshot.frameTimings.grass.toFixed(2)} · draw ${snapshot.frameTimings.renderer.toFixed(2)} ms`,
      `Near tiles ${snapshot.grass.nearTiles.toLocaleString()} · Tile build ${snapshot.grass.nearTileBuildMs.toFixed(1)} / peak ${snapshot.grass.maxNearTileBuildMs.toFixed(1)} ms`,
      snapshot.runtimeError ? `Error ${snapshot.runtimeError}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
}
