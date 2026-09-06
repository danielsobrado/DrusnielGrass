import * as THREE from "three";
import type { GrassImpostorConfig } from "../GrassConfig";
import { OctahedralMapping, type OctahedralView } from "./OctahedralMapping";

const BAKE_LAYER = 31;
const PNG_TYPE = "image/png";
const DOWNLOAD_REVOKE_DELAY_MS = 1_000;

interface SavedObjectState {
  object: THREE.Object3D;
  layerMask: number;
  visible: boolean;
}

export interface ImpostorBakeFrame {
  index: number;
  row: number;
  column: number;
  uv: readonly [number, number];
  direction: readonly [number, number, number];
  viewport: readonly [number, number, number, number];
}

export interface ImpostorBakeMetadata {
  version: 1;
  mapping: "hemi-octahedral";
  pass: "albedo-alpha";
  viewsPerAxis: number;
  frameResolution: number;
  padding: number;
  atlasSize: number;
  sourceBounds: {
    center: readonly [number, number, number];
    size: readonly [number, number, number];
  };
  frames: ImpostorBakeFrame[];
  pendingPasses: readonly ["normal-roughness", "linear-depth-thickness"];
}

export interface ImpostorBakeResult {
  atlas: Blob;
  metadata: ImpostorBakeMetadata;
}

export interface ImpostorBakeRequest {
  scene: THREE.Scene;
  source: THREE.Object3D;
  bounds: THREE.Box3;
  config: GrassImpostorConfig;
}

export interface ImpostorDownloadPanel {
  readonly element: HTMLDivElement;
  dispose(): void;
}

