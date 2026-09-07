import {
  AmbientLight, BackSide, Bone, BufferAttribute, Color, CylinderGeometry, DataTexture,
  DirectionalLight, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, NearestFilter,
  Object3D, PerspectiveCamera, RGBAFormat, RenderTarget, Scene, Skeleton, SkinnedMesh,
  SphereGeometry, SRGBColorSpace, TorusKnotGeometry, UnsignedByteType, Uint16BufferAttribute,
  WebGPUCoordinateSystem, type BufferGeometry, type WebGPURenderer,
} from "three/webgpu";
import { WebGLRenderer, WebGLRenderTarget } from "three";
import { applyActorEnvironmentResponse } from "../render/ActorEnvironmentResponse";
import { applyActorEnvironmentNodeResponse } from "../render/ActorEnvironmentNodeResponse";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

/**
 * The material features the project's actors actually use.
 *
 * Not a survey of what `MeshStandardMaterial` can do: `flat` is the plain
 * costume material, `vertexColors` is how villagers and deer are tinted, `map`
 * is the GLTF atlas the loader assigns, `skinned` is every imported character,
 * and `backSide` is the cloak lining. Each is a separate run because the
 * response composes with the lit result, and a feature that changes how that
 * result is produced can break the composition without breaking the feature.
 */
export type ActorFeature = "flat" | "vertexColors" | "map" | "skinned" | "backSide";

