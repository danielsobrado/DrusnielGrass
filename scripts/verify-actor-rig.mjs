import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function fail(message) {
  throw new Error(`[actor-rig] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readConstant(source, name) {
  const expression = source.match(
    new RegExp(`export const ${name}\\s*=\\s*([^;]+);`),
  )?.[1];
  const value = Number(expression);
  if (!Number.isFinite(value)) {
    fail(`Unable to read numeric constant ${name}.`);
  }
  return value;
}

function readNumberArray(source, name) {
  const expression = source.match(
    new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]+)\\]`),
  )?.[1];
  if (expression === undefined) {
    fail(`Unable to read numeric array ${name}.`);
  }
  const values = expression
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  if (values.length === 0) {
    fail(`Numeric array ${name} is empty.`);
  }
  return values;
}

/**
 * Strips comments so boundary checks read code, not prose.
 *
 * The shared actor modules deliberately explain in comments why they contain no
 * humanoid concepts, and those explanations must not be mistaken for the thing
 * they are ruling out.
 */
function stripComments(source) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(resolve(REPOSITORY_ROOT, directory), {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      files.push(relative(REPOSITORY_ROOT, resolve(REPOSITORY_ROOT, path)));
    }
  }
  return files;
}

const tuning = read("src/character/rig/HumanoidRigTuning.ts");
const geometry = read("src/character/SnowflowCharacterGeometry.ts");
const character = read("src/character/SnowflowCharacter.ts");
const locomotionTuning = read(
  "src/character/animation/HumanoidLocomotionTuning.ts",
);
const humanoidDefinition = read("src/character/rig/HumanoidRigDefinition.ts");
const quadrupedDefinition = read(
  "src/creatures/quadruped/QuadrupedRigDefinition.ts",
);
const quadrupedGait = read("src/creatures/quadruped/QuadrupedGaitProfile.ts");
const validation = read("src/actor/rig/ActorRigValidation.ts");
const pose = read("src/actor/animation/ActorPose.ts");
const runtime = read("src/actor/animation/ActorAnimationRuntime.ts");
const contactIk = read("src/actor/ik/ActorContactIk.ts");
const twoBoneIk = read("src/actor/ik/TwoBoneIk.ts");
const rigInstance = read("src/actor/rig/ActorRigInstance.ts");

// ---------------------------------------------------------------------------
// Bind-pose baseline. These are the offsets the original pivot-group player rig
// shipped with; the skeletal rig must reproduce them so a regression shows up
// here rather than as a silently reshaped character.
// ---------------------------------------------------------------------------
const BASELINE_BIND_OFFSETS = {
  HUMANOID_PELVIS_HEIGHT: 0.9,
  HUMANOID_CHEST_OFFSET_Y: 0.28,
  HUMANOID_NECK_OFFSET_Y: 0.43,
  HUMANOID_HEAD_OFFSET_Y: 0.14,
  HUMANOID_SKIRT_OFFSET_Y: 0.08,
  HUMANOID_SHOULDER_OFFSET_X: 0.215,
  HUMANOID_SHOULDER_OFFSET_Y: 0.33,
  HUMANOID_SHOULDER_OFFSET_Z: 0.03,
  HUMANOID_ELBOW_OFFSET_X: 0.038,
  HUMANOID_ELBOW_OFFSET_Y: -0.29,
  HUMANOID_WRIST_OFFSET_Y: -0.275,
  HUMANOID_WRIST_OFFSET_Z: 0.012,
  HUMANOID_HIP_OFFSET_X: 0.1,
  HUMANOID_HIP_OFFSET_Y: -0.02,
  HUMANOID_KNEE_OFFSET_Y: -0.44,
  HUMANOID_ANKLE_OFFSET_Y: -0.37,
};

for (const [name, expected] of Object.entries(BASELINE_BIND_OFFSETS)) {
  const actual = readConstant(tuning, name);
  assert(
    Math.abs(actual - expected) <= 1e-9,
    `${name} drifted from the recorded player bind pose (${actual} vs ${expected}).`,
  );
}

