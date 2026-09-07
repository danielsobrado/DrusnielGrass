import { DataTexture, LinearFilter, Matrix4, QuadMesh, RenderTarget, WebGPUCoordinateSystem, type WebGPURenderer } from "three/webgpu";
import { PerspectiveCamera, OrthographicCamera, PlaneGeometry, Mesh, Scene, WebGLRenderer, WebGLRenderTarget } from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { createWorldCloudTemporalNodes } from "../world/sky/WorldCloudTemporalNodes";
import { createWorldCloudTemporalMaterial } from "../world/sky/WorldCloudPassMaterials";
import { renderNodePass } from "../render/RenderNodePass";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

/** Asymmetric history gradients make inverted reprojection sampling visible. */
export async function compareCloudTemporal(renderer: WebGPURenderer, profile: RuntimeProfile) {
  const width = 72, height = 48;
  const makeTexture = (history: boolean, topDown: boolean) => {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const physicalY = topDown ? height - y - 1 : y;
      const offset = (y * width + x) * 4;
      data.set([30 + x / 3 + (history ? 4 : 0), 40 + physicalY / 3 + (history ? 6 : 0),
        50 + (x + physicalY) / 4, 90 + physicalY / 2 + (history ? 8 : 0)], offset);
    }
    const texture = new DataTexture(data, width, height);
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  };
  const current = makeTexture(false, true), history = makeTexture(true, true);
  const legacyCurrent = makeTexture(false, false), legacyHistory = makeTexture(true, false);
  const node = createWorldCloudTemporalNodes(profile.cloud, current, history);
  const legacyMaterial = createWorldCloudTemporalMaterial(profile);
  legacyMaterial.uniforms.uCurrentTexture.value = legacyCurrent;
  legacyMaterial.uniforms.uHistoryTexture.value = legacyHistory;
  const camera = new PerspectiveCamera(65, width / height, 0.1, 20000);
  camera.position.set(12, 6, -37); camera.lookAt(12, 700, -1037); camera.updateMatrixWorld();
  const previous = camera.clone();
  previous.position.x -= 20; previous.updateMatrixWorld();
  legacyMaterial.uniforms.uProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
  legacyMaterial.uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
  legacyMaterial.uniforms.uCameraPosition.value.copy(camera.position);
  legacyMaterial.uniforms.uPreviousViewProjection.value.multiplyMatrices(previous.projectionMatrix, previous.matrixWorldInverse);
  legacyMaterial.uniforms.uDeltaSeconds.value = 0.016;
  camera.coordinateSystem = renderer.coordinateSystem;
  previous.coordinateSystem = renderer.coordinateSystem;
  camera.updateProjectionMatrix(); previous.updateProjectionMatrix();
  node.inverseProjection.value.copy(camera.projectionMatrixInverse);
  node.cameraWorld.value.copy(camera.matrixWorld);
  node.cameraPosition.value.copy(camera.position);
  node.previousViewProjection.value.copy(new Matrix4().multiplyMatrices(previous.projectionMatrix, previous.matrixWorldInverse));
  node.delta.value = 0.016;
  const target = new RenderTarget(width, height, { depthBuffer: false });
  const legacyTarget = new WebGLRenderTarget(width, height, { depthBuffer: false });
  const legacy = new WebGLRenderer();
  const geometry = new PlaneGeometry(2, 2), scene = new Scene();
  scene.add(new Mesh(geometry, legacyMaterial));
  const reports = [];
  try {
    for (const valid of [false, true]) {
      node.historyValid.value = valid ? 1 : 0;
      legacyMaterial.uniforms.uHistoryValid.value = valid ? 1 : 0;
      renderNodePass(renderer, target, new QuadMesh(node.material));
      const pixels = await readRenderTargetRgba8(renderer, target);
      legacy.setRenderTarget(legacyTarget);
      legacy.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
      const expected = new Uint8Array(width * height * 4);
      legacy.readRenderTargetPixels(legacyTarget, 0, 0, width, height, expected);
      const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
      let maximum = 0, total = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) {
        const delta = Math.abs(pixels[(y * width + x) * 4 + c] - expected[((flip ? height - y - 1 : y) * width + x) * 4 + c]);
        maximum = Math.max(maximum, delta); total += delta;
      }
      reports.push({ valid, maximum, mean: total / (width * height * 4), flippedRows: flip });
    }
    return { width, height, reports };
  } finally { disposeResources([node.material, legacyMaterial, current, history, legacyCurrent, legacyHistory, target, legacyTarget, geometry, legacy]); }
}