/** A deterministic checker, filtered nearest so no mip differs across backends. */
function createAtlas(): DataTexture {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    const light = (x + y) % 2 === 0;
    data[offset] = light ? 214 : 92;
    data[offset + 1] = light ? 186 : 74;
    data[offset + 2] = light ? 148 : 58;
    data[offset + 3] = 255;
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A colour ramp over the geometry, the way a tinted variant carries one. */
function paintVertexColors(geometry: BufferGeometry): BufferGeometry {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index);
    colors[index * 3] = Math.min(1, Math.abs(Math.sin(x * 1.7)) * 0.8 + 0.2);
    colors[index * 3 + 1] = Math.min(1, Math.abs(Math.cos(y * 1.3)) * 0.7 + 0.25);
    colors[index * 3 + 2] = Math.min(1, Math.abs(Math.sin(x + y)) * 0.6 + 0.3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

/**
 * A two-bone limb, bound and posed.
 *
 * Skinning moves the normal as well as the position, and the response reads the
 * normal — so a skinned run is the one that would catch a node path that skinned
 * the geometry but left the response reading the bind-pose normal.
 */
function buildSkinnedLimb(geometry: BufferGeometry,
  material: MeshStandardMaterial | MeshStandardNodeMaterial) {
  const root = new Bone();
  root.position.set(0, -1.5, 0);
  const tip = new Bone();
  tip.position.set(0, 1.5, 0);
  root.add(tip);
  const mesh = new SkinnedMesh(geometry, material as MeshStandardMaterial);
  mesh.add(root);
  // Bound in the rest pose, then posed. A skeleton constructed from already
  // posed bones derives its inverses from that pose, so the bind transform
  // cancels the bend and the subject is merely displaced rather than deformed —
  // which would leave the run reporting agreement about nothing in particular.
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton([root, tip]));
  tip.rotation.z = 0.6;
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  // What the GLTF loader does to every imported character, and for the same
  // reason: a skinned mesh's bounds are the rest pose's, so a posed limb that
  // reaches outside them is culled by a test that believes it is off screen.
  mesh.frustumCulled = false;
  return mesh;
}

function createSkinnedGeometry(): BufferGeometry {
  const geometry = new CylinderGeometry(0.42, 0.42, 3, 20, 12);
  const position = geometry.getAttribute("position");
  const indices = new Uint16Array(position.count * 4);
  const weights = new Float32Array(position.count * 4);
  for (let index = 0; index < position.count; index++) {
    // A smooth handover across the middle, so the bend is a curve rather than a
    // crease and the interpolated normals are actually exercised.
    const blend = Math.min(1, Math.max(0, (position.getY(index) + 1.5) / 3));
    indices[index * 4] = 0;
    indices[index * 4 + 1] = 1;
    weights[index * 4] = 1 - blend;
    weights[index * 4 + 1] = blend;
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(weights, 4));
  return geometry;
}

/**
 * Compares the portable actor environment response against the shipped patch.
 *
 * The response is two additive terms over the lit result, so it can only be
 * measured on a lit surface: this is the one comparison in the migration that
 * deliberately does *not* isolate a channel, because the whole question is
 * whether the terms land on top of the same lighting rather than replacing it.
 * A node material that overrode `outputNode` instead of `setupOutput` would
 * discard the lighting entirely and still produce a plausible image, which is
 * precisely the mistake this has to catch.
 *
 * Every run is paired with an unpatched control at the same feature, so the
 * response is judged against what the two lighting implementations differ by on
 * their own rather than against an absolute it cannot reach.
 */
export async function compareActorEnvironment(renderer: WebGPURenderer, feature: ActorFeature,
  respond: boolean) {
  const width = 256, height = 192;
  const owned: { dispose(): void }[] = [];
  const atlas = feature === "map" ? createAtlas() : undefined;
  if (atlas) owned.push(atlas);

  /**
   * Built once per side rather than shared between the two renderers.
   *
   * Deterministic construction makes the two byte-identical, so nothing is
   * given up by not sharing — and sharing skinning attributes across a WebGPU
   * and a WebGL renderer does not survive: with the node renderer on WebGPU the
   * reference drew nothing at all, while the same shared geometry rendered
   * correctly when both sides were WebGL 2. That is a property of handing one
   * buffer to two backends, not of the port, so the harness stops doing it.
   */
  const geometries = (): BufferGeometry[] => {
    if (feature === "skinned") return [createSkinnedGeometry()];
    const knot: BufferGeometry = new TorusKnotGeometry(1.1, 0.36, 128, 24);
    const sphere: BufferGeometry = new SphereGeometry(0.85, 48, 32);
    if (feature === "vertexColors") { paintVertexColors(knot); paintVertexColors(sphere); }
    return [knot, sphere];
  };

  const configure = <T extends MeshStandardMaterial | MeshStandardNodeMaterial>(material: T) => {
    material.color.set(feature === "vertexColors" ? 0xffffff : 0xb8a487);
    material.roughness = 0.62;
    material.metalness = 0;
    material.vertexColors = feature === "vertexColors";
    if (atlas) material.map = atlas;
    if (feature === "backSide") material.side = BackSide;
    return material;
  };
  const nodeMaterial = configure(new MeshStandardNodeMaterial());
  if (respond) applyActorEnvironmentNodeResponse(nodeMaterial);
  const legacyMaterial = configure(new MeshStandardMaterial());
  if (respond) applyActorEnvironmentResponse(legacyMaterial);
  owned.push(nodeMaterial, legacyMaterial);

  /**
   * Each renderer gets its own subject. A bone is an `Object3D` and can have
   * only one parent, so the skinned runs cannot share a posed skeleton between
   * two scenes; the two are built from the same deterministic description.
   */
  const populate = (scene: Scene, material: MeshStandardMaterial | MeshStandardNodeMaterial) => {
    scene.background = new Color(0);
    const sun = new DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(4, 6, 5);
    scene.add(sun, new AmbientLight(0x8ba0b8, 0.45));
    const built = geometries();
    owned.push(...built);
    if (feature === "skinned") {
      scene.add(buildSkinnedLimb(built[0], material));
      return;
    }
    const first: Object3D = new Mesh(built[0], material as MeshStandardMaterial);
    first.position.set(-1.2, 0, 0);
    const second: Object3D = new Mesh(built[1], material as MeshStandardMaterial);
    second.position.set(1.5, 0, 0);
    scene.add(first, second);
  };
  const scene = new Scene();
  populate(scene, nodeMaterial);
  const legacyScene = new Scene();
  populate(legacyScene, legacyMaterial);

  const camera = new PerspectiveCamera(45, width / height, 0.1, 40);
  camera.position.set(0, 0.8, feature === "skinned" ? 5.5 : 6.5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const legacy = new WebGLRenderer();
  const target = new RenderTarget(width, height);
  const legacyTarget = new WebGLRenderTarget(width, height);
  owned.push(target, legacyTarget, legacy);
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
    let maximum = 0, total = 0, nonzero = 0, legacyNonzero = 0, differing = 0, shared3 = 0;
    let coverageMismatch = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const reference = ((flip ? height - y - 1 : y) * width + x) * 4;
      const lit = pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 0;
      const legacyLit = expected[reference] + expected[reference + 1] + expected[reference + 2] > 0;
      if (lit) nonzero++;
      if (legacyLit) legacyNonzero++;
      if (lit !== legacyLit) { coverageMismatch++; continue; }
      if (!lit) continue;
      shared3++;
      for (let component = 0; component < 3; component++) {
        const delta = Math.abs(pixels[offset + component] - expected[reference + component]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    return { feature, respond, width, height, maximum, mean: total / Math.max(shared3 * 3, 1),
      differing, nonzero, legacyNonzero, shared: shared3, coverageMismatch, flippedRows: flip };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources(owned);
  }
}
