import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  WORLD_DEFAULT_HEMISPHERE_GROUND,
  WORLD_DEFAULT_HEMISPHERE_INTENSITY,
  WORLD_DEFAULT_HEMISPHERE_SKY,
  WORLD_DEFAULT_SUN,
  WORLD_DEFAULT_SUN_INTENSITY,
  WORLD_SUN_DIRECTION,
} from "../../src/app/WorldEnvironmentTuning";
import { createVillagerAssets } from "../../src/character/npc/VillagerAssets";
import { buildVillagerBody } from "../../src/character/npc/VillagerBody";
import { humanoidRig } from "../../src/character/rig/HumanoidRigDefinition";
import { createDeerAssets } from "../../src/creatures/deer/DeerAssets";
import { createDeerBodyBuilder } from "../../src/creatures/deer/DeerBody";
import type { DeerVariant } from "../../src/creatures/deer/DeerGeometry";
import { setDeerCoatTint } from "../../src/creatures/deer/DeerPalette";
import { ActorRigInstance } from "../../src/actor/rig/ActorRigInstance";
import { quadrupedRig } from "../../src/creatures/quadruped/QuadrupedRigDefinition";
import { ActorGait } from "../../src/actor/animation/ActorGait";
import { ActorPose } from "../../src/actor/animation/ActorPose";
import { createActorAnimationInput } from "../../src/actor/animation/ActorAnimationInput";
import { createQuadrupedMotionFacts } from "../../src/creatures/quadruped/QuadrupedMotionFacts";
import {
  QUADRUPED_PHASE_OFFSETS,
  QUADRUPED_STANCE_DUTY_FACTOR,
  QUADRUPED_STRIDE_LENGTH_METERS,
} from "../../src/creatures/quadruped/QuadrupedGaitProfile";
import {
  QuadrupedLocomotionLayer,
  QUADRUPED_STATE_ALERT,
  QUADRUPED_STATE_GRAZE,
  QUADRUPED_STATE_IDLE,
  QUADRUPED_STATE_WALK,
} from "../../src/creatures/quadruped/QuadrupedLocomotionLayer";

/**
 * Deer gallery probe.
 *
 * Procedural creature art is hard to review inside the streamed world: the
 * animals are twenty metres away, the grass takes minutes to arrive, and a
 * silhouette problem looks the same as a distance problem. This stands the three
 * variants in a row under the world's own sun and hemisphere so the shapes can
 * be judged on their own, the same way the stone gallery does for rocks.
 */
const params = new URLSearchParams(window.location.search);
const VARIANTS: readonly DeerVariant[] = ["stag", "doe", "fawn"];
const VARIANT_SCALE: Readonly<Record<DeerVariant, number>> = {
  stag: 1,
  doe: 1,
  fawn: 0.62,
};

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const out = document.getElementById("out") as HTMLPreElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd4df);

const sun = new THREE.DirectionalLight(WORLD_DEFAULT_SUN, WORLD_DEFAULT_SUN_INTENSITY);
sun.position
  .set(WORLD_SUN_DIRECTION[0], WORLD_SUN_DIRECTION[1], WORLD_SUN_DIRECTION[2])
  .normalize()
  .multiplyScalar(12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4;
sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;
sun.shadow.camera.bottom = -4;
scene.add(sun);
scene.add(
  new THREE.HemisphereLight(
    WORLD_DEFAULT_HEMISPHERE_SKY,
    WORLD_DEFAULT_HEMISPHERE_GROUND,
    WORLD_DEFAULT_HEMISPHERE_INTENSITY,
  ),
);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x7d8f5a, roughness: 1 }),
);
ground.rotation.x = -Math.PI * 0.5;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.05,
  200,
);
const heading = Number(params.get("heading") ?? 0.9);
const distance = Number(params.get("distance") ?? 3.6);
const target = new THREE.Vector3(0, 0.5, 0);
camera.position.set(
  Math.sin(heading) * distance,
  Number(params.get("height") ?? 0.95),
  Math.cos(heading) * distance,
);
camera.lookAt(target);

const orbit = new OrbitControls(camera, canvas);
orbit.target.copy(target);
orbit.update();

const assets = createDeerAssets();
const rigInstances: ActorRigInstance[] = [];
const rig = quadrupedRig();
let meshCount = 0;
let triangleCount = 0;

