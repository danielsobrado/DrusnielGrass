import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  throw new Error(`[humanoid-locomotion] ${message}`);
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

const locomotion = read("src/character/animation/HumanoidLocomotionLayer.ts");
const tuning = read("src/character/animation/HumanoidLocomotionTuning.ts");
const dutyFactor = readConstant(tuning, "HUMANOID_STANCE_DUTY_FACTOR");
const kneeAmplitude = readConstant(tuning, "HUMANOID_SHIN_SWING");

assert(
  kneeAmplitude > 0 && kneeAmplitude < Math.PI,
  "Knee swing amplitude must be a positive bend below 180 degrees.",
);
assert(
  locomotion.includes("kneeSwingWeight(gait, 0)") &&
    locomotion.includes("kneeSwingWeight(gait, 1)"),
  "Both humanoid knees must be driven from their own gait effector.",
);
assert(
  /function kneeSwingWeight\([\s\S]*?gait\.isInStance\(effector\)[\s\S]*?Math\.sin\([\s\S]*?gait\.getSwingProgress\(effector\)/.test(
    locomotion,
  ),
  "Knee swing must stay zero in stance and peak smoothly during swing.",
);

verifyKneePhase(0.25, 0, true);
verifyKneePhase(0.25, 1, false);
verifyKneePhase(0.75, 0, false);
verifyKneePhase(0.75, 1, true);

for (let step = 0; step < 2000; step += 1) {
  const phase = step / 2000;
  for (let effector = 0; effector < 2; effector += 1) {
    const weight = kneeWeight(phase, effector);
    assert(
      Number.isFinite(weight) && weight >= 0 && weight <= 1,
      `Knee ${effector} produced invalid swing weight ${weight} at phase ${phase}.`,
    );
  }
}

console.log(
  "[humanoid-locomotion] Knee flex follows the airborne gait effector and remains bounded.",
);

function verifyKneePhase(phase, effector, expectedStance) {
  const stance = isInStance(phase, effector);
  const weight = kneeWeight(phase, effector);
  assert(
    stance === expectedStance,
    `Unexpected stance state for knee ${effector} at phase ${phase}.`,
  );
  assert(
    expectedStance ? weight === 0 : weight > 0.5,
    `Knee ${effector} is not clearly ${expectedStance ? "extended" : "flexed"} at phase ${phase}.`,
  );
}

function kneeWeight(phase, effector) {
  const local = localPhase(phase, effector);
  if (local < dutyFactor) {
    return 0;
  }
  const swing = (local - dutyFactor) / (1 - dutyFactor);
  return Math.sin(swing * Math.PI);
}

function isInStance(phase, effector) {
  return localPhase(phase, effector) < dutyFactor;
}

function localPhase(phase, effector) {
  return wrap01(phase - effector * 0.5);
}

function wrap01(value) {
  const wrapped = value - Math.floor(value);
  return wrapped < 0 ? wrapped + 1 : wrapped;
}
