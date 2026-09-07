import {
  BoxGeometry, Color, Mesh, MeshBasicMaterial, MeshBasicNodeMaterial, OrthographicCamera,
  PerspectiveCamera, PlaneGeometry, QuadMesh, RenderTarget, Scene, Vector2,
  WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from "three";
import { float, texture, uv, vec3, vec4 } from "three/tsl";
import { WaterRefractionNodePass } from "../world/hydrology/WaterRefractionNodePass";
import { WaterRefractionPass, WATER_REFRACTION_LAYER } from "../world/hydrology/WaterRefractionPass";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { renderNodePass } from "../render/RenderNodePass";
import { disposeResources } from "../render/ResourceDisposal";

/** What the run measures: the captured radiance, or what the depth says exists. */
export type WaterRefractionChannel = "capture" | "coverage";

const REFRACTION_BACKGROUND_DEPTH = 0.9999;

/**
 * Three boxes, two of which the water may look through.
 *
 * Membership is the whole reason this pass exists, so the scene has to contain
 * something that must be captured and something that must not. The excluded box
 * sits between the camera and one of the included ones, so a pass that ignored
 * the layer would not merely add a box — it would occlude one that belongs.
 */
function createRefractionScene() {
  const scene = new Scene();
  scene.background = new Color(0x101820);
  const geometry = new BoxGeometry(1.4, 1.4, 1.4);
  const owned: Mesh[] = [];
  const add = (x: number, z: number, color: number, refractable: boolean) => {
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ color }));
    mesh.position.set(x, 0, z);
    mesh.rotation.set(0.4, 0.7, 0.2);
    if (refractable) mesh.layers.enable(WATER_REFRACTION_LAYER);
    scene.add(mesh);
    owned.push(mesh);
    return mesh;
  };
  add(-1.6, 0, 0xc84a2a, true);
  add(1.6, 0, 0x2a7ec8, true);
  add(0, 1.6, 0x2ec84a, false);
  return { scene, geometry, owned };
}

/**
 * Compares the portable refraction capture against the shipped one.
 *
 * Two things are measured, because two different failures are possible and only
 * one of them shows in the colour. The capture itself proves the layer mask,
 * the clear and the target sizing agree. The coverage mask proves the depth
 * attachment means the same thing on both paths: the surface treats depth 1 as
 * "no refractable geometry here" and keeps its own colour, so a capture whose
 * depth reads as near-1 everywhere would blend an empty target into the water —
 * which is exactly the failure that produced pure-black grazing-angle water
 * before the depth test existed. A colour-only comparison cannot see it.
 */
export async function compareWaterRefraction(renderer: WebGPURenderer,
  channel: WaterRefractionChannel) {
  const width = 256, height = 192;
  const { scene, geometry, owned } = createRefractionScene();
  const camera = new PerspectiveCamera(45, width / height, 0.1, 40);
  camera.position.set(0, 1.4, 6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // Half scale, as production runs it, over a drawing buffer this size.
  const node = new WaterRefractionNodePass(0.5);
  const legacyPass = new WaterRefractionPass(0.5);
  const legacy = new WebGLRenderer();
  legacy.setSize(width, height, false);
  const previous = renderer.getRenderTarget();
  const previousSize = renderer.getSize(new Vector2());
  const previousPixelRatio = renderer.getPixelRatio();
  const maskQuad = new QuadMesh();
  const maskGeometry = new PlaneGeometry(2, 2);
  let maskTarget: RenderTarget | undefined;
  let legacyMaskTarget: WebGLRenderTarget | undefined;
  let maskMesh: Mesh | undefined;
  let maskScene: Scene | undefined;
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    node.render(renderer, scene, camera);
    legacyPass.render(legacy, scene, camera);
    const nodeTarget = node.texture, legacyTexture = legacyPass.texture;
    if (!nodeTarget || !legacyTexture) throw new Error("Refraction pass produced no capture");
    const captureWidth = Math.floor(width * 0.5), captureHeight = Math.floor(height * 0.5);

    let pixels: Uint8Array;
    let expected = new Uint8Array(captureWidth * captureHeight * 4);
    if (channel === "capture") {
      // Both captures are read straight out of the pass's own target.
      const capture = node.renderTarget, legacyCapture = legacyPass.renderTarget;
      if (!capture || !legacyCapture) throw new Error("Refraction pass produced no target");
      pixels = await readRenderTargetRgba8(renderer, capture);
      legacy.readRenderTargetPixels(legacyCapture, 0, 0, captureWidth, captureHeight, expected);
    } else {
      // The depth attachment, resolved through the same threshold the surface
      // applies, so the comparison asks the question the material asks.
      const depth = node.depthTexture, legacyDepth = legacyPass.depthTexture;
      if (!depth || !legacyDepth) throw new Error("Refraction pass produced no depth texture");
      maskTarget = new RenderTarget(captureWidth, captureHeight);
      const maskMaterial = new MeshBasicNodeMaterial();
      maskMaterial.outputNode = vec4(
        vec3(texture(depth).sample(uv()).r.lessThan(REFRACTION_BACKGROUND_DEPTH)
          .select(float(1), float(0))), 1);
      maskQuad.material = maskMaterial;
      renderNodePass(renderer, maskTarget, maskQuad);
      pixels = await readRenderTargetRgba8(renderer, maskTarget);
      maskMaterial.dispose();

      legacyMaskTarget = new WebGLRenderTarget(captureWidth, captureHeight);
      maskScene = new Scene();
      maskMesh = new Mesh(maskGeometry, new ShaderMaterial({
        uniforms: { tDepth: { value: legacyDepth } },
        vertexShader: "varying vec2 vUv;\nvoid main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
        fragmentShader: "uniform sampler2D tDepth;\nvarying vec2 vUv;\nvoid main(){"
          + `gl_FragColor=vec4(vec3(texture2D(tDepth,vUv).r < ${REFRACTION_BACKGROUND_DEPTH}`
          + " ? 1.0 : 0.0),1.0);}",
      }));
      maskScene.add(maskMesh);
      legacy.setRenderTarget(legacyMaskTarget);
      legacy.render(maskScene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
      expected = new Uint8Array(captureWidth * captureHeight * 4);
      legacy.readRenderTargetPixels(legacyMaskTarget, 0, 0, captureWidth, captureHeight, expected);
    }

    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    let maximum = 0, total = 0, nonzero = 0, legacyNonzero = 0, differing = 0;
    for (let y = 0; y < captureHeight; y++) for (let x = 0; x < captureWidth; x++) {
      const offset = (y * captureWidth + x) * 4;
      const reference = ((flip ? captureHeight - y - 1 : y) * captureWidth + x) * 4;
      if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 0) nonzero++;
      if (expected[reference] + expected[reference + 1] + expected[reference + 2] > 0) {
        legacyNonzero++;
      }
      for (let component = 0; component < 3; component++) {
        const delta = Math.abs(pixels[offset + component] - expected[reference + component]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    const samples = captureWidth * captureHeight * 3;
    return { channel, width: captureWidth, height: captureHeight, maximum, mean: total / samples,
      differing, nonzero, legacyNonzero, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    renderer.setPixelRatio(previousPixelRatio);
    renderer.setSize(previousSize.x, previousSize.y, false);
    disposeResources([node, legacyPass, geometry, maskGeometry, maskTarget, legacyMaskTarget,
      legacy, ...owned.map(mesh => mesh.material as MeshBasicMaterial),
      maskMesh?.material as ShaderMaterial | undefined]);
  }
}