const subject = params.get("subject") ?? "deer";
if (subject === "villager") {
  showVillagers();
} else {
  showDeer();
}

/**
 * The villagers, for judging the one thing that matters about them: that they
 * read as people without competing with the player for attention.
 */
function showVillagers(): void {
  const villagerAssets = createVillagerAssets();
  const humanoid = humanoidRig();
  for (let index = 0; index < villagerAssets.variantCount; index += 1) {
    const holder = new THREE.Group();
    holder.position.x = (index - (villagerAssets.variantCount - 1) / 2) * 1;
    scene.add(holder);
    const instance = new ActorRigInstance(humanoid.definition, holder);
    rigInstances.push(instance);
    const body = buildVillagerBody(
      instance,
      humanoid.bones,
      villagerAssets,
      index,
      true,
    );
    for (const mesh of body.meshes) {
      meshCount += 1;
      triangleCount += mesh.geometry.getAttribute("position").count / 3;
    }
    instance.updateWorldMatrices();
  }
  out.textContent = [
    `villagers: ${villagerAssets.variantCount} palettes`,
    `meshes each: ${meshCount / villagerAssets.variantCount}`,
    `triangles: ${Math.round(triangleCount)} total`,
  ].join("\n");
}

function showDeer(): void {
VARIANTS.forEach((variant, index) => {
  const holder = new THREE.Group();
  holder.position.x = (index - 1) * 1.5;
  holder.scale.setScalar(VARIANT_SCALE[variant]);
  scene.add(holder);

  const instance = new ActorRigInstance(rig.definition, holder);
  rigInstances.push(instance);

  const tint = new THREE.Color();
  setDeerCoatTint(tint, 0.3 + index * 0.3, 0.65 - index * 0.2);
  const body = createDeerBodyBuilder(assets, variant, tint, true)(instance, rig.bones);
  for (const mesh of body.meshes) {
    meshCount += 1;
    const position = mesh.geometry.getAttribute("position");
    triangleCount += position.count / 3;
  }
  applyPose(instance);
  instance.updateWorldMatrices();
});

out.textContent = [
  `variants: ${VARIANTS.join(", ")}`,
  `meshes per deer: ${meshCount / VARIANTS.length}`,
  `triangles: ${Math.round(triangleCount)} across ${VARIANTS.length} deer`,
  "drag to orbit · ?subject=villager ?pose= ?heading= ?distance=",
].join("\n");
}

/**
 * Stands the animal in one of its real locomotion states.
 *
 * The poses come from the shipping locomotion layer rather than from angles
 * restated here, so a graze that puts the muzzle through the animal's own chest
 * shows up in this window rather than out in the world.
 */
function applyPose(instance: ActorRigInstance): void {
  const requested = params.get("pose") ?? "bind";
  if (requested === "bind") {
    return;
  }
  const states: Readonly<Record<string, number>> = {
    idle: QUADRUPED_STATE_IDLE,
    walk: QUADRUPED_STATE_WALK,
    graze: QUADRUPED_STATE_GRAZE,
    alert: QUADRUPED_STATE_ALERT,
  };
  const state = states[requested];
  if (state === undefined) {
    throw new Error(`Invalid pose=${requested}; expected bind, idle, walk, graze, or alert.`);
  }
  const facts = createQuadrupedMotionFacts();
  const layer = new QuadrupedLocomotionLayer(rig.bones, facts);
  const gait = new ActorGait({
    strideLengthMeters: QUADRUPED_STRIDE_LENGTH_METERS,
    effectors: QUADRUPED_PHASE_OFFSETS.map((phaseOffset) => ({
      phaseOffset,
      dutyFactor: QUADRUPED_STANCE_DUTY_FACTOR,
    })),
  });
  const pose = new ActorPose(rig.definition);
  const input = createActorAnimationInput(
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  );
  input.normalizedSpeed = state === QUADRUPED_STATE_WALK ? 0.7 : 0;
  input.speed = state === QUADRUPED_STATE_WALK ? 1.1 : 0;
  input.distanceTravelled = Number(params.get("distanceTravelled") ?? 0.42);
  gait.setFromDistance(input.distanceTravelled);
  layer.advanceTime(Number(params.get("time") ?? 0.3));
  layer.generatePose(input, state, 1, gait, pose);
  instance.applyPose(pose.rotations, pose.translations);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  orbit.update();
  renderer.render(scene, camera);
});
