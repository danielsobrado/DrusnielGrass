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
    throw new Error(`[character-lifecycle] ${message}`);
  }
}

const materials = read("src/character/SnowflowCharacterMaterials.ts");
const geometry = read("src/character/SnowflowCharacterGeometry.ts");
const bootGeometry = read("src/character/DrowBootGeometry.ts");
const bootTuning = read("src/character/DrowBootGeometryTuning.ts");
const features = read("src/character/DrowCharacterFeatures.ts");
const character = read("src/character/SnowflowCharacter.ts");
const importedActor = read("src/character/gltf/GltfHumanoidActor.ts");
const controller = read("src/controls/ThirdPersonController.ts");
const actorProof = read("src/dev/ActorExtensibilityProof.ts");

assert(
  materials.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    materials.includes("const owned: THREE.MeshStandardMaterial[] = []") &&
    materials.includes("owned.push(material)") &&
    materials.includes("disposeResources(owned)") &&
    /function createMaterial\([\s\S]*?try \{[\s\S]*?applyActorEnvironmentResponse\(material\);[\s\S]*?return material;[\s\S]*?\} catch \(error\) \{[\s\S]*?disposeResources\(\[material\]\)/.test(
      materials,
    ),
  "Character material construction must own every created material and release partial sets without masking the setup failure.",
);

const costumeBuild = geometry.indexOf("addDrowCostumeGeometry(rig, materials, geometries)");
const scenePublication = geometry.indexOf("scene.add(root)", costumeBuild);
assert(
  geometry.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    geometry.includes("let rigInstance: ActorRigInstance | undefined") &&
    costumeBuild >= 0 &&
    scenePublication > costumeBuild &&
    geometry.includes("disposeResources([rigInstance, ...geometries, ...materialList])") &&
    geometry.includes("Character rig construction cleanup failed.") &&
    /function addMesh\([\s\S]*?geometries\.push\(geometry\);[\s\S]*?const mesh = new THREE\.Mesh\(geometry, material\)/.test(
      geometry,
    ),
  "Character rig construction must publish only after body/costume completion and track geometry before mesh attachment can fail.",
);

assert(
  geometry.includes("addDrowBootGeometry(foot, geometries, materials)") &&
    /function addMesh\([\s\S]*?geometries\.push\(geometry\);[\s\S]*?const mesh = new THREE\.Mesh\(geometry, material\)/.test(
      bootGeometry,
    ) &&
    bootTuning.includes('from "./rig/HumanoidRigTuning"') &&
    bootTuning.includes(
      "-HUMANOID_ANKLE_TO_SOLE + SOLE_RADIUS * SOLE_VERTICAL_SCALE",
    ),
  "Boot geometry must remain owned by the character lifecycle and derive its contact plane from the humanoid sole contract.",
);

assert(
  /function addMesh\([\s\S]*?rig\.geometries\.push\(geometry\);[\s\S]*?const mesh = new THREE\.Mesh\(geometry, material\)/.test(
    features,
  ),
  "Drow feature geometry must enter rig ownership before mesh creation or attachment can fail.",
);

assert(
  character.includes("const resources = createSnowflowCharacterResources(") &&
    character.includes("function createSnowflowCharacterResources(") &&
    character.includes("const rig = buildSnowflowCharacter(scene, scale)") &&
    character.includes("disposeSafely(\"cloth construction\", () => cloth?.dispose())") &&
    character.includes("disposeSnowflowRig(rig)") &&
    character.includes("if (!this.disposed) {\n      this.profile.facts.crouched = crouched") &&
    character.includes("private disposed = false"),
  "Player-character orchestration must roll back post-rig failures and keep mutators inert after disposal.",
);

assert(
  importedActor.includes("function createRuntimeResources(") &&
    /function createRuntimeResources\([\s\S]*?let rigInstance: ActorRigInstance \| undefined;[\s\S]*?let runtime: ActorAnimationRuntime \| undefined;[\s\S]*?try \{[\s\S]*?rigInstance = new ActorRigInstance[\s\S]*?runtime = new ActorAnimationRuntime[\s\S]*?return \{ rigInstance, profile, runtime \};[\s\S]*?\} catch \(error\) \{[\s\S]*?runtime\?\.dispose\(\)[\s\S]*?rigInstance\?\.dispose\(\)/.test(
      importedActor,
    ) &&
    /const character = await loadGltfCharacter[\s\S]*?try \{[\s\S]*?return new GltfHumanoidActor[\s\S]*?\} catch \(error\) \{[\s\S]*?disposeGltfCharacter\(character\)/.test(
      importedActor,
    ) &&
    importedActor.indexOf("this.runtime.reset(this.input)") <
      importedActor.indexOf("scene.add(this.root)") &&
    /dispose\(\): void \{[\s\S]*?this\.disposed = true;[\s\S]*?disposeActorResourceSafely\("animation runtime"[\s\S]*?disposeActorResourceSafely\("rig instance"[\s\S]*?disposeActorResourceSafely\("loaded character"[\s\S]*?disposeActorResourceSafely\("scene root"/.test(
      importedActor,
    ),
  "Imported humanoid actors must roll back partial rig/runtime construction, release loaded GLTF ownership when construction fails, publish only after initialization succeeds, and attempt every teardown owner.",
);

assert(
  controller.includes("const character = new SnowflowCharacter(") &&
    controller.includes("input = new ThirdPersonInput(canvas, profile, config)") &&
    controller.includes("character.dispose()") &&
    controller.includes('disposeControllerResource("Third-person input"') &&
    controller.includes('disposeControllerResource("Third-person character"') &&
    controller.includes("grassInteractionField.deactivate()") &&
    controller.includes("private disposed = false"),
  "Third-person controller construction and teardown must release character/input ownership independently.",
);

assert(
  actorProof.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    actorProof.includes("const resources = createActorProofResources(world, this.update)") &&
    /function createActorProofResources\([\s\S]*?context = world\.attachActorProof\(observer\)[\s\S]*?npc = new ScriptedHumanoidActor\([\s\S]*?quadruped = new QuadrupedActor\([\s\S]*?catch \(error\) \{[\s\S]*?disposeActorProofResources\([\s\S]*?construction rollback[\s\S]*?throw error;/.test(
      actorProof,
    ) &&
    /const actor = await GltfHumanoidActor\.create\([\s\S]*?if \(this\.disposed\) \{[\s\S]*?actor\.dispose\(\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?this\.imported\.push\(actor\)/.test(
      actorProof,
    ) &&
    /dispose\(\): void \{[\s\S]*?this\.disposed = true;[\s\S]*?this\.imported\.splice\(0\)[\s\S]*?disposeActorProofResources\(/.test(
      actorProof,
    ) &&
    /disposeResources\(\[[\s\S]*?detach\(\)[\s\S]*?resources\.npc,[\s\S]*?resources\.quadruped,[\s\S]*?\.\.\.imported,[\s\S]*?resources\.deerAssets,[\s\S]*?resources\.villagerAssets/.test(
      actorProof,
    ),
  "The opt-in actor proof must detach its observer, dispose late imported actors after teardown, and release partial or completed proof actors/libraries without contaminating the running world.",
);

console.log(
  "[character-lifecycle] Materials, procedural/imported actor publication, controller resources, and actor-proof ownership verified.",
);
