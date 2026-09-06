import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  STONE_ARCHETYPE_IDS,
  type StoneArchetypeId,
} from "../../src/world/stones/StoneRecipe";
import {
  resolveStoneFormationOffset,
  resolveStoneFragmentRecipe,
  stoneFormationSplits,
  type StoneFragmentId,
} from "../../src/world/stones/StoneFormation";
import { resolveQualityStoneRecipe } from "../../src/world/stones/StoneShapeQuality";
import { generateStoneMesh } from "../../src/world/stones/StoneGeometry";
import { WorldConfigLoader } from "../../src/world/WorldConfigLoader";
import {
  WORLD_DEFAULT_EXPOSURE,
  WORLD_DEFAULT_HEMISPHERE_GROUND,
  WORLD_DEFAULT_HEMISPHERE_INTENSITY,
  WORLD_DEFAULT_HEMISPHERE_SKY,
  WORLD_DEFAULT_SUN,
  WORLD_DEFAULT_SUN_INTENSITY,
  WORLD_SUN_DIRECTION,
  WORLD_SUN_SHADOW_HALF_EXTENT,
  WORLD_TONE_MAPPING,
} from "../../src/app/WorldEnvironmentTuning";
import { resolveStoneVertexWetness } from "../../src/world/stones/StoneWetness";
import { applyStoneSurfaceShader } from "../../src/world/stones/StoneGrowthShader";
import {
  STONE_PALETTES,
  colorizeStoneVertices,
  type StonePalette,
  type StonePaletteKey,
} from "../../src/world/stones/StonePalette";

type GrowthMode = "none" | "moss" | "lichen";

const params = new URLSearchParams(window.location.search);

function readNumberParam(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `Invalid ${name}=${raw}; expected a number in [${minimum}, ${maximum}].`,
    );
  }
  return value;
}

function isArchetype(value: string): value is StoneArchetypeId {
  return (STONE_ARCHETYPE_IDS as readonly string[]).includes(value);
}

function isPalette(value: string): value is StonePaletteKey {
  return Object.prototype.hasOwnProperty.call(STONE_PALETTES, value);
}

function readGrowthMode(value: string | null): GrowthMode {
  if (value === null) return "none";
  if (value === "none" || value === "moss" || value === "lichen") {
    return value;
  }
  throw new Error(`Invalid growth=${value}; expected none, moss, or lichen.`);
}

const seedOffset = Math.trunc(
  readNumberParam("seed", 0, -2147483648, 2147483647),
);
const paletteParam = params.get("palette");
if (paletteParam !== null && !isPalette(paletteParam)) {
  throw new Error(`Unknown stone palette: ${paletteParam}.`);
}
const scaleParam = readNumberParam("scale", 1, 0.05, 20);
const focusParam = params.get("focus");
if (focusParam !== null && !isArchetype(focusParam)) {
  throw new Error(`Unknown stone archetype: ${focusParam}.`);
}
const mossParam = readNumberParam("moss", 0.7, 0, 1);
/** Waterline as a share of body height, for inspecting the wet-stone response. */
const wetParam = readNumberParam("wet", 0, 0, 1);
const growthParam = readGrowthMode(params.get("growth"));
const chipsParam = params.get("chips") !== "0";
/** Draw each splittable body as the mated pair it becomes in the world. */
function readFormationMode(value: string | null): "off" | "pair" | "a" | "b" {
  if (value === null || value === "0") return "off";
  if (value === "1") return "pair";
  if (value === "a" || value === "b") return value;
  throw new Error(`Invalid formation=${value}; expected 1, a, or b.`);
}
/**
 * "1" draws the mated pair as the world does. "a" or "b" draws that half alone
 * and turns its break toward the camera, which is the only way to look at the
 * break face: on a pair the two faces point at each other and are invisible
 * however wide the crack is opened.
 */
const formationParam = readFormationMode(params.get("formation"));
/**
 * Crack width, in metres. The world picks its own narrow value; opening this up
 * is the only way to inspect the break faces, which a mated pair points at each
 * other and hides completely.
 */
