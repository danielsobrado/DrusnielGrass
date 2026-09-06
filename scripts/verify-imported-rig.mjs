import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const MODEL_DIRECTORY = resolve(REPOSITORY_ROOT, "public/models/skeletons");

function fail(message) {
  throw new Error(`[imported-rig] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

/** Reads the JSON chunk of a binary glTF. */
function readGlbJson(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) {
    fail(`${path} is not a binary glTF.`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  return {
    json: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8")),
    bytes: buffer.length,
  };
}

const binding = read("src/character/gltf/KayKitHumanoidBinding.ts");
const loader = read("src/character/gltf/GltfCharacterLoader.ts");

const REQUIRED_BONES = [
  "root",
  "hips",
  "chest",
  "head",
  "upperarm.l",
  "lowerarm.l",
  "wrist.l",
  "upperarm.r",
  "lowerarm.r",
  "wrist.r",
  "upperleg.l",
  "lowerleg.l",
  "foot.l",
  "upperleg.r",
  "lowerleg.r",
  "foot.r",
];
const CHAINS = [
  ["upperleg.l", "lowerleg.l", "foot.l"],
  ["upperleg.r", "lowerleg.r", "foot.r"],
  ["upperarm.l", "lowerarm.l", "wrist.l"],
  ["upperarm.r", "lowerarm.r", "wrist.r"],
];

const models = readdirSync(MODEL_DIRECTORY).filter((entry) =>
  entry.toLowerCase().endsWith(".glb"),
);
assert(models.length > 0, "No prepared character models are present.");

let checkedChains = 0;
for (const model of models) {
  const path = resolve(MODEL_DIRECTORY, model);
  const { json, bytes } = readGlbJson(path);

  assert(
    (json.animations ?? []).length === 0,
    `${model} still carries ${(json.animations ?? []).length} baked animation clips; run scripts/prepare-character-assets.mjs.`,
  );
  assert(
    (json.images ?? []).length === 0 && (json.textures ?? []).length === 0,
    `${model} still embeds imagery, which the runtime would have to fetch back out through a blob: URL that connect-src refuses.`,
  );
  assert(
    bytes < 1_000_000,
    `${model} is ${(bytes / 1e6).toFixed(2)} MB; prepared characters are expected to stay well under 1 MB.`,
  );

  const nodes = json.nodes ?? [];
  const skins = json.skins ?? [];
  assert(skins.length === 1, `${model} must expose exactly one skin.`);
  const joints = skins[0].joints;
  const nameOf = new Map();
  for (const joint of joints) {
    nameOf.set(nodes[joint].name.toLowerCase(), joint);
  }
  for (const bone of REQUIRED_BONES) {
    assert(
      nameOf.has(bone),
      `${model} has no bone "${bone}", which the KayKit binding resolves as required.`,
    );
  }

  const parentOf = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      parentOf.set(child, index);
    }
  });
  for (const [rootName, midName, endName] of CHAINS) {
    const root = nameOf.get(rootName);
    const mid = nameOf.get(midName);
    const end = nameOf.get(endName);
    assert(
      parentOf.get(mid) === root,
      `${model}: ${midName} is not a direct child of ${rootName}, so the chain rest length would be wrong.`,
    );
    assert(
      parentOf.get(end) === mid,
      `${model}: ${endName} is not a direct child of ${midName}.`,
    );
    for (const [childName, child] of [
      [midName, mid],
      [endName, end],
    ]) {
      const translation = nodes[child].translation ?? [0, 0, 0];
      const length = Math.hypot(...translation);
      assert(
        length > 1e-6,
        `${model}: segment to ${childName} has no length, so it cannot be solved.`,
      );
      assert(
        translation[1] / length > 0.9,
        `${model}: segment to ${childName} no longer runs along +Y, so the imported axis assumption in the binding is stale.`,
      );
      checkedChains += 1;
    }
  }

  const controlBones = [...nameOf.keys()].filter(
    (name) =>
      name.includes("ik") ||
      name.startsWith("control-") ||
      name.startsWith("handslot"),
  );
  assert(
    controlBones.length > 0,
    `${model} unexpectedly has no control bones; the exclusion rule may now be silently matching nothing.`,
  );
}

assert(
  binding.includes("isKayKitControlBone") &&
    binding.includes('boneName.includes("IK")') &&
    binding.includes('boneName.startsWith("control-")'),
  "The KayKit binding must keep excluding the pack's IK and control bones from the pose.",
);
assert(
  !loader.includes("AnimationMixer") && !loader.includes("gltf.animations"),
  "Imported characters are animated procedurally; the loader must not reach for baked clips.",
);
assert(
  loader.includes('import { APP_VERSION } from "../../version"') &&
    loader.includes("const GLTF_ASSET_TIMEOUT_MS = 15_000") &&
    loader.includes("function revisionedAssetUrl(url: string): string") &&
    loader.includes("encodeURIComponent(APP_VERSION)") &&
    loader.includes("function loadGltfWithTimeout(") &&
    loader.includes("function loadTextureWithTimeout(") &&
    loader.includes("window.setTimeout(() =>") &&
    loader.includes("request timed out after ${GLTF_ASSET_TIMEOUT_MS} ms") &&
    loader.includes("disposeGltfSceneSafely(gltf.scene, `late GLTF ${url}`)") &&
    loader.includes("disposeResourceSafely(texture, `late texture ${url}`)"),
  "Published imported-character GLB and atlas requests must be revisioned, bounded, and clean late arrivals.",
);
assert(
  loader.includes("sharedTextures") &&
    loader.includes("const revisionedUrl = revisionedAssetUrl(url)") &&
    loader.includes("loadTextureWithTimeout(revisionedUrl)") &&
    loader.includes("flipY = false"),
  "The pack atlas must be revisioned, shared across characters, and sampled with the glTF orientation.",
);
assert(
  loader.includes("request.catch((error) =>") &&
    loader.includes("sharedTextures.get(revisionedUrl) === pending") &&
    loader.includes("sharedTextures.delete(revisionedUrl)"),
  "A failed shared atlas request must leave the cache retryable instead of pinning a rejected promise forever.",
);
assert(
  loader.includes(
    "const gltf = await loadGltfWithTimeout(revisionedAssetUrl(url));",
  ) &&
    /try \{[\s\S]*?return \{[\s\S]*?skinnedMeshes,[\s\S]*?\};[\s\S]*?\} catch \(error\) \{[\s\S]*?disposeGltfSceneSafely\(gltf\.scene, url\);[\s\S]*?throw error;/.test(
      loader,
    ) &&
    loader.includes("const skeletons = new Set<THREE.Skeleton>()") &&
    loader.includes("skeletons.add(skinned.skeleton)") &&
    loader.includes("disposeResources([") &&
    loader.includes("...geometries") &&
    loader.includes("...materials") &&
    loader.includes("...skeletons"),
  "Failed imported-character validation or atlas loading must release scene geometry, materials, and skeleton GPU resources before rethrowing.",
);

console.log(
  `[imported-rig] ${models.length} prepared characters verified: clips/imagery stripped, revisioned bounded loads, required bones present, ${checkedChains} chain segments direct and +Y aligned, control bones excluded.`,
);