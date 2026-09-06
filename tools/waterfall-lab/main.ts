import * as THREE from "three";
import {
  COMPOSITE_FRAGMENT,
  COMPOSITE_VERTEX,
  CURTAIN_FRAGMENT,
  CURTAIN_VERTEX,
  IMPACT_FRAGMENT,
  IMPACT_VERTEX,
  SPLASH_FRAGMENT,
  SPLASH_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  WATER_FRAGMENT,
  WATER_VERTEX,
} from "./WaterfallLabShaders";

/**
 * Waterfall lab.
 *
 * A gorge in isolation, so the parts of the waterfall plan that are cheap to
 * get wrong can be judged before any of them touch the streamed world. Every
 * toggle here maps to a numbered phase in
 * `docs/plans/waterfall-gorge-geology-plan.md`, and every surface is generated
 * in code — no bitmaps, so the question of whether to source real rock textures
 * stays open rather than being answered by accident.
 *
 * Run it with `npm run dev` and open `/waterfall-lab.html`.
 */

const GORGE = {
  /** Half width of the channel floor before the walls take over. */
  channelHalfWidth: 8.5,
  /** Downstream distance over which the floor falls away at the knickpoint. */
  faceLength: 3.5,
  drop: 15.5,
  /**
   * Level reach below the fall, before the floor climbs back to grade. Long
   * enough that the camera standing back from the fall is still over deep
   * water: at 30 m the recovery had already lifted the bed to half a metre
   * under the viewpoint, so the whole foreground read as one pale shallow
   * sheet and there was no depth gradient left to show.
   */
  plungeLength: 48,
  recoveryLength: 46,
  wallHeight: 27,
  /** How deep the fall digs its own bowl. Phase 2.1. */
  scourDepth: 5.4,
  minX: -42,
  maxX: 74,
  maxZ: 34,
  step: 0.55,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

let scourEnabled = true;

/** The long profile: a short face, a level plunge reach, a long recovery. */
function channelFloor(x: number): number {
  const face = smoothstep(x, 0, GORGE.faceLength);
  const plungeEnd = GORGE.faceLength + GORGE.plungeLength;
  const recovery = 1 - smoothstep(x, plungeEnd, plungeEnd + GORGE.recoveryLength);
  return -GORGE.drop * face * recovery - x * 0.014;
}

/**
 * Plunge scour — the thing the world's hydrology never does. The long profile
 * on its own leaves 30 m of dead level floor below the fall, which is exactly
 * why the pool reads flat. This excavates a bowl instead: deepest just
 * downstream of where the jet lands, irregular rather than circular, and
 * asymmetric because the water arrives from one side and leaves by the other.
 */
function plungeScour(x: number, z: number): number {
  if (!scourEnabled) return 0;
  const centerX = GORGE.faceLength + 7.5;
  const dx = (x - centerX) / 14;
  const dz = z / 9.5;
  const radius = Math.hypot(dx, dz);
  if (radius > 2) return 0;
  const angle = Math.atan2(dz, dx);
  // Lobed, so it is a scour hollow and not a crater.
  const warp =
    1 + 0.24 * Math.sin(angle * 3 + 1.1) + 0.14 * Math.sin(angle * 5 - 0.4);
  const bowl = Math.max(0, 1 - (radius / warp) ** 2);
  // Shallower toward the exit, where the flow is already carrying its load away.
  const exit = 1 - 0.34 * smoothstep(x, centerX, centerX + 14);

  /**
   * A smooth lobed ellipse is still a shape you can read the kernel off, and
   * under clear water that is exactly what it looks like — a procedural crater.
   * Real scour cuts into bedding that resists it unevenly, so the hollow comes
   * out stepped and sided rather than dish-shaped. These are metre-scale rock
   * forms, deliberately not noise: the erosion field stays smooth enough for
   * terrain generation while the rendered floor stops advertising its maths.
   */
  const bedding =
    0.5 + 0.5 * Math.sin(x * 0.52 + Math.sin(z * 0.37) * 1.7);
  const jointing =
    0.5 + 0.5 * Math.sin(z * 0.78 - Math.sin(x * 0.29) * 1.2);
  const resistance = 0.68 + 0.22 * bedding + 0.16 * jointing;

  // Coarse material dropped where the flow slackens, filling the hollow back in
  // unevenly at its downstream margin.
  const sediment =
    0.5 *
    Math.max(0, Math.sin(x * 0.42 - 1.1) * Math.cos(z * 0.51 + 0.6)) *
    smoothstep(x, centerX + 2, centerX + 15);

  return Math.max(
    0,
    GORGE.scourDepth * bowl * bowl * exit * resistance - sediment,
  );
}

/**
 * The walls. Macrostructure only — benches, joints and differing recession
 * rates at metre scale. High-frequency displacement here would just turn the
 * cliff back into procedural terrain, which is the look we are escaping.
 */
function wallRise(x: number, z: number): number {
  const outward = Math.abs(z) - GORGE.channelHalfWidth;
  if (outward <= 0) return 0;
  const rise = Math.min(1, outward / 7);
  let height = GORGE.wallHeight * rise ** 0.5;
  // Benches: quantise part of the climb so the face steps rather than ramps.
  const bench = 4.6;
  height = height * 0.62 + Math.floor(height / bench) * bench * 0.38;
  // Vertical joints, recessed a little where the rock has parted.
  const joint = Math.max(0, Math.sin(x * 0.21 + Math.sin(z * 0.09) * 1.4));
  height -= 1.5 * joint ** 3;
  // A buttress of harder rock beside the fall, standing proud of the rest.
  height += 2.6 * Math.exp(-((x - 1.5) ** 2) / 90) * rise;
  return height;
}

function terrainHeight(x: number, z: number): number {
  return channelFloor(x) - plungeScour(x, z) + wallRise(x, z);
}

const LIP_X = 0;
const UPSTREAM_DEPTH = 0.95;
const lipLevel = channelFloor(-1.2) + UPSTREAM_DEPTH;
const poolLevel = channelFloor(GORGE.faceLength + 12) + 1.5;
const fallDrop = lipLevel - poolLevel;
const throwDistance = Math.max(GORGE.faceLength, fallDrop * 0.62);
const impactX = LIP_X + throwDistance;

function buildTerrainGeometry(): THREE.BufferGeometry {
  const columns = Math.round((GORGE.maxX - GORGE.minX) / GORGE.step) + 1;
  const rows = Math.round((GORGE.maxZ * 2) / GORGE.step) + 1;
  const positions = new Float32Array(columns * rows * 3);
  const normals = new Float32Array(columns * rows * 3);
  const shelter = new Float32Array(columns * rows);
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);

  let vertex = 0;
  for (let row = 0; row < rows; row += 1) {
    const z = -GORGE.maxZ + row * GORGE.step;
    for (let column = 0; column < columns; column += 1) {
      const x = GORGE.minX + column * GORGE.step;
      const height = terrainHeight(x, z);
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = height;
      positions[vertex * 3 + 2] = z;

      const epsilon = 0.35;
      const dx = terrainHeight(x + epsilon, z) - terrainHeight(x - epsilon, z);
      const dz = terrainHeight(x, z + epsilon) - terrainHeight(x, z - epsilon);
      const normal = new THREE.Vector3(-dx, 2 * epsilon, -dz).normalize();
      normals[vertex * 3] = normal.x;
      normals[vertex * 3 + 1] = normal.y;
      normals[vertex * 3 + 2] = normal.z;

      // Concavity, for the one thing humidity is allowed to change: moss only
      // grows where the rock shelters it.
      const reach = 2.6;
      const around =
        (terrainHeight(x + reach, z) +
          terrainHeight(x - reach, z) +
          terrainHeight(x, z + reach) +
          terrainHeight(x, z - reach)) *
        0.25;
      shelter[vertex] = clamp((around - height) / 2.4, 0, 1);
      vertex += 1;
    }
  }

  let index = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      indices[index] = a;
      indices[index + 1] = a + columns;
      indices[index + 2] = a + 1;
      indices[index + 3] = a + 1;
      indices[index + 4] = a + columns;
      indices[index + 5] = a + columns + 1;
      index += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("shelter", new THREE.BufferAttribute(shelter, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The curtain. Same parameterisation the world uses — `cascade.xyz` carries
 * (across, fall, drop) — so anything proved here transplants directly into
 * `WaterCascadeGeometry`. Finer than the world's 10x8 because the lab is meant
 * to be looked at closely.
 */
/**
 * The rock lip, as a height profile across the channel.
 *
 * The single most artificial thing about a curtain is that its top edge is a
 * ruled line, and no amount of work in the fragment shader really hides that,
 * because the straightness is in the geometry. Water spills over a rock sill
 * that has been cut unevenly: lower where the channel has notched it, standing
 * proud where the rock is harder. A few low-frequency terms give exactly that
 * and stay deterministic; adding high-frequency noise here would only turn a
 * ruled edge into a fuzzy one.
 */
function crestProfile(lateral: number): number {
  return (
    Math.sin(lateral * 2.3 + 0.7) * 0.36 +
    Math.sin(lateral * 5.1 - 1.4) * 0.17 +
    Math.sin(lateral * 9.7 + 2.2) * 0.08
  );
}

function buildCurtainGeometry(): THREE.BufferGeometry {
  const acrossSegments = 30;
  const downSegments = 26;
  const acrossVertices = acrossSegments + 1;
  const downVertices = downSegments + 1;
  const count = acrossVertices * downVertices;
  const positions = new Float32Array(count * 3);
  const cascade = new Float32Array(count * 3);
  const crest = new Float32Array(count);
  const indices = new Uint32Array(acrossSegments * downSegments * 6);
  const halfWidth = GORGE.channelHalfWidth * 0.82;

  let vertex = 0;
  for (let down = 0; down < downVertices; down += 1) {
    const fall = down / downSegments;
    const crestLift = down === 0 ? 0.45 : 0;
    // Water leaves a lip moving horizontally and only then falls, so travel is
    // front-loaded and descent back-loaded.
    const descent = fall ** 1.75 * fallDrop;
    const width = halfWidth * (1 - 0.22 * fall);
    for (let across = 0; across < acrossVertices; across += 1) {
      const lateral = (across / acrossSegments) * 2 - 1;
      const notch = crestProfile(lateral);
      // The sill's shape only governs where the water leaves it. A couple of
      // metres down the sheet has forgotten the rock and is in free fall, so
      // the offset is blended out rather than carried the whole way.
      const sill = notch * 1.25 * Math.max(0, 1 - fall * 3.2);
      // Water leaving a low notch is already moving faster, and throws further.
      const throwJitter = 1 - notch * 0.16;
      const travel = fall ** 0.58 * throwDistance * throwJitter;
      positions[vertex * 3] = LIP_X + travel - crestLift * 1.4;
      positions[vertex * 3 + 1] = lipLevel - descent + crestLift + sill;
      positions[vertex * 3 + 2] = lateral * width;
      cascade[vertex * 3] = lateral;
      cascade[vertex * 3 + 1] = fall;
      cascade[vertex * 3 + 2] = fallDrop;
      crest[vertex] = notch;
      vertex += 1;
    }
  }

  let index = 0;
  for (let down = 0; down < downSegments; down += 1) {
    for (let across = 0; across < acrossSegments; across += 1) {
      const a = down * acrossVertices + across;
      indices[index] = a;
      indices[index + 1] = a + acrossVertices;
      indices[index + 2] = a + 1;
      indices[index + 3] = a + 1;
      indices[index + 4] = a + acrossVertices;
      indices[index + 5] = a + acrossVertices + 1;
      index += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("cascade", new THREE.BufferAttribute(cascade, 3));
  geometry.setAttribute("crest", new THREE.BufferAttribute(crest, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** A water sheet clipped to wherever the bed actually sits below its level. */
function buildWaterGeometry(
  level: number,
  minX: number,
  maxX: number,
): THREE.BufferGeometry {
  const step = 0.7;
  const columns = Math.round((maxX - minX) / step) + 1;
  const rows = Math.round((GORGE.maxZ * 2) / step) + 1;
  const positions = new Float32Array(columns * rows * 3);
  const depths = new Float32Array(columns * rows);
  const indices: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    const z = -GORGE.maxZ + row * step;
    for (let column = 0; column < columns; column += 1) {
      const x = minX + column * step;
      const vertex = row * columns + column;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = level;
      positions[vertex * 3 + 2] = z;
      depths[vertex] = Math.max(0, level - terrainHeight(x, z));
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + columns;
      const c = a + 1;
      const d = a + columns + 1;
      if (depths[a] + depths[b] + depths[c] + depths[d] <= 0) continue;
      indices.push(a, b, c, c, b, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("depth", new THREE.BufferAttribute(depths, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const scene = new THREE.Scene();
/**
 * The sun has two jobs and they pull in different directions.
 *
 * It has to sit behind the camera for the bow to appear at all — the rainbow is
 * 42 degrees off the antisolar point, so with the camera looking upstream the
 * sun has to be downstream. But a sun straight down the gorge axis rakes both
 * walls at the same grazing angle and they come out equally flat, which is most
 * of why the first capture read as pale cardboard. Giving it a lateral
 * component lights one wall and leaves the other to ambient, and that contrast
 * is what makes a slot gorge look deep.
 */
const SUN_DIRECTION = new THREE.Vector3(0.78, 0.42, 0.46).normalize();
const SUN_COLOR = new THREE.Color(1.52, 1.38, 1.18);
// Rock is dark. An ambient this strong lifts every shadowed face to mid-grey
// and no amount of albedo detail survives it.
const SKY_COLOR = new THREE.Color(0.2, 0.27, 0.37);
const GROUND_COLOR = new THREE.Color(0.06, 0.055, 0.048);

const lightingUniforms = {
  uSunDirection: { value: SUN_DIRECTION },
  uSunColor: { value: new THREE.Vector3(SUN_COLOR.r, SUN_COLOR.g, SUN_COLOR.b) },
  uSkyColor: { value: new THREE.Vector3(SKY_COLOR.r, SKY_COLOR.g, SKY_COLOR.b) },
  uGroundColor: {
    value: new THREE.Vector3(GROUND_COLOR.r, GROUND_COLOR.g, GROUND_COLOR.b),
  },
};

const terrainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    ...lightingUniforms,
    uWetness: { value: 0.45 },
    uRockDetail: { value: 1 },
    uWaterLevel: { value: poolLevel },
  },
  vertexShader: TERRAIN_VERTEX,
  fragmentShader: TERRAIN_FRAGMENT,
});

const curtainCoreMaterial = new THREE.ShaderMaterial({
  uniforms: {
    ...lightingUniforms,
    uTime: { value: 0 },
    uCoreMode: { value: 1 },
    uCoreThreshold: { value: 0.34 },
    uWaterColor: { value: new THREE.Vector3(0.4, 0.56, 0.55) },
    uFoamColor: { value: new THREE.Vector3(0.95, 0.97, 0.98) },
  },
  vertexShader: CURTAIN_VERTEX,
  fragmentShader: CURTAIN_FRAGMENT,
  transparent: false,
  depthWrite: true,
  side: THREE.DoubleSide,
});

const curtainVeilMaterial = new THREE.ShaderMaterial({
  uniforms: {
    ...lightingUniforms,
    uTime: { value: 0 },
    uCoreMode: { value: 0 },
    uCoreThreshold: { value: 0.34 },
    uWaterColor: { value: new THREE.Vector3(0.4, 0.56, 0.55) },
    uFoamColor: { value: new THREE.Vector3(0.95, 0.97, 0.98) },
  },
  vertexShader: CURTAIN_VERTEX,
  fragmentShader: CURTAIN_FRAGMENT,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const waterUniforms = {
  ...lightingUniforms,
  uTime: { value: 0 },
  uShallowColor: { value: new THREE.Vector3(0.33, 0.45, 0.44) },
  uDeepColor: { value: new THREE.Vector3(0.05, 0.12, 0.15) },
  uExtinction: { value: new THREE.Vector3(0.42, 0.22, 0.16) },
  uImpactCenter: { value: new THREE.Vector3(impactX, poolLevel, 0) },
};

const waterMaterial = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  vertexShader: WATER_VERTEX,
  fragmentShader: WATER_FRAGMENT,
  transparent: true,
  depthWrite: false,
  // Front faces only. A water sheet has no thickness, so its underside seen
  // from below in the gorge renders as a hard-edged slab hanging over the lip.
  side: THREE.FrontSide,
});

const impactMaterial = new THREE.ShaderMaterial({
  uniforms: {
    ...lightingUniforms,
    uTime: { value: 0 },
    uImpactCenter: { value: new THREE.Vector3(impactX, poolLevel, 0) },
    uImpactRadius: { value: 8.5 },
    uFoamColor: { value: new THREE.Vector3(0.96, 0.98, 0.99) },
  },
  vertexShader: IMPACT_VERTEX,
  fragmentShader: IMPACT_FRAGMENT,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const SPLASH_COUNT = 900;

function buildSplashGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(SPLASH_COUNT * 3);
  const splash = new Float32Array(SPLASH_COUNT * 4);
  for (let index = 0; index < SPLASH_COUNT; index += 1) {
    // Position is unused — the arc is evaluated in the vertex shader — but the
    // attribute has to exist for three to build the draw range and bounds.
    splash[index * 4] = Math.random();
    splash[index * 4 + 1] = Math.random();
    splash[index * 4 + 2] = Math.random() * Math.PI * 2;
    splash[index * 4 + 3] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("splash", new THREE.BufferAttribute(splash, 4));
  // The arc leaves the origin entirely, so an automatic bound would cull it.
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(impactX, poolLevel + 4, 0),
    26,
  );
  return geometry;
}

const splashMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uImpactCenter: { value: new THREE.Vector3(impactX, poolLevel + 0.1, 0) },
    uImpactRadius: { value: 8.5 },
    uSplashSize: { value: 1 },
    uFoamColor: { value: new THREE.Vector3(0.97, 0.99, 1.0) },
  },
  vertexShader: SPLASH_VERTEX,
  fragmentShader: SPLASH_FRAGMENT,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const splashPoints = new THREE.Points(buildSplashGeometry(), splashMaterial);
splashPoints.renderOrder = 11;
splashPoints.frustumCulled = false;
scene.add(splashPoints);

const curtainGeometry = buildCurtainGeometry();
const curtainCore = new THREE.Mesh(curtainGeometry, curtainCoreMaterial);
const curtainVeil = new THREE.Mesh(curtainGeometry, curtainVeilMaterial);
// The core is opaque and writes depth, so it must reach the GPU before the
// water it is meant to hide. This ordering is the entire point of the split.
curtainCore.renderOrder = 0;
curtainVeil.renderOrder = 10;
scene.add(curtainCore, curtainVeil);

const impactGeometry = new THREE.PlaneGeometry(24, 24, 1, 1);
impactGeometry.rotateX(-Math.PI / 2);
impactGeometry.translate(impactX, poolLevel + 0.07, 0);
const impactMesh = new THREE.Mesh(impactGeometry, impactMaterial);
impactMesh.renderOrder = 9;
scene.add(impactMesh);

let terrainMesh = new THREE.Mesh(buildTerrainGeometry(), terrainMaterial);
scene.add(terrainMesh);

let poolMesh = new THREE.Mesh(
  buildWaterGeometry(poolLevel, GORGE.faceLength - 1, GORGE.maxX),
  waterMaterial,
);
poolMesh.renderOrder = 8;
scene.add(poolMesh);

const upstreamMesh = new THREE.Mesh(
  buildWaterGeometry(lipLevel, GORGE.minX, LIP_X - 0.2),
  waterMaterial,
);
upstreamMesh.renderOrder = 8;
scene.add(upstreamMesh);

function rebuildTerrain(): void {
  scene.remove(terrainMesh);
  terrainMesh.geometry.dispose();
  terrainMesh = new THREE.Mesh(buildTerrainGeometry(), terrainMaterial);
  scene.add(terrainMesh);

  scene.remove(poolMesh);
  poolMesh.geometry.dispose();
  poolMesh = new THREE.Mesh(
    buildWaterGeometry(poolLevel, GORGE.faceLength - 1, GORGE.maxX),
    waterMaterial,
  );
  poolMesh.renderOrder = 8;
  scene.add(poolMesh);
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// The lab renders linear into a float target and does its own tone mapping and
// gamma in the composite, so three must not convert a second time.
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
camera.position.set(impactX + 33, poolLevel + 5.2, 8);

let target = createTarget(1, 1);

function createTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    depthTexture,
  });
}

const compositeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    ...lightingUniforms,
    tColor: { value: null },
    tDepth: { value: null },
    uInverseViewProjection: { value: new THREE.Matrix4() },
    uCameraPosition: { value: new THREE.Vector3() },
    uMistCenter: { value: new THREE.Vector3(impactX + 1.5, poolLevel + 4.5, 0) },
    uMistRadius: { value: 13 },
    // Optical depth per metre. At 0.055 the plume filled a third of the frame
    // and greyed out the whole gorge behind it.
    uMistDensity: { value: 0.03 },
    uRainbowStrength: { value: 1 },
    uPoolLevel: { value: poolLevel },
    uTime: { value: 0 },
    uExposure: { value: 1.1 },
  },
  vertexShader: COMPOSITE_VERTEX,
  fragmentShader: COMPOSITE_FRAGMENT,
  depthTest: false,
  depthWrite: false,
});
const compositeScene = new THREE.Scene();
compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial));
const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const pixelRatio = renderer.getPixelRatio();
  const bufferWidth = Math.max(1, Math.floor(width * pixelRatio));
  const bufferHeight = Math.max(1, Math.floor(height * pixelRatio));
  target.dispose();
  target.depthTexture?.dispose();
  target = createTarget(bufferWidth, bufferHeight);
}
window.addEventListener("resize", resize);

// Fly controls. Drag to look, WASD to move, Q/E for height.
const keys = new Set<string>();
// Looking back upstream at the fall: the camera's forward is -Z rotated about
// Y, so a half-pi yaw points it along -X, which is the way the gorge runs.
let yaw = Math.PI / 2;
let pitch = -0.06;
let dragging = false;

canvas.addEventListener("mousedown", () => {
  dragging = true;
});
window.addEventListener("mouseup", () => {
  dragging = false;
});
window.addEventListener("mousemove", (event) => {
  if (!dragging) return;
  yaw -= event.movementX * 0.0032;
  pitch = clamp(pitch - event.movementY * 0.0032, -1.45, 1.45);
});
window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  handleToggle(event.key);
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

const state = {
  rockDetail: true,
  wetness: 0.45,
  opaqueCore: true,
  mist: true,
  rainbow: true,
  scour: true,
  impactFoam: true,
  splash: true,
};

function handleToggle(key: string): void {
  switch (key) {
    case "1":
      state.rockDetail = !state.rockDetail;
      terrainMaterial.uniforms.uRockDetail.value = state.rockDetail ? 1 : 0;
      break;
    case "2":
      // The acceptance test from the plan: humidity to maximum, and the cliff
      // must still be rock.
      state.wetness = state.wetness >= 0.99 ? 0 : state.wetness >= 0.44 ? 1 : 0.45;
      terrainMaterial.uniforms.uWetness.value = state.wetness;
      break;
    case "3":
      state.opaqueCore = !state.opaqueCore;
      curtainCore.visible = state.opaqueCore;
      // Without the opaque pass the veil has to draw the whole sheet itself.
      curtainVeilMaterial.uniforms.uCoreThreshold.value = state.opaqueCore ? 0.34 : 10;
      break;
    case "4":
      state.mist = !state.mist;
      compositeMaterial.uniforms.uMistDensity.value = state.mist ? 0.055 : 0;
      break;
    case "5":
      state.rainbow = !state.rainbow;
      compositeMaterial.uniforms.uRainbowStrength.value = state.rainbow ? 1 : 0;
      break;
    case "6":
      state.scour = !state.scour;
      scourEnabled = state.scour;
      rebuildTerrain();
      break;
    case "7":
      state.impactFoam = !state.impactFoam;
      impactMesh.visible = state.impactFoam;
      break;
    case "8":
      state.splash = !state.splash;
      splashPoints.visible = state.splash;
      break;
    default:
      break;
  }
  updateHud();
}

const hud = document.getElementById("hud") as HTMLPreElement;
let fps = 0;
let sceneCalls = 0;
let sceneTriangles = 0;

function updateHud(): void {
  const flag = (on: boolean) => (on ? "on " : "off");
  hud.textContent = [
    `${fps.toFixed(0)} fps   ${sceneCalls} calls   ` +
      `${(sceneTriangles / 1000).toFixed(1)}k tris`,
    "",
    `1  rock detail      ${flag(state.rockDetail)}   phase 1.2/1.3`,
    `2  wetness          ${state.wetness.toFixed(2)}       phase 1.2 acceptance`,
    `3  opaque core      ${flag(state.opaqueCore)}   phase 3.1`,
    `4  plunge mist      ${flag(state.mist)}   phase 4.1`,
    `5  rainbow          ${flag(state.rainbow)}   phase 4.2`,
    `6  plunge scour     ${flag(state.scour)}   phase 2.1`,
    `7  impact foam      ${flag(state.impactFoam)}   phase 3.x`,
    `8  splash           ${flag(state.splash)}   phase 4.x`,
    "",
    "drag to look, WASD to move, Q/E height, shift to sprint",
  ].join("\n");
}

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const clock = new THREE.Clock();
let frames = 0;
let fpsAccumulator = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  frames += 1;
  fpsAccumulator += delta;
  if (fpsAccumulator >= 0.5) {
    fps = frames / fpsAccumulator;
    frames = 0;
    fpsAccumulator = 0;
    updateHud();
  }

  camera.rotation.set(pitch, yaw, 0, "YXZ");
  camera.getWorldDirection(forward);
  right.crossVectors(forward, camera.up).normalize();
  const speed = (keys.has("shift") ? 34 : 12) * delta;
  if (keys.has("w")) camera.position.addScaledVector(forward, speed);
  if (keys.has("s")) camera.position.addScaledVector(forward, -speed);
  if (keys.has("d")) camera.position.addScaledVector(right, speed);
  if (keys.has("a")) camera.position.addScaledVector(right, -speed);
  if (keys.has("e")) camera.position.y += speed;
  if (keys.has("q")) camera.position.y -= speed;

  curtainCoreMaterial.uniforms.uTime.value = elapsed;
  curtainVeilMaterial.uniforms.uTime.value = elapsed;
  waterUniforms.uTime.value = elapsed;
  impactMaterial.uniforms.uTime.value = elapsed;
  splashMaterial.uniforms.uTime.value = elapsed;
  compositeMaterial.uniforms.uTime.value = elapsed;

  renderer.setRenderTarget(target);
  renderer.setClearColor(0x9fb4c4, 1);
  renderer.clear();
  renderer.render(scene, camera);
  // Snapshot before the composite pass, or the HUD only ever reports the one
  // fullscreen quad that ran last.
  sceneCalls = renderer.info.render.calls;
  sceneTriangles = renderer.info.render.triangles;

  camera.updateMatrixWorld();
  const inverse = compositeMaterial.uniforms.uInverseViewProjection
    .value as THREE.Matrix4;
  inverse.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
  (compositeMaterial.uniforms.uCameraPosition.value as THREE.Vector3).copy(
    camera.position,
  );
  compositeMaterial.uniforms.tColor.value = target.texture;
  compositeMaterial.uniforms.tDepth.value = target.depthTexture;

  renderer.setRenderTarget(null);
  renderer.render(compositeScene, compositeCamera);
}

resize();
updateHud();
animate();