const crackParam = readNumberParam("crack", 0.05, 0, 2);
/** Contact shading and edge softness only read at close range; frame for it. */
const columnsParam = Math.trunc(readNumberParam("columns", 8, 1, 16));
const distanceParam = readNumberParam("dist", 0, 0, 80);
/**
 * Blade cards around each contact rim.
 *
 * The world never shows a stone against bare ground: grass grows up to the
 * clearance edge and the planted skirt thickens just outside it, so a real base
 * is a broken silhouette. On the bare probe plane a body reads as sitting *on*
 * the world rather than *in* it, which pushes embed and contact shading toward
 * values that are wrong once vegetation is back. This is a judging aid only --
 * it is not the grass system and does not read its config.
 */
const grassParam = params.get("grass") === "1";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
const out = document.querySelector<HTMLElement>("#out");
if (!canvas) {
  throw new Error("Canvas #canvas missing.");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = WORLD_TONE_MAPPING;
renderer.toneMappingExposure = WORLD_DEFAULT_EXPOSURE;
// Production casts and receives stone shadows at detail LOD. Without them the
// probe hides the two things the contact rim and the mated crack are for, and
// every tuning decision made here is made against a darker, flatter image than
// the one that ships.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#bfd4df");

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
if (distanceParam > 0) {
  camera.position.set(0, distanceParam * 0.34, distanceParam);
} else if (focusParam) {
  camera.position.set(0.6, 2.6, 6.2);
} else {
  camera.position.set(0, 9.5, 15.5);
}

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.4, 0);
controls.update();

// Stone paint is judged against exposure, so the probe has to stand under the
// world's own lights and tone-mapping curve.
scene.add(
  new THREE.HemisphereLight(
    WORLD_DEFAULT_HEMISPHERE_SKY,
    WORLD_DEFAULT_HEMISPHERE_GROUND,
    WORLD_DEFAULT_HEMISPHERE_INTENSITY,
  ),
);
const sun = new THREE.DirectionalLight(
  WORLD_DEFAULT_SUN,
  WORLD_DEFAULT_SUN_INTENSITY,
);
sun.position
  .set(...WORLD_SUN_DIRECTION)
  .normalize()
  .multiplyScalar(60);
