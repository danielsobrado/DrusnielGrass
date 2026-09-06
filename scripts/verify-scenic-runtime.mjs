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

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[scenic-runtime] ${message}`);
  }
}

const scenicLayer = read("src/world/scenic/WorldScenicLayer.ts");
const scenicTuning = read("src/world/scenic/WorldScenicTuning.ts");
const faunaSystem = read("src/world/scenic/WorldFaunaSystem.ts");
const faunaRoster = read("src/world/scenic/WorldFaunaRoster.ts");
const faunaField = read("src/world/scenic/WorldFaunaField.ts");
const faunaConfigValidator = read("src/world/scenic/FaunaConfigValidator.ts");
const worldConfigLoader = read("src/world/WorldConfigLoader.ts");
const treeField = read("src/world/scenic/WorldTreeField.ts");
const treeSystem = read("src/world/scenic/WorldTreeSystem.ts");
const villagerBody = read("src/character/npc/VillagerBody.ts");
const scriptedHumanoid = read("src/character/npc/ScriptedHumanoidActor.ts");
const deerBody = read("src/creatures/deer/DeerBody.ts");
const deerBehavior = read("src/creatures/deer/DeerBehavior.ts");
const quadrupedActor = read("src/creatures/quadruped/QuadrupedActor.ts");

assert(
  scenicLayer.includes("Trees disabled after a fault.") &&
    /try \{[\s\S]*?this\.trees\.update\(focus\);[\s\S]*?\} catch \(error\) \{/.test(
      scenicLayer,
    ),
  "Tree faults must stay inside the scenic failure domain.",
);
assert(
  scenicLayer.includes("Trees unavailable during initialization.") &&
    scenicLayer.includes("Fauna unavailable during initialization.") &&
    !/catch \(error\) \{[\s\S]{0,180}?throw error;/.test(scenicLayer),
  "Scenic constructor failures must disable only the failing optional system.",
);
assert(
  scenicLayer.includes("config.faunaEnabled < 1 || faunaCount === 0") &&
    scenicLayer.includes("this.life = undefined"),
  "Inactive or failed fauna must not retain a live scenic owner.",
);
assert(
  scenicLayer.includes("Tree cleanup failed.") &&
    scenicLayer.includes("Fauna cleanup failed.") &&
    scenicLayer.includes("this.disposeTrees();") &&
    scenicLayer.includes("this.disposeFauna();"),
  "Scenic cleanup failures must remain isolated from each other and the world owner.",
);
assert(
  treeSystem.includes('import { disposeResources } from "../../render/ResourceDisposal"') &&
    treeSystem.includes("let trunk: THREE.CylinderGeometry | undefined") &&
    treeSystem.includes("let canopy: THREE.IcosahedronGeometry | undefined") &&
    treeSystem.includes("scene.add(trunkMesh, canopyMesh)") &&
    treeSystem.includes("Tree construction cleanup failed.") &&
    treeSystem.includes("disposeResources([") &&
    treeSystem.includes("{ dispose: () => trunkMesh?.removeFromParent() }") &&
    treeSystem.includes("{ dispose: () => canopyMesh?.removeFromParent() }") &&
    treeSystem.includes("{ dispose: () => this.trunkMesh.removeFromParent() }") &&
    treeSystem.includes("{ dispose: () => this.canopyMesh.removeFromParent() }") &&
    treeSystem.includes("disposeResources(Array.isArray(material) ? material : [material])"),
  "Tree construction and normal teardown must attempt every mesh, geometry, and material cleanup without masking the original setup fault.",
);
assert(
  faunaSystem.includes("interface FaunaResources") &&
    faunaSystem.includes("const resources = createFaunaResources(field)") &&
    faunaSystem.includes("function createFaunaResources(") &&
    faunaSystem.includes("const assets = createDeerAssets()") &&
    faunaSystem.includes("villagerAssets = createVillagerAssets()") &&
    faunaSystem.includes('disposeResource(() => villagerAssets?.dispose(), "Villager assets")') &&
    faunaSystem.includes('disposeResource(() => assets.dispose(), "Deer assets")') &&
    faunaSystem.indexOf("const contact = new WorldTerrainContactSampler(field)") >
      faunaSystem.indexOf("    try {") &&
    /catch \(error\) \{[\s\S]*?this\.dispose\(\);[\s\S]*?throw error;/.test(
      faunaSystem,
    ),
  "Fauna shared assets and actor-pool setup must roll back transactionally before an optional startup failure is isolated by the scenic layer.",
);
assert(
  faunaConfigValidator.includes("MAX_FAUNA_STREAM_RADIUS = 512") &&
    faunaConfigValidator.includes("config.faunaStreamRadius > MAX_FAUNA_STREAM_RADIUS") &&
    faunaConfigValidator.includes("config.faunaStreamRadius > config.worldSize * 0.5") &&
    worldConfigLoader.includes("validateFaunaStreamingConfig(config)") &&
    faunaField.includes("MAX_FAUNA_STREAM_RADIUS") &&
    faunaField.includes("Number.isFinite(radius)") &&
    faunaField.includes("!Number.isFinite(centerX)") &&
    faunaField.includes("!Number.isFinite(centerZ)") &&
    faunaField.includes("this.maxCollectionRadius"),
  "Fauna streaming must reject unbounded configuration, non-finite collection centers, and defensively cap synchronous lattice collection cost.",
);
assert(
  faunaSystem.includes(
    "(this.slots.length === 0 && this.villagers.length === 0)",
  ) &&
    faunaSystem.includes("this.slots.length > 0 ? this.rebuildRoster(focus) : false") &&
    faunaSystem.includes("this.createSlot(scene, index, count") &&
    faunaSystem.includes("villagerCount,") &&
    faunaSystem.includes("index / Math.max(count, 1)"),
  "Deer decisions and villager routes must use the complete active profile counts for spacing.",
);
assert(
  faunaSystem.includes("memberKey?: string") &&
    faunaSystem.includes("const occupied = new Set<string>()") &&
    faunaSystem.includes("occupied.add(slot.memberKey)") &&
    faunaSystem.includes("this.roster.refresh(focus.x, focus.z, force, occupied)") &&
    faunaRoster.includes("!occupied.has(faunaMemberKey(member))") &&
    faunaSystem.includes("slot.memberKey = faunaMemberKey(member)") &&
    faunaSystem.includes("slot.memberKey = undefined"),
  "A deterministic herd member must be owned by at most one live deer slot across roster rebuilds.",
);
assert(
  faunaSystem.includes("active: member !== undefined") &&
    faunaSystem.includes("slot.active = false") &&
    faunaSystem.includes("slot.actor.object.visible = false"),
  "Unassigned deer pool slots must stay inactive and hidden until a real herd member is available.",
);
const poolVariant = faunaSystem.indexOf(
  "const variant = FAUNA_POOL_VARIANTS[index % FAUNA_POOL_VARIANTS.length];",
);
const initialMember = faunaSystem.indexOf(
  "const member = this.takeMember(spawn, variant);",
  poolVariant,
);
assert(
  scenicTuning.includes("FAUNA_POOL_VARIANTS") &&
    scenicTuning.includes('"stag"') &&
    scenicTuning.includes('"fawn"') &&
    poolVariant >= 0 &&
    initialMember > poolVariant,
  "Deer pool body variants must be deterministic before initial member selection so a local doe-heavy roster cannot permanently collapse pool variety.",
);
assert(
  faunaSystem.includes("readonly variant: DeerVariant") &&
    faunaRoster.includes("variant !== undefined && member.variant !== variant") &&
    faunaSystem.includes("this.takeMember(focus, slot.variant)") &&
    faunaSystem.includes("this.applyMemberCoat(slot, member)") &&
    faunaSystem.includes("member.seed,"),
  "Recycled deer must preserve their built body variant, refresh coat identity, and let every inactive variant search the rebuilt roster.",
);
const takeMemberStart = faunaSystem.indexOf("private takeMember(");
const disposeStart = faunaSystem.indexOf("  dispose(): void", takeMemberStart);
const takeMemberSource = faunaSystem.slice(takeMemberStart, disposeStart);
const rosterTakeStart = faunaRoster.indexOf("  take(\n");
const rosterTakeSource = faunaRoster.slice(rosterTakeStart);
assert(
  faunaSystem.includes("if (count > 0) {") &&
    faunaSystem.includes("this.rebuildRoster(spawn, true);") &&
    takeMemberStart >= 0 &&
    disposeStart > takeMemberStart &&
    !takeMemberSource.includes("rebuildRoster(") &&
    rosterTakeStart >= 0 &&
    !rosterTakeSource.includes("this.refresh("),
  "Fauna roster generation must stay explicit and movement-gated; member selection must not trigger hidden terrain sampling.",
);
assert(
  faunaRoster.includes("return false;") &&
    faunaRoster.includes("return true;") &&
    faunaSystem.includes("if (rosterRebuilt) {") &&
    faunaSystem.includes("this.recycle(slot, focus)"),
  "Inactive slots must retry only when the movement-gated roster actually rebuilds.",
);
assert(
  deerBehavior.includes("this.random = normalizeSeed(seed)") &&
    deerBehavior.includes(
      "this.decisionClock = this.options.decisionPhaseSeconds",
    ) &&
    faunaSystem.includes("slot.behavior.reset(") &&
    faunaSystem.includes("member.seed,"),
  "Recycled deer behavior must restart from the assigned member seed and staggered decision phase.",
);
assert(
  faunaField.includes("const HASH_UNIT = 1 / 4294967296;") &&
    treeField.includes("const HASH_UNIT = 1 / 4294967296;") &&
    !faunaField.includes("4294967295") &&
    !treeField.includes("4294967295"),
  "Scenic uint32 hashes must map to [0, 1) so counts and variation channels never hit the upper endpoint.",
);
assert(
  villagerBody.includes("const geometries = placements.map") &&
    villagerBody.includes("mesh.removeFromParent()") &&
    villagerBody.includes("let disposed = false"),
  "Villager body construction must resolve shared geometry before attachment and roll back owned resources.",
);
const runtimeReset = scriptedHumanoid.indexOf("this.runtime.reset(this.input);");
const scenePublication = scriptedHumanoid.indexOf("scene.add(this.root);");
assert(
  runtimeReset >= 0 && scenePublication > runtimeReset,
  "Scripted humanoids must enter the scene only after construction and animation reset succeed.",
);
assert(
  deerBody.includes("const geometries = placements.map") &&
    deerBody.includes("mesh.removeFromParent()") &&
    deerBody.includes("let disposed = false"),
  "Deer body construction must resolve shared geometry before attachment and roll back owned resources.",
);
const quadrupedReset = quadrupedActor.indexOf("this.runtime.reset(this.input);");
const quadrupedPublication = quadrupedActor.indexOf("scene.add(this.root);");
assert(
  quadrupedReset >= 0 &&
    quadrupedPublication > quadrupedReset &&
    quadrupedActor.includes("private disposed = false") &&
    quadrupedActor.includes('disposeResource(this.runtime, "Quadruped animation runtime")') &&
    quadrupedActor.includes('disposeResource(this.rigInstance, "Quadruped rig instance")') &&
    quadrupedActor.includes('disposeResource(this.body, "Quadruped body")'),
  "Quadrupeds must publish only after construction succeeds and release every owned layer independently.",
);

console.log("[scenic-runtime] Scenic ownership and independent fauna paths verified.");