export class OctahedralImpostorBaker {
  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  async bake(request: ImpostorBakeRequest): Promise<ImpostorBakeResult> {
    const { scene, source, bounds, config } = request;
    const views = OctahedralMapping.createHemisphereViews(config.viewsPerAxis);
    const cellSize = config.frameResolution + config.padding * 2;
    const atlasSize = cellSize * config.viewsPerAxis;
    const target = new THREE.WebGLRenderTarget(atlasSize, atlasSize, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.texture.generateMipmaps = false;

    const camera = this.createCamera(bounds, config.cameraMargin);
    const savedObjects = this.prepareBakeLayer(scene, source);
    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;
    const previousScissorTest = this.renderer.getScissorTest();
    const previousViewport = new THREE.Vector4();
    const previousScissor = new THREE.Vector4();
    const previousClearColor = new THREE.Color();
    const previousClearAlpha = this.renderer.getClearAlpha();
    this.renderer.getViewport(previousViewport);
    this.renderer.getScissor(previousScissor);
    this.renderer.getClearColor(previousClearColor);

    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.setScissorTest(true);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setViewport(0, 0, atlasSize, atlasSize);
      this.renderer.setScissor(0, 0, atlasSize, atlasSize);
      this.renderer.clear(true, true, true);

      const center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.01);
      const cameraDistance = radius * 3;

      for (const view of views) {
        this.renderView(
          scene,
          camera,
          center,
          cameraDistance,
          view,
          config,
          cellSize,
        );
      }

      const pixels = new Uint8Array(atlasSize * atlasSize * 4);
      this.renderer.readRenderTargetPixels(
        target,
        0,
        0,
        atlasSize,
        atlasSize,
        pixels,
      );
      const atlas = await this.createAtlasBlob(pixels, atlasSize);
      return {
        atlas,
        metadata: this.createMetadata(bounds, views, config, cellSize, atlasSize),
      };
    } finally {
      this.restoreBakeLayer(savedObjects);
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setViewport(previousViewport);
      this.renderer.setScissor(previousScissor);
      this.renderer.setScissorTest(previousScissorTest);
      this.renderer.setClearColor(previousClearColor, previousClearAlpha);
      this.renderer.autoClear = previousAutoClear;
      target.dispose();
    }
  }

  createDownloadLinks(
    result: ImpostorBakeResult,
    filePrefix: string,
  ): ImpostorDownloadPanel {
    const panel = document.createElement("div");
    const objectUrls = new Set<string>();
    const timeoutHandles = new Set<number>();
    let disposed = false;

    const revokeObjectUrl = (objectUrl: string): void => {
      if (!objectUrls.delete(objectUrl)) {
        return;
      }
      URL.revokeObjectURL(objectUrl);
    };
    const createDownloadLink = (
      blob: Blob,
      fileName: string,
      label: string,
    ): HTMLAnchorElement => {
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      objectUrls.add(objectUrl);
      link.href = objectUrl;
      link.download = fileName;
      link.textContent = label;
      link.style.color = "#fff";
      link.addEventListener(
        "click",
        () => {
          if (disposed || !objectUrls.has(objectUrl)) {
            return;
          }
          const handle = window.setTimeout(() => {
            timeoutHandles.delete(handle);
            revokeObjectUrl(objectUrl);
          }, DOWNLOAD_REVOKE_DELAY_MS);
          timeoutHandles.add(handle);
        },
        { once: true },
      );
      return link;
    };

    panel.style.cssText =
      "position:fixed;left:12px;bottom:12px;z-index:10000;padding:12px;background:#111d;color:#fff;font:13px sans-serif;border-radius:8px;display:flex;gap:10px";
    panel.append(
      createDownloadLink(
        result.atlas,
        `${filePrefix}-albedo.png`,
        "Download atlas",
      ),
      createDownloadLink(
        new Blob([JSON.stringify(result.metadata, null, 2)], {
          type: "application/json",
        }),
        `${filePrefix}.json`,
        "Download metadata",
      ),
    );
    document.body.appendChild(panel);

    return {
      element: panel,
      dispose: (): void => {
        if (disposed) {
          return;
        }
        disposed = true;
        for (const handle of timeoutHandles) {
          window.clearTimeout(handle);
        }
        timeoutHandles.clear();
        for (const objectUrl of objectUrls) {
          URL.revokeObjectURL(objectUrl);
        }
        objectUrls.clear();
        panel.remove();
      },
    };
  }

  private createCamera(
    bounds: THREE.Box3,
    cameraMargin: number,
  ): THREE.OrthographicCamera {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const halfExtent = Math.max(sphere.radius * cameraMargin, 0.01);
    const camera = new THREE.OrthographicCamera(
      -halfExtent,
      halfExtent,
      halfExtent,
      -halfExtent,
      0.01,
      Math.max(sphere.radius * 8, 10),
    );
    camera.layers.set(BAKE_LAYER);
    return camera;
  }

  private renderView(
    scene: THREE.Scene,
    camera: THREE.OrthographicCamera,
    center: THREE.Vector3,
    cameraDistance: number,
    view: OctahedralView,
    config: GrassImpostorConfig,
    cellSize: number,
  ): void {
    const x = view.column * cellSize + config.padding;
    const y =
      (config.viewsPerAxis - 1 - view.row) * cellSize + config.padding;

    camera.position.copy(center).addScaledVector(view.direction, cameraDistance);
    camera.up.set(0, 1, 0);
    if (Math.abs(view.direction.y) > 0.98) {
      camera.up.set(0, 0, -1);
    }
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    this.renderer.setViewport(
      x,
      y,
      config.frameResolution,
      config.frameResolution,
    );
    this.renderer.setScissor(
      x,
      y,
      config.frameResolution,
      config.frameResolution,
    );
    this.renderer.clear(true, true, true);
    this.renderer.render(scene, camera);
  }

  private prepareBakeLayer(
    scene: THREE.Scene,
    source: THREE.Object3D,
  ): SavedObjectState[] {
    const states: SavedObjectState[] = [];
    const saved = new Set<THREE.Object3D>();
    const saveAndMove = (object: THREE.Object3D): void => {
      if (saved.has(object)) {
        return;
      }
      saved.add(object);
      states.push({
        object,
        layerMask: object.layers.mask,
        visible: object.visible,
      });
      object.layers.set(BAKE_LAYER);
      object.visible = true;
    };

    source.traverse(saveAndMove);
    scene.traverse((object) => {
      if (object instanceof THREE.Light) {
        saveAndMove(object);
      }
    });
    return states;
  }

  private restoreBakeLayer(states: SavedObjectState[]): void {
    for (const state of states) {
      state.object.layers.mask = state.layerMask;
      state.object.visible = state.visible;
    }
  }

  private async createAtlasBlob(
    pixels: Uint8Array,
    atlasSize: number,
  ): Promise<Blob> {
    const flipped = new Uint8ClampedArray(pixels.length);
    const rowBytes = atlasSize * 4;
    for (let row = 0; row < atlasSize; row += 1) {
      const sourceOffset = row * rowBytes;
      const targetOffset = (atlasSize - 1 - row) * rowBytes;
      flipped.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
    }

    const canvas = document.createElement("canvas");
    canvas.width = atlasSize;
    canvas.height = atlasSize;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create a 2D canvas for impostor export.");
    }
    context.putImageData(new ImageData(flipped, atlasSize, atlasSize), 0, 0);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to encode the impostor atlas as PNG."));
        }
      }, PNG_TYPE);
    });
  }

  private createMetadata(
    bounds: THREE.Box3,
    views: OctahedralView[],
    config: GrassImpostorConfig,
    cellSize: number,
    atlasSize: number,
  ): ImpostorBakeMetadata {
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    return {
      version: 1,
      mapping: "hemi-octahedral",
      pass: "albedo-alpha",
      viewsPerAxis: config.viewsPerAxis,
      frameResolution: config.frameResolution,
      padding: config.padding,
      atlasSize,
      sourceBounds: {
        center: [center.x, center.y, center.z],
        size: [size.x, size.y, size.z],
      },
      frames: views.map((view) => ({
        index: view.index,
        row: view.row,
        column: view.column,
        uv: view.uv,
        direction: [view.direction.x, view.direction.y, view.direction.z],
        viewport: [
          view.column * cellSize + config.padding,
          view.row * cellSize + config.padding,
          config.frameResolution,
          config.frameResolution,
        ],
      })),
      pendingPasses: ["normal-roughness", "linear-depth-thickness"],
    };
  }
}
