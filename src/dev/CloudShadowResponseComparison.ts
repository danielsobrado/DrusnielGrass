import {
  Color, DataTexture, LinearFilter, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry,
  RGBAFormat, RenderTarget, RepeatWrapping, Scene, UnsignedByteType, Vector2, Vector3,
  WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { MeshStandardMaterial, WebGLRenderer, WebGLRenderTarget } from "three";
import { cameraPosition, float, mix, positionWorld, vec3, vec4 } from "three/tsl";
import { patchStandardCloudShadowMaterial } from "../render/WorldCloudShadowMaterialPatch";
import { WorldCloudShadowNodes } from "../world/sky/WorldCloudShadowNodes";
import type { WorldCloudShadowUniforms } from "../world/sky/WorldCloudShadowUniforms";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

const SHADOW_RESOLUTION = 64;
const WORLD_SIZE = 400;

/**
 * A shadow map with structure at several scales.
 *
 * Flat transmittance would agree trivially. This carries broad cover, a hard
 * edge and a fine ripple, so a sampler that filtered differently, projected to
 * a different texel or clamped at a different place has somewhere to show it.
 */
function createShadowMap(): DataTexture {
  const data = new Uint8Array(SHADOW_RESOLUTION * SHADOW_RESOLUTION * 4);
  for (let y = 0; y < SHADOW_RESOLUTION; y++) for (let x = 0; x < SHADOW_RESOLUTION; x++) {
    const u = x / SHADOW_RESOLUTION, v = y / SHADOW_RESOLUTION;
    const broad = 0.5 + 0.5 * Math.sin(u * 5.1) * Math.cos(v * 3.7);
    const ripple = 0.5 + 0.5 * Math.sin((u + v) * 27);
    const edge = u > 0.62 && v < 0.44 ? 0.15 : 1;
    const transmittance = Math.max(0, Math.min(1, broad * 0.7 + ripple * 0.3)) * edge;
    const offset = (y * SHADOW_RESOLUTION + x) * 4;
    data[offset] = Math.round(transmittance * 255);
    data[offset + 1] = data[offset];
    data[offset + 2] = data[offset];
    data[offset + 3] = 255;
  }
  const texture = new DataTexture(data, SHADOW_RESOLUTION, SHADOW_RESOLUTION, RGBAFormat,
    UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createUniforms(map: DataTexture): WorldCloudShadowUniforms {
  return {
    uCloudShadowEnabled: { value: 1 },
    uCloudShadowMap: { value: map },
    uCloudShadowOriginXZ: { value: new Vector2(12, -8) },
    uCloudShadowWorldSize: { value: WORLD_SIZE },
    uCloudShadowEdgeFadeUv: { value: 0.08 },
    uCloudBaseHeight: { value: 320 },
    uCloudSunDirection: { value: new Vector3(0.36, 0.82, 0.44).normalize() },
    uCloudFocusTransmittance: { value: 0.74 },
    uCloudShadowDistanceFadeStart: { value: 260 },
    uCloudShadowDistanceFadeEnd: { value: 520 },
  };
}

/**
 * Compares how cloud shadow reaches a material on the two routes.
 *
 * The shadow *map* is already compared elsewhere, and that comparison says
 * nothing about this: the map can be identical while the two paths deliver it
 * to a surface differently. The legacy route walks the scene after the fact and
 * patches `reflectedLight` through `onBeforeCompile`; the node route has no
 * integrator at all, because a material is constructed with a cloud-aware
 * lighting context instead. Those are different enough architecturally that
 * agreement has to be measured rather than assumed.
 *
 * What is isolated is the direct-light scale itself — `mix(1,
 * relativeDirect(sample(world, distance)), responseStrength)` — because that
 * single scalar is the entire contract between the shadow field and any
 * material that responds to it. Both sides read the same uniform table, so a
 * difference here is a difference in projection, filtering, fade or clamping.
 */
export async function compareCloudShadowResponse(renderer: WebGPURenderer,
  responseStrength: number) {
  const width = 256, height = 192;
  const map = createShadowMap();
  const uniforms = createUniforms(map);
  const clouds = new WorldCloudShadowNodes(uniforms);
  // A ground plane wide enough to run off the shadow field on every side, so
  // the edge fade, the outside-the-map branch and the distance fade all run.
  const geometry = new PlaneGeometry(900, 900, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const node = new MeshBasicNodeMaterial();
  const scale = mix(float(1),
    clouds.relativeDirect(clouds.sample(positionWorld, cameraPosition.distance(positionWorld))),
    float(responseStrength));
  node.outputNode = vec4(vec3(scale), 1);

  const legacyMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  legacyMaterial.name = "world-cloud-shadow-response-probe";
  patchStandardCloudShadowMaterial(legacyMaterial, uniforms, responseStrength);
  const patched = legacyMaterial.onBeforeCompile;
  legacyMaterial.onBeforeCompile = (shader, gl) => {
    patched.call(legacyMaterial, shader, gl);
    // The generic scale is declared immediately after `lights_fragment_end`, so
    // it is in scope here; this reads the very variable the patch multiplies
    // the direct light by rather than a re-derivation of it.
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      "outgoingLight = vec3(worldCloudDirectScale);\n#include <opaque_fragment>");
  };
  legacyMaterial.needsUpdate = true;

  const scene = new Scene();
  scene.background = new Color(0);
  scene.add(new Mesh(geometry, node));
  const legacyScene = new Scene();
  legacyScene.background = new Color(0);
  legacyScene.add(new Mesh(geometry, legacyMaterial));

  // Framed so most of the visible ground sits inside the shadow field and
  // within the distance fade, with the far edge running past both. A view that
  // is mostly outside the field compares a constant one against a constant one.
  const camera = new PerspectiveCamera(55, width / height, 0.5, 1500);
  camera.position.set(25, 70, 130);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const legacy = new WebGLRenderer();
  const target = new RenderTarget(width, height);
  const legacyTarget = new WebGLRenderTarget(width, height);
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = await readRenderTargetRgba8(renderer, target);
    legacy.setRenderTarget(legacyTarget);
    legacy.render(legacyScene, camera.clone());
    const expected = new Uint8Array(width * height * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, width, height, expected);
    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    let maximum = 0, total = 0, differing = 0, shaded = 0, lit = 0;
    // The darkest scale the reference produced. This, not a pixel count, is
    // what says the run actually swept a range: `relativeDirect` normalizes by
    // the focus transmittance, so everything at or above focus clamps to full
    // brightness and only genuinely shadowed ground carries a value at all.
    let referenceMinimum = 255;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const reference = ((flip ? height - y - 1 : y) * width + x) * 4;
      if (expected[reference] === 0 && expected[reference + 1] === 0) continue;
      lit++;
      // Fully lit ground is scale 1 everywhere; the run is only meaningful if a
      // real share of it is actually shadowed.
      if (expected[reference] < 250) shaded++;
      referenceMinimum = Math.min(referenceMinimum, expected[reference]);
      for (let component = 0; component < 3; component++) {
        const delta = Math.abs(pixels[offset + component] - expected[reference + component]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    return { responseStrength, width, height, maximum, mean: total / Math.max(lit * 3, 1),
      differing, lit, shaded, referenceMinimum, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([clouds, node, legacyMaterial, geometry, map, target, legacyTarget, legacy]);
  }
}