sun.castShadow = true;
scene.add(sun);
scene.add(sun.target);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshLambertMaterial({
    color: new THREE.Color(growthParam === "none" ? "#466f3a" : "#66543a"),
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const configRequest = new XMLHttpRequest();
configRequest.open("GET", "/config/world.yaml", false);
configRequest.send();
if (configRequest.status !== 200 && configRequest.status !== 0) {
  throw new Error(`Unable to load world config: HTTP ${configRequest.status}.`);
}
const config = new WorldConfigLoader().parse(configRequest.responseText);
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
material.dithering = true;
// Both grain terms need the texture. Gating on the albedo term alone meant the
// probe silently dropped the whole grain path whenever only the normal term
// was on, which is the configuration that ships. WorldStoneSystem has always
// tested both; this is the probe catching up.
const grainTexture =
  config.stoneGrainStrength > 0 || config.stoneGrainNormalStrength > 0
    ? createProbeGrainTexture()
    : undefined;
applyStoneSurfaceShader(material, config, grainTexture);

const paletteColumns: StonePalette[] = paletteParam
  ? [STONE_PALETTES[paletteParam]]
  : [
      STONE_PALETTES.meadowSage,
      STONE_PALETTES.meadowSage,
      STONE_PALETTES.graniteGrey,
      STONE_PALETTES.graniteGrey,
      STONE_PALETTES.steppeTan,
      STONE_PALETTES.steppeTan,
      STONE_PALETTES.mossy,
      STONE_PALETTES.mossy,
    ];

const columns = columnsParam;
const spacing = 2.6;
const GROWTH_EPSILON = 1e-4;
let totalTriangles = 0;
let formations = 0;
let totalVertices = 0;

interface ContactRing {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}
const contacts: ContactRing[] = [];

const shownArchetypes: readonly StoneArchetypeId[] = focusParam
  ? [focusParam]
  : STONE_ARCHETYPE_IDS;

shownArchetypes.forEach((archetype: StoneArchetypeId, row: number) => {
  for (let column = 0; column < columns; column += 1) {
    const seed = (seedOffset + row * 101 + column * 17 + 5) >>> 0;
    const parent = resolveQualityStoneRecipe(archetype, seed);
    const rowScale =
      archetype === "pebble"
        ? 0.4
        : archetype === "outcrop"
          ? 1.3
          : archetype === "slab"
            ? 1.15
            : 1;
    const scale = scaleParam * rowScale;
    const cellX = (column - (columns - 1) / 2) * spacing;
    const cellZ = (row - (shownArchetypes.length - 1) / 2) * spacing;
    const splits = formationParam !== "off" && stoneFormationSplits(parent);
    const fragments: readonly StoneFragmentId[] = !splits
      ? ["whole"]
      : formationParam === "pair"
        ? ["a", "b"]
        : [formationParam];
    if (splits) formations += 1;
    const bodies = fragments.map((fragment) =>
      generateStoneMesh(
        resolveStoneFragmentRecipe(parent, fragment),
        chipsParam,
      ),
    );
    const major = splits
      ? generateStoneMesh(resolveStoneFragmentRecipe(parent, "a"), chipsParam)
      : undefined;
    const minor = splits
      ? generateStoneMesh(resolveStoneFragmentRecipe(parent, "b"), chipsParam)
      : undefined;
    const parted =
      major && minor
        ? resolveStoneFormationOffset(
            major.metrics,
            minor.metrics,
            scale,
            crackParam,
          )
        : undefined;
    // A right-handed turn about +Y sends a local bearing to itself minus the
    // yaw, so this lands the parting direction on +Z, straight at the camera.
    // The minor half's break points the other way and needs the opposite turn.
    const yaw =
      parted && formationParam !== "pair" && formationParam !== "off"
        ? Math.atan2(parted.z, parted.x) -
          (formationParam === "a" ? Math.PI / 2 : -Math.PI / 2)
        : (seed % 360) * (Math.PI / 180);

    bodies.forEach((mesh, piece) => {
      totalTriangles += mesh.metrics.triangleCount;
      totalVertices += mesh.metrics.vertexCount;

      const palette =
        paletteColumns[Math.min(column, paletteColumns.length - 1)];
      const colors = new Float32Array(mesh.tones.length * 3);
      colorizeStoneVertices(
        mesh.tones,
        mesh.wears,
        mesh.bounces,
        mesh.minerals,
        mesh.weatherings,
        mesh.cavities,
        undefined,
        palette,
        {
          valueScale: 0.94 + ((seed * 2654435761) >>> 28) / 160,
        },
        colors,
      );

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(mesh.positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(mesh.normals, 3),
      );
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mosses = new Float32Array(mesh.mosses.length);
      const lichens = new Float32Array(mesh.mosses.length);
      const seeds = new Float32Array(mesh.mosses.length);
      const growthPositions = new Float32Array(mesh.mosses.length * 3);
      const mossColors = new Float32Array(mesh.mosses.length * 3);
      const wets = new Float32Array(mesh.mosses.length);
      const beddings = new Float32Array(mesh.mosses.length);
      const lichenColors = new Float32Array(mesh.mosses.length * 3);
      const inverseGrowthRadius =
        0.5 / Math.max(mesh.metrics.footprintRadius, GROWTH_EPSILON);
      const inverseGrowthHeight =
        1 / Math.max(mesh.metrics.height, GROWTH_EPSILON);
      // No hydrology in the probe, so there is no splash climb: the visible wet
      // top and the geological waterline are the same height.
      const probeWaterlineY = mesh.metrics.height * wetParam;
      for (let vertex = 0; vertex < mesh.mosses.length; vertex += 1) {
        mosses[vertex] =
          growthParam === "moss"
            ? Math.max(
                Math.min(1, mesh.mosses[vertex] * (1.5 + mossParam)),
                mossParam * 0.82,
              )
            : 0;
        lichens[vertex] = growthParam === "lichen" ? 0.82 : 0;
        seeds[vertex] = (seed % 104729) / 104729;
        const offset = vertex * 3;
        growthPositions[offset] = mesh.positions[offset] * inverseGrowthRadius;
        growthPositions[offset + 1] =
          mesh.positions[offset + 1] * inverseGrowthHeight;
        growthPositions[offset + 2] =
          mesh.positions[offset + 2] * inverseGrowthRadius;
        mossColors[offset] = palette.moss.r;
        mossColors[offset + 1] = palette.moss.g;
        mossColors[offset + 2] = palette.moss.b;
        lichenColors[offset] = palette.lichen.r;
        lichenColors[offset + 1] = palette.lichen.g;
        lichenColors[offset + 2] = palette.lichen.b;
        wets[vertex] =
          wetParam > 0
            ? resolveStoneVertexWetness(
                { strength: 1, waterlineY: probeWaterlineY, topY: probeWaterlineY },
                mesh.positions[offset + 1],
              )
            : 0;
        beddings[vertex] = mesh.metrics.bedding;
      }
      geometry.setAttribute("stoneWet", new THREE.BufferAttribute(wets, 1));
      geometry.setAttribute(
        "stoneBedding",
        new THREE.BufferAttribute(beddings, 1),
      );
      geometry.setAttribute(
        "stoneWeathering",
        new THREE.BufferAttribute(mesh.weatherings, 1),
      );
      geometry.setAttribute("stoneMoss", new THREE.BufferAttribute(mosses, 1));
      geometry.setAttribute(
        "stoneLichen",
        new THREE.BufferAttribute(lichens, 1),
      );
      geometry.setAttribute(
        "stoneGrowthSeed",
        new THREE.BufferAttribute(seeds, 1),
      );
      geometry.setAttribute(
        "stoneGrowthPosition",
        new THREE.BufferAttribute(growthPositions, 3),
      );
      geometry.setAttribute(
        "stoneMossColor",
        new THREE.BufferAttribute(mossColors, 3),
      );
      geometry.setAttribute(
        "stoneLichenColor",
        new THREE.BufferAttribute(lichenColors, 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

      const object = new THREE.Mesh(geometry, material);
      object.castShadow = true;
      object.receiveShadow = true;
      object.scale.setScalar(scale);
      // The pair is offset in the major half's mesh space, so the placement turn
      // has to be applied to the offset exactly as the object matrix applies it.
      const offsetX = piece === 1 && parted ? parted.x : 0;
      const offsetZ = piece === 1 && parted ? parted.z : 0;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      object.position.set(
        cellX + offsetX * cos + offsetZ * sin,
        -mesh.metrics.embed * mesh.metrics.height * scale * 0.5,
        cellZ - offsetX * sin + offsetZ * cos,
      );
      object.rotation.y = yaw;
      scene.add(object);
      contacts.push({
        x: object.position.x,
        z: object.position.z,
        radius: mesh.metrics.contactRadius * scale,
      });
    });
  }
});

configureProbeShadow(
  Math.max(
    (columns * spacing) / 2,
    (shownArchetypes.length * spacing) / 2,
  ) + 2,
);
if (grassParam) {
  scene.add(createContactGrass(contacts));
}

if (out) {
  out.textContent = `${shownArchetypes.length * columns} stones${formations > 0 ? ` (${formations} mated formations)` : ""} · ${totalTriangles.toLocaleString()} tris · ${totalVertices.toLocaleString()} verts · rows: ${shownArchetypes.join(", ")}`;
}

/**
 * Match the world's shadow *quality*, not its frustum.
 *
 * The gallery frames a grid, not a player, so copying
 * `WORLD_SUN_SHADOW_HALF_EXTENT` would either clip the outer columns or waste
 * most of the map on empty plane. Sizing the extent to the grid and holding the
 * production metres-per-texel keeps the penumbra the same width on screen,
 * which is the part a contact rim is judged against.
 */
function configureProbeShadow(halfExtent: number): void {
  const productionTexel = (2 * WORLD_SUN_SHADOW_HALF_EXTENT) / 1024;
  const maxTextureSize = renderer.capabilities.maxTextureSize;
  const size = Math.min(
    4096,
    maxTextureSize,
    Math.max(1024, 2 ** Math.ceil(Math.log2((2 * halfExtent) / productionTexel))),
  );
  sun.shadow.camera.left = -halfExtent;
  sun.shadow.camera.right = halfExtent;
  sun.shadow.camera.top = halfExtent;
  sun.shadow.camera.bottom = -halfExtent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = sun.position.length() + halfExtent * 2;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0008;
  sun.shadow.mapSize.set(size, size);
}

/** Deterministic per-call noise, so a capture is byte-stable across runs. */
function probeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One-triangle blade cards ringing each contact rim.
 *
 * Deliberately the repo's own near-field blade form -- a tapered triangle with
 * a root darker than its tip -- so the value the base is judged against is the
 * one the grass field actually puts there. Density falls off outward across the
 * skirt band rather than stopping at the clearance edge.
 */
function createContactGrass(rings: readonly ContactRing[]): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const root = new THREE.Color("#2f4326");
  const tip = new THREE.Color("#7fa04d");

  rings.forEach((ring, index) => {
    const random = probeRandom(index * 2654435761 + 17);
    const tufts = Math.max(20, Math.round(ring.radius * 62));
    for (let tuft = 0; tuft < tufts; tuft += 1) {
      const angle = (tuft / tufts) * Math.PI * 2 + random() * 0.35;
      // Bias inward so blades overlap the silhouette instead of ringing it.
      const reach = ring.radius * (0.88 + random() * 0.62);
      const tuftX = ring.x + Math.cos(angle) * reach;
      const tuftZ = ring.z + Math.sin(angle) * reach;
      const blades = 4 + Math.floor(random() * 4);
      for (let blade = 0; blade < blades; blade += 1) {
        const bladeX = tuftX + (random() - 0.5) * 0.16;
        const bladeZ = tuftZ + (random() - 0.5) * 0.16;
        const height = 0.16 + random() * 0.19;
        const width = 0.009 + random() * 0.008;
        const heading = random() * Math.PI * 2;
        const acrossX = Math.cos(heading) * width;
        const acrossZ = Math.sin(heading) * width;
        const lean = 0.1 + random() * 0.16;
        positions.push(
          bladeX - acrossX, 0, bladeZ - acrossZ,
          bladeX + acrossX, 0, bladeZ + acrossZ,
          bladeX + Math.cos(heading + Math.PI / 2) * lean * height,
          height,
          bladeZ + Math.sin(heading + Math.PI / 2) * lean * height,
        );
        colors.push(
          root.r, root.g, root.b,
          root.r, root.g, root.b,
          tip.r, tip.g, tip.b,
        );
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(colors), 3),
  );
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "stone-gallery-contact-grass";
  // Receives the stone's shadow, does not cast: a blade shadow map at this
  // texel size is speckle, and the point here is the stone's silhouette.
  mesh.receiveShadow = true;
  return mesh;
}

function createProbeGrainTexture(): THREE.Texture {
  const texture = new THREE.TextureLoader().load("./perlinnoise.webp");
  texture.name = "stone-gallery-grain";
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function render(): void {
  renderer.render(scene, camera);
}
controls.addEventListener("change", render);
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  render();
});
render();
(window as unknown as { __STONES_READY?: boolean }).__STONES_READY = true;
document.title = "Stone gallery probe · ready";
