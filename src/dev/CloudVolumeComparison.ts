import { QuadMesh, RenderTarget, WebGPUCoordinateSystem, type WebGPURenderer } from "three/webgpu";
import { PerspectiveCamera, OrthographicCamera, PlaneGeometry, Mesh, Scene,
  WebGLRenderer, WebGLRenderTarget } from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { createWorldCloudVolumeNodes } from "../world/sky/WorldCloudVolumeNodes";
import { createWorldCloudVolumeMaterial } from "../world/sky/WorldCloudPassMaterials";
import { renderNodePass } from "../render/RenderNodePass";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";

/** Compare matched raymarch budgets and cameras, independently of hardware tier. */
export async function compareCloudVolume(renderer: WebGPURenderer, profile: RuntimeProfile) {
  const width = 72, height = 48, steps = 8;
  const camera = new PerspectiveCamera(65, width / height, 0.1, 20000);
  camera.position.set(12, 6, -37);
  camera.lookAt(12, 700, -1037);
  camera.updateMatrixWorld();
  const legacyMaterial = createWorldCloudVolumeMaterial(profile, steps);
  legacyMaterial.uniforms.uProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
  legacyMaterial.uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
  legacyMaterial.uniforms.uCameraPosition.value.copy(camera.position);
  legacyMaterial.uniforms.uTime.value = 120;
  legacyMaterial.uniforms.uFrameIndex.value = 3;
  const node = createWorldCloudVolumeNodes(profile, steps);
  camera.coordinateSystem = renderer.coordinateSystem;
  camera.updateProjectionMatrix();
  node.inverseProjection.value.copy(camera.projectionMatrixInverse);
  node.cameraWorld.value.copy(camera.matrixWorld);
  node.cameraPosition.value.copy(camera.position);
  node.field.time.value = 120;
  node.frameIndex.value = 3;
  const target = new RenderTarget(width, height, { depthBuffer: false });
  const legacyTarget = new WebGLRenderTarget(width, height, { depthBuffer: false });
  const legacy = new WebGLRenderer();
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, legacyMaterial));
  try {
    renderNodePass(renderer, target, new QuadMesh(node.material));
    const pixels = await readRenderTargetRgba8(renderer, target);
    legacy.setRenderTarget(legacyTarget);
    legacy.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
    const expected = new Uint8Array(width * height * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, width, height, expected);
    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    let maximum = 0, total = 0, nonzero = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) nonzero++;
      for (let c = 0; c < 4; c++) {
        const delta = Math.abs(pixels[(y * width + x) * 4 + c] - expected[((flip ? height - y - 1 : y) * width + x) * 4 + c]);
        maximum = Math.max(maximum, delta); total += delta;
      }
    }
    return { width, height, steps, maximum, mean: total / (width * height * 4), nonzero, flippedRows: flip };
  } finally {
    node.material.dispose(); legacyMaterial.dispose(); geometry.dispose();
    target.dispose(); legacyTarget.dispose(); legacy.dispose();
  }
}