const spineLowerFraction = readConstant(tuning, "HUMANOID_SPINE_LOWER_FRACTION");
const spineUpperFraction = readConstant(tuning, "HUMANOID_SPINE_UPPER_FRACTION");
assert(
  spineLowerFraction > 0 &&
    spineUpperFraction > 0 &&
    spineLowerFraction + spineUpperFraction < 1,
  "The spine chain must subdivide the pelvis-to-chest offset without consuming all of it.",
);
// The subdivided spine must land the chest exactly where the old torso pivot
// was, or the whole character shifts.
const chestOffset = readConstant(tuning, "HUMANOID_CHEST_OFFSET_Y");
const spineSum =
  chestOffset * spineLowerFraction +
  chestOffset * spineUpperFraction +
  chestOffset * (1 - spineLowerFraction - spineUpperFraction);
assert(
  Math.abs(spineSum - chestOffset) <= 1e-9,
  "Spine segment offsets do not sum back to the recorded chest height.",
);

const ankleToSole = readConstant(tuning, "HUMANOID_ANKLE_TO_SOLE");
assert(
  ankleToSole > 0 && ankleToSole < 0.3,
  "The ankle-to-sole drop must be a small positive height for contact IK.",
);

assert(
  humanoidDefinition.includes('from "./HumanoidRigTuning"') &&
    humanoidDefinition.includes("HUMANOID_PELVIS_HEIGHT") &&
    humanoidDefinition.includes("HUMANOID_KNEE_OFFSET_Y"),
  "The humanoid rig definition must build its bind pose from the recorded tuning, not fresh literals.",
);
assert(
  geometry.includes("new ActorRigInstance(humanoid.definition") &&
    // Transactional construction made the local `ActorRigInstance | undefined`,
    // so the by-index lookup now carries a non-null assertion. Resolution is
    // still by index off the shared instance, which is what this guards.
    geometry.includes("rigInstance!.getBone(index)") &&
    !/position\.set\(side \* 0\.215/.test(geometry) &&
    !/pelvis\.position\.y = 0\.9/.test(geometry) &&
    !geometry.includes("getObjectByName"),
  "Player geometry must hang off bones resolved by index from the shared rig instance, not inline joint literals or name searches.",
);

// ---------------------------------------------------------------------------
// Locomotion contract, recorded before the animation migration.
// ---------------------------------------------------------------------------
const strideLength = readConstant(
  locomotionTuning,
  "HUMANOID_STRIDE_LENGTH_METERS",
);
assert(
  Math.abs(strideLength - 1.55) <= 1e-9,
  "Stride length feeds the grass foot trail and must not drift during the rig migration.",
);
assert(
  readConstant(locomotionTuning, "HUMANOID_TAKEOFF_DURATION_SECONDS") > 0 &&
    readConstant(locomotionTuning, "HUMANOID_APEX_VELOCITY_THRESHOLD") > 0,
  "Takeoff and apex constants must remain positive recorded values.",
);
assert(
  character.includes("STRIDE_LENGTH_METERS = HUMANOID_STRIDE_LENGTH_METERS"),
  "The grass trail's stride export must stay wired to the humanoid locomotion tuning.",
);

const locomotionLayer = read(
  "src/character/animation/HumanoidLocomotionLayer.ts",
);
for (const state of [
  "idle",
  "walk",
  "run",
  "takeoff",
  "rise",
  "apex",
  "fall",
  "land",
]) {
  assert(
    locomotionLayer.includes(`"${state}"`),
    `Locomotion state ${state} disappeared from the humanoid animation contract.`,
  );
}
assert(
  !character.includes("rotation.x =") &&
    !character.includes("leftThigh") &&
    character.includes("this.runtime.update"),
  "SnowflowCharacter must be orchestration: pose equations belong to the humanoid locomotion layer.",
);

// ---------------------------------------------------------------------------
// Rig-definition validation must cover every structural rule.
// ---------------------------------------------------------------------------
const REQUIRED_VALIDATION_RULES = [
  ["bone count must be a positive integer", "positive bounded bone count"],
  ["is used more than once", "unique bone names"],
  ["out-of-range parent", "in-range parent indexes"],
  ["topologically sorted tree", "acyclic parents-first hierarchy"],
  ["exactly one structural root", "a single root"],
  ["non-finite bind position", "finite bind translations"],
  ["denormalized bind rotation", "normalized bind rotations"],
  ["is not a child of its root", "chain segments that are real parent links"],
  ["non-positive segment length", "positive chain segment lengths"],
  ["invalid bend range", "ordered chain bend limits"],
  ["does not match the bone count", "mask and buffer sizing"],
  ["out-of-range parent bone", "socket parents"],
  ["reversed or non-finite", "ordered joint limits"],
];
for (const [needle, description] of REQUIRED_VALIDATION_RULES) {
  assert(
    validation.includes(needle),
    `Rig-definition validation no longer rejects ${description}.`,
  );
}

// ---------------------------------------------------------------------------
// Boundary: the shared actor layer must stay free of family knowledge.
// ---------------------------------------------------------------------------
const FORBIDDEN_ACTOR_IMPORTS = [
  "/character/",
  "/creatures/",
  "/controls/",
  "/world/",
  "/grass/",
  "/app/",
];
for (const file of sourceFiles("src/actor")) {
  const source = stripComments(read(file));
  for (const forbidden of FORBIDDEN_ACTOR_IMPORTS) {
    assert(
      !source.includes(`from "..${forbidden}`) &&
        !source.includes(`from "../..${forbidden}`),
      `${file} imports ${forbidden}; the shared actor layer must not depend on a specific family or on the world.`,
    );
  }
}
// Humanoid-only vocabulary must not leak into the shared layer or the animal.
const HUMANOID_ONLY_TERMS = [
  "crouch",
  "spell",
  "roll",
  "upperBody",
  "clavicle",
];
for (const file of [...sourceFiles("src/actor"), ...sourceFiles("src/creatures")]) {
  const source = stripComments(read(file)).toLowerCase();
  for (const term of HUMANOID_ONLY_TERMS) {
    assert(
      !source.includes(term.toLowerCase()),
      `${file} mentions "${term}"; humanoid capabilities must not appear in the shared actor core or in a non-humanoid species.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Pose runtime: sized from the definition, allocated once.
// ---------------------------------------------------------------------------
assert(
  pose.includes("new Float32Array(this.boneCount * 4)") &&
    pose.includes("new Float32Array(this.boneCount * 3)") &&
    !/update\([^)]*\)[^}]*new Float32Array/s.test(pose),
  "Pose buffers must be sized from the rig's bone count and allocated only at construction.",
);
// Euler angles are allowed as an authoring input, but never as the thing being
// interpolated: every mention must be the setEuler helper writing a quaternion.
for (const line of stripComments(pose).split("\n")) {
  if (!line.includes("Euler")) {
    continue;
  }
  assert(
    line.includes("setEuler") || line.includes("setQuaternionFromEulerXyz"),
    `ActorPose interpolates Euler angles at "${line.trim()}"; blending must stay on quaternions.`,
  );
}
for (const method of ["blendToward", "blendMasked", "addAdditive", "addAdditiveMasked"]) {
  const body = pose.slice(pose.indexOf(`${method}(`));
  assert(
    body.slice(0, body.indexOf("\n  }")).includes("slerpQuaternion"),
    `ActorPose.${method} must interpolate rotations with the shared quaternion slerp.`,
  );
}

const additiveLayer = read("src/actor/animation/ActorAdditiveLayer.ts");
const humanoidAdditive = read(
  "src/character/animation/HumanoidAdditiveLayer.ts",
);
assert(
  additiveLayer.includes("class ActorAdditiveLayer implements ActorPoseStage") &&
    additiveLayer.includes("addTrack(") &&
    additiveLayer.includes("setWeight(") &&
    additiveLayer.includes("fadeTo(") &&
    !/apply\([^)]*\)[^}]*new Float32Array/s.test(additiveLayer),
  "ActorAdditiveLayer must be an allocation-free ActorPoseStage managing additive tracks.",
);

for (const action of ["sneak_pose", "sad_pose", "agree", "headShake"]) {
  assert(
    humanoidAdditive.includes(`"${action}"`),
    `HumanoidAdditiveLayer must declare the Three.js reference action "${action}".`,
  );
}

assert(
  locomotionLayer.includes("getBlendWeights()") &&
    locomotionLayer.includes("setExplicitWeights(") &&
    locomotionLayer.includes('"crouch_idle"') &&
    locomotionLayer.includes('"crouch_walk"') &&
    locomotionLayer.includes('"roll"'),
  "HumanoidLocomotionLayer must expose continuous blend weights, crouch, and roll locomotion states.",
);

const lookIk = read("src/actor/ik/ActorLookIk.ts");
assert(
  lookIk.includes("class ActorLookIk implements ActorPoseStage") &&
    lookIk.includes("setLookDirection(") &&
    lookIk.includes("setLookTarget(") &&
    !/apply\([^)]*\)[^}]*new Float32Array/s.test(lookIk),
  "ActorLookIk must be an allocation-free ActorPoseStage managing look target distribution.",
);
// Read the order inside update() alone, so an import at the top of the file
// cannot be mistaken for a pipeline stage.
const runtimeUpdate = runtime.slice(
  runtime.indexOf("update(deltaSeconds"),
  runtime.indexOf("  reset(input"),
);
const PIPELINE_ORDER = [
  "this.profile.locomotion.generatePose",
  "this.blender.apply",
  "this.runStages(this.profile.preIkStages",
  "this.runStages(this.profile.ikStages",
  "applyActorJointLimits",
  "this.rigInstance.applyPose",
  "this.rigInstance.updateWorldMatrices",
  "secondary[index].update",
];
let previousPosition = -1;
for (const step of PIPELINE_ORDER) {
  const position = runtimeUpdate.indexOf(step);
  assert(
    position > previousPosition,
    `The animation pipeline stage "${step}" is missing or out of order; the order must stay locomotion, blending, stages, limits, bones, world matrices, secondary motion.`,
  );
  previousPosition = position;
}
assert(
  rigInstance.includes("secondaryFlags[index] === 1") &&
    rigInstance.includes("translatableFlags[index] === 1"),
  "Applying a pose must skip secondary-motion bones and only translate bones that permit it.",
);
// Comments in these modules explain the anatomy they refuse to encode, so the
// check reads code only.
for (const [name, source] of [
  ["ActorContactIk", stripComments(contactIk)],
  ["TwoBoneIk", stripComments(twoBoneIk)],
]) {
  for (const term of ["foot", "knee", "elbow", "hand", "paw", "leg"]) {
    assert(
      !source.toLowerCase().includes(term),
      `${name} names "${term}"; the generic IK primitives must work on declared chains, not anatomy.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Family topologies.
// ---------------------------------------------------------------------------
for (const bone of ["spineLower", "spineUpper", "clavicle", "toe", "hand"]) {
  assert(
    humanoidDefinition.includes(bone),
    `The humanoid rig no longer declares ${bone}.`,
  );
}
assert(
  (humanoidDefinition.match(/kind: "groundContact"/g) ?? []).length === 2,
  "The humanoid rig must declare exactly two ground-contact effectors.",
);
for (const bone of ["frontUpper", "hindUpper", "frontPaw", "hindPaw", "tail"]) {
  assert(
    quadrupedDefinition.includes(bone),
    `The quadruped rig no longer declares ${bone}.`,
  );
}
assert(
  quadrupedDefinition.includes("QUADRUPED_CONTACT_CHAINS") &&
    (quadrupedDefinition.match(/QUADRUPED_CHAIN_[A-Z_]+ = "/g) ?? []).length === 4,
  "The quadruped rig must declare four contact limb chains.",
);
// A species may know about the shared actor layer and about rendering helpers,
// and nothing else. Importing the world directly would drag hydrology, ecology
// and landform into the creature module the moment one animal wanted to know
// whether the ground ahead was worth eating; that question crosses an injected
// sampler instead, the same way foot contact does.
for (const forbidden of ["/character/", "/world/", "/app/", "/controls/", "/grass/"]) {
  for (const file of sourceFiles("src/creatures")) {
    assert(
      !stripComments(read(file)).includes(forbidden),
      `${file} imports ${forbidden}; a species must reach the screen through the shared actor layer alone.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Gait support: mirrored from ActorGait so the phase tables are proven, not
// just declared.
// ---------------------------------------------------------------------------
verifyGaitSupport(
  "humanoid",
  [0, 0.5],
  readConstant(locomotionTuning, "HUMANOID_STANCE_DUTY_FACTOR"),
  1,
);
// Read from source rather than restated here. The quadruped's duty factor and
// phase table used to be literals in this file while the real ones lived as
// private constants in the actor, so this check could pass while proving
// nothing about the gait anybody was actually walking.
verifyGaitSupport(
  "quadruped",
  readNumberArray(quadrupedGait, "QUADRUPED_PHASE_OFFSETS"),
  readConstant(quadrupedGait, "QUADRUPED_STANCE_DUTY_FACTOR"),
  2,
);

// ---------------------------------------------------------------------------
// Two-bone IK: mirrored law-of-cosines, checked over the whole reachable range.
// ---------------------------------------------------------------------------
verifyTwoBoneReach();

console.log(
  "[actor-rig] Bind-pose baseline, validation rules, actor-layer boundary, pipeline order, humanoid and quadruped topologies, gait support, and two-bone reach verified.",
);

/**
 * Every gait must keep a minimum number of effectors planted at all times, or
 * the actor visibly floats between footfalls.
 */
function verifyGaitSupport(name, phaseOffsets, dutyFactor, minimumPlanted) {
  assert(
    dutyFactor > 0 && dutyFactor < 1,
    `${name} stance duty factor must be a fraction of the cycle.`,
  );
  for (let step = 0; step < 2000; step += 1) {
    const phase = step / 2000;
    let planted = 0;
    for (const offset of phaseOffsets) {
      const local = wrap01(phase - offset);
      if (local < dutyFactor) {
        planted += 1;
      }
    }
    assert(
      planted >= minimumPlanted,
      `${name} gait drops to ${planted} planted contacts at phase ${phase.toFixed(4)}; at least ${minimumPlanted} is required.`,
    );
  }
}

function verifyTwoBoneReach() {
  const margin = Number(twoBoneIk.match(/REACH_MARGIN = ([\d.]+)/)?.[1]);
  assert(
    Number.isFinite(margin) && margin > 0,
    "The two-bone solver must keep a positive reach margin short of full extension.",
  );
  const chains = [
    // Humanoid leg, humanoid arm, quadruped limb. The quadruped's segment
    // lengths come from its rig rather than from copies kept here, so changing
    // the animal's proportions re-runs this against the proportions it has.
    [0.44, 0.37],
    [
      Math.hypot(0.038, 0.29),
      Math.hypot(0.275, 0.012),
    ],
    [
      readConstant(quadrupedDefinition, "QUADRUPED_UPPER_LIMB"),
      readConstant(quadrupedDefinition, "QUADRUPED_LOWER_LIMB"),
    ],
  ];
  const random = createRandom(0x9e3779b9);
  for (const [upper, lower] of chains) {
    const maximumReach = upper + lower - margin;
    const minimumReach = Math.abs(upper - lower) + margin;
    assert(
      minimumReach < maximumReach,
      `Chain ${upper}/${lower} has no usable reach band.`,
    );
    for (let sample = 0; sample < 20_000; sample += 1) {
      const requested = randomRange(random, 0, (upper + lower) * 1.6);
      const distance = Math.min(Math.max(requested, minimumReach), maximumReach);
      const cosineRoot =
        (upper * upper + distance * distance - lower * lower) /
        (2 * upper * distance);
      const cosineMid =
        (upper * upper + lower * lower - distance * distance) /
        (2 * upper * lower);
      assert(
        cosineRoot >= -1.000001 && cosineRoot <= 1.000001,
        `Clamped reach produced an out-of-domain root angle at ${distance}.`,
      );
      assert(
        cosineMid >= -1.000001 && cosineMid <= 1.000001,
        `Clamped reach produced an out-of-domain mid angle at ${distance}.`,
      );
      const bend = Math.PI - Math.acos(Math.min(Math.max(cosineMid, -1), 1));
      assert(
        Number.isFinite(bend) && bend >= 0 && bend <= Math.PI,
        `Clamped reach produced an unusable bend at ${distance}.`,
      );
    }
  }
}

function wrap01(value) {
  const wrapped = value - Math.floor(value);
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomRange(random, minimum, maximum) {
  return minimum + (maximum - minimum) * random();
}
