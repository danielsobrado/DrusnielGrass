import {
  Box3, OrthographicCamera, RGBAFormat, RenderTarget, SRGBColorSpace, Sphere,
  UnsignedByteType, Vector3, WebGPUCoordinateSystem, type Object3D, type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { Light } from "three";
import type { GrassImpostorConfig } from "../GrassConfig";
import { readRenderTargetRgba8 } from "../../render/RenderTargetReadback";
import { withRendererState } from "../../render/RendererStateScope";
import { OctahedralMapping, type OctahedralView } from "./OctahedralMapping";
import {
  createImpostorAtlasBlob, createImpostorBakeMetadata, IMPOSTOR_BAKE_LAYER,
  type ImpostorBakeRequest, type ImpostorBakeResult,
} from "./OctahedralImpostorBaker";

interface SavedObjectState {
  object: Object3D;
  layerMask: number;
  visible: boolean;
}

/**
 * The portable impostor baker.
 *
 * Same atlas, same cell placement and the same metadata as the WebGL exporter;
 * what differs is the path underneath. The render target, the per-view viewport
 * and scissor and the readback all go through the node renderer, and the
 * readback's row order is resolved from the renderer's own coordinate system
 * rather than assumed, because the two backends hand back opposite orders and
 * the atlas is written straight into a canvas.
 *
 * The exported PNG is what the CPU atlas factory and the QA scene consume, so
 * this must agree with the WebGL exporter texel for texel, not merely look
 * similar.
 */
export class OctahedralImpostorNodeBaker {
  constructor(private readonly renderer: WebGPURenderer) {}

  async bake(request: ImpostorBakeRequest): Promise<ImpostorBakeResult> {
    const { scene, source, bounds, config } = request;
    const views = OctahedralMapping.createHemisphereViews(config.viewsPerAxis);
    const cellSize = config.frameResolution + config.padding * 2;
    const atlasSize = cellSize * config.viewsPerAxis;
    const target = new RenderTarget(atlasSize, atlasSize, {
      format: RGBAFormat,
      type: UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = SRGBColorSpace;
    target.texture.generateMipmaps = false;

    try {
      const camera = this.createCamera(bounds, config.cameraMargin);
      // The scope is synchronous, so the readback is started outside it: an
      // async callback would restore the borrowed state when the promise was
      // created rather than when it settled.
      withRendererState(this.renderer, () => {
        const savedObjects: SavedObjectState[] = [];
        try {
          this.prepareBakeLayer(scene, source, savedObjects);
          this.renderer.autoClear = false;
          this.renderer.setRenderTarget(target);
          this.renderer.setScissorTest(true);
          this.renderer.setClearColor(0x000000, 0);
          // With a target bound the node renderer reads the viewport and the
          // scissor rectangle from the target, not from the renderer; only the
          // scissor *test* still comes from the renderer. Writing the rectangles
          // on the renderer alone would draw every view over the whole atlas.
          target.viewport.set(0, 0, atlasSize, atlasSize);
          target.scissor.set(0, 0, atlasSize, atlasSize);
          this.renderer.clear(true, true, true);

          const center = bounds.getCenter(new Vector3());
          const radius = Math.max(bounds.getBoundingSphere(new Sphere()).radius, 0.01);
          const cameraDistance = radius * 3;
          for (const view of views) {
            this.renderView(target, scene, camera, center, cameraDistance, view, config, cellSize);
          }
        } finally { this.restoreBakeLayer(savedObjects); }
      });
      const pixels = await readRenderTargetRgba8(this.renderer, target);
      // WebGPU reads the first row from the top of the target; WebGL 2 reads it
      // from the bottom. The canvas expects the top row first.
      const bottomUp = this.renderer.coordinateSystem !== WebGPUCoordinateSystem;
      const atlas = await createImpostorAtlasBlob(pixels, atlasSize, bottomUp);
      return {
        atlas,
        pixels,
        metadata: createImpostorBakeMetadata(bounds, views, config, cellSize, atlasSize),
      };
    } finally {
      target.dispose();
    }
  }

  private createCamera(bounds: Box3, cameraMargin: number): OrthographicCamera {
    const sphere = bounds.getBoundingSphere(new Sphere());
    const halfExtent = Math.max(sphere.radius * cameraMargin, 0.01);
    const camera = new OrthographicCamera(-halfExtent, halfExtent, halfExtent, -halfExtent,
      0.01, Math.max(sphere.radius * 8, 10));
    camera.layers.set(IMPOSTOR_BAKE_LAYER);
    return camera;
  }

  private renderView(target: RenderTarget, scene: Scene, camera: OrthographicCamera,
    center: Vector3, cameraDistance: number, view: OctahedralView,
    config: GrassImpostorConfig, cellSize: number): void {
    const x = view.column * cellSize + config.padding;
    // Rows count from the top here, where the WebGL exporter counts them from
    // the bottom. A render target's viewport is normalized by the node renderer
    // on both backends, so this is the row the metadata already documents; the
    // readback and the PNG encoder then carry it through unchanged.
    const y = view.row * cellSize + config.padding;
    camera.position.copy(center).addScaledVector(view.direction, cameraDistance);
    camera.up.set(0, 1, 0);
    if (Math.abs(view.direction.y) > 0.98) {
      camera.up.set(0, 0, -1);
    }
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    target.viewport.set(x, y, config.frameResolution, config.frameResolution);
    target.scissor.set(x, y, config.frameResolution, config.frameResolution);
    // No per-view clear here. The node renderer's clear builds its own render
    // context from the target's dimensions and never applies the scissor, so
    // clearing per view would wipe the whole atlas and leave only the last one.
    // The cells are disjoint and each is written once, so the single full clear
    // before the loop already gives every view a clean colour and depth.
    this.renderer.render(scene, camera);
  }

  private prepareBakeLayer(scene: Scene, source: Object3D, states: SavedObjectState[]): void {
    const saved = new Set<Object3D>();
    const saveAndMove = (object: Object3D): void => {
      if (saved.has(object)) {
        return;
      }
      saved.add(object);
      states.push({ object, layerMask: object.layers.mask, visible: object.visible });
      object.layers.set(IMPOSTOR_BAKE_LAYER);
      object.visible = true;
    };
    source.traverse(saveAndMove);
    scene.traverse(object => {
      if (object instanceof Light) {
        saveAndMove(object);
      }
    });
  }

  private restoreBakeLayer(states: SavedObjectState[]): void {
    for (const state of states) {
      state.object.layers.mask = state.layerMask;
      state.object.visible = state.visible;
    }
  }
}
