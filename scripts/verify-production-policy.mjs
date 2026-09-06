import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSecureNodeRuntime,
  PINNED_NODE_VERSION,
} from "./node-runtime.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const WORKFLOW_DIRECTORY = resolve(REPOSITORY_ROOT, ".github", "workflows");
const DEPLOY_SCRIPT = resolve(REPOSITORY_ROOT, "scripts", "deploy-github-pages.mjs");
const VITE_CONFIG = resolve(REPOSITORY_ROOT, "vite.config.ts");
const GRASS_CONFIG_LOADER = resolve(
  REPOSITORY_ROOT,
  "src",
  "grass",
  "internal",
  "GrassConfigLoader.ts",
);
const PACKAGE_FILE = resolve(REPOSITORY_ROOT, "package.json");
const PACKAGE_LOCK_FILE = resolve(REPOSITORY_ROOT, "package-lock.json");
const NODE_VERSION_FILE = resolve(REPOSITORY_ROOT, ".nvmrc");
const NPM_CONFIG_FILE = resolve(REPOSITORY_ROOT, ".npmrc");
const GITIGNORE_FILE = resolve(REPOSITORY_ROOT, ".gitignore");
const WORKFLOW_EXTENSIONS = new Set([".yml", ".yaml"]);

function fail(message) {
  throw new Error(`[production-policy] ${message}`);
}

function findWorkflowFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findWorkflowFiles(path));
    } else if (
      entry.isFile() &&
      WORKFLOW_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(relative(REPOSITORY_ROOT, path));
    }
  }
  return files;
}

function releaseLine(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\./);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

assertSecureNodeRuntime();

if (existsSync(WORKFLOW_DIRECTORY)) {
  const workflowFiles = findWorkflowFiles(WORKFLOW_DIRECTORY);
  if (workflowFiles.length > 0) {
    fail(
      `GitHub Actions are not allowed in this repository: ${workflowFiles.join(", ")}.`,
    );
  }
}

const gitignore = readFileSync(GITIGNORE_FILE, "utf8");
for (const requiredPattern of [".env", ".env.*", "!.env.example"]) {
  if (!gitignore.split(/\r?\n/).includes(requiredPattern)) {
    fail(`.gitignore must preserve environment-file rule: ${requiredPattern}.`);
  }
}
const localEnvironmentFiles = readdirSync(REPOSITORY_ROOT).filter(
  (entry) =>
    entry !== ".env.example" &&
    (entry === ".env" || entry.startsWith(".env.")),
);
if (localEnvironmentFiles.length > 0) {
  fail(
    `Production builds must not load local environment files: ${localEnvironmentFiles.join(", ")}.`,
  );
}

const deployScript = readFileSync(DEPLOY_SCRIPT, "utf8");
const auditCommandPattern =
  /run\(npmCommand,\s*\[\s*"audit",\s*"--package-lock-only",\s*"--include=dev",\s*"--audit-level=high",?\s*\]\)/;
const installCommandPattern =
  /run\(npmCommand,\s*\[\s*"ci",\s*"--include=dev",\s*"--no-audit",\s*"--no-fund",?\s*\]\)/;
const buildCommandPattern =
  /run\(npmCommand,\s*\[\s*"run",\s*"build",?\s*\]\)/;
const auditCommandIndex = deployScript.search(auditCommandPattern);
const installCommandIndex = deployScript.search(installCommandPattern);
const buildCommandIndex = deployScript.search(buildCommandPattern);
if (deployScript.includes("ALLOW_DIRTY_DEPLOY")) {
  fail("Manual production deployment must never allow a dirty working tree.");
}
if (
  deployScript.includes("process.env.GITHUB_PAGES_") ||
  !deployScript.includes('branch: "gh-pages"') ||
  !deployScript.includes('sourceBranch: "main"') ||
  !deployScript.includes('remote: "origin"') ||
  !deployScript.includes('import { assertSecureNodeRuntime } from "./node-runtime.mjs"') ||
  !/function deploy\(\) \{[\s\S]*?assertSecureNodeRuntime\(\);[\s\S]*?const sourceHead = assertRepositoryState\(\);/.test(
    deployScript,
  ) ||
  !deployScript.includes("must exactly match") ||
  !deployScript.includes('["status", "--porcelain"]') ||
  auditCommandIndex < 0 ||
  installCommandIndex < 0 ||
  buildCommandIndex < 0 ||
  auditCommandIndex > installCommandIndex ||
  installCommandIndex > buildCommandIndex ||
  !deployScript.includes('existsSync(join(CONFIG.distDirectory, "index.html"))') ||
  !/function assertSourceStillCurrent\(expectedHead\) \{[\s\S]*?const currentHead = assertRepositoryState\(\);[\s\S]*?currentHead !== expectedHead/.test(
    deployScript,
  ) ||
  !/if \(diff\.status === 0\) \{[\s\S]*?assertSourceStillCurrent\(sourceHead\);[\s\S]*?No deployment changes were detected\./.test(
    deployScript,
  ) ||
  !/git",[\s\S]*?commit[\s\S]*?assertSourceStillCurrent\(sourceHead\);[\s\S]*?git",[\s\S]*?push/.test(
    deployScript,
  )
) {
  fail(
    "Manual deployment must be fixed to main -> origin/gh-pages, require a patched Node runtime and clean synchronized source, audit all locked build/runtime dependencies before installation, install the exact dependency graph, run the full production build, revalidate source state, and reject stale/no-op publish races.",
  );
}

const viteConfig = readFileSync(VITE_CONFIG, "utf8");
if (
  !viteConfig.includes('const DEPLOYMENT_BASE_PATH = "./"') ||
  !viteConfig.includes("base: DEPLOYMENT_BASE_PATH") ||
  !viteConfig.includes("sourcemap: false") ||
  !viteConfig.includes("PUBLIC_ASSET_PATH_PATTERN") ||
  !viteConfig.includes("plugins: [rewriteRootPublicAssetPaths(), includeLegalFiles()]")
) {
  fail(
    "GitHub Pages packaging must keep a relative Vite base, disable production source maps, and rewrite root public-asset references for repository-subpath deployment.",
  );
}
if (
  !viteConfig.includes('runGit(["rev-parse", "--short=12", "HEAD"])') ||
  !viteConfig.includes('runGit(["show", "-s", "--format=%cs", "HEAD"])') ||
  !viteConfig.includes('const SOURCE_ARCHIVE_REVISION = "archive"') ||
  !viteConfig.includes('const SOURCE_ARCHIVE_BUILD_LABEL = "source-archive"') ||
  viteConfig.includes("new Date(") ||
  !viteConfig.includes("`v${packageMetadata.version}+${SOURCE_REVISION}`") ||
  !viteConfig.includes("__BUILD_LABEL__: JSON.stringify(BUILD_LABEL)") ||
  !viteConfig.includes("STONE_GRAIN_ASSET_PATTERN") ||
  !viteConfig.includes("perlinnoise.webp?v=${encodeURIComponent(SOURCE_REVISION)}")
) {
  fail(
    "Runtime version/cache metadata must be source-derived and reproducible; production bundles must not depend on the wall-clock build time.",
  );
}
const grassConfigLoader = readFileSync(GRASS_CONFIG_LOADER, "utf8");
if (
  !grassConfigLoader.includes('const CONFIG_URL = "./config/grass.yaml"') ||
  !grassConfigLoader.includes("encodeURIComponent(__APP_VERSION__)") ||
  !grassConfigLoader.includes("resolveDefaultConfigUrl()")
) {
  fail(
    "Default grass config loads must include the build revision so island/QA routes cannot reuse stale YAML after deployment.",
  );
}

const packageMetadata = JSON.parse(readFileSync(PACKAGE_FILE, "utf8"));
const buildScript = String(packageMetadata.scripts?.build ?? "");
const secureBuildPrefix = "node scripts/verify-node-runtime.mjs && tsc &&";
if (!buildScript.startsWith(secureBuildPrefix)) {
  fail("The production build must verify the Node security floor before TypeScript or bundler tooling runs.");
}
if (packageMetadata.scripts?.["test:node-runtime"] !== "node scripts/verify-node-runtime.mjs") {
  fail("The Node runtime security verifier must remain directly runnable.");
}
if (
  !buildScript.includes(
    "node scripts/verify-production-policy.mjs && node scripts/verify-legal-notices.mjs &&",
  ) ||
  packageMetadata.scripts?.["test:legal"] !== "node scripts/verify-legal-notices.mjs"
) {
  fail("Shipped third-party notices must remain a mandatory and directly runnable production gate.");
}
if (!buildScript.includes("vite build && node scripts/verify-built-site.mjs")) {
  fail(
    "The production build must verify the generated GitHub Pages artifact after Vite finishes.",
  );
}
const packageLock = JSON.parse(readFileSync(PACKAGE_LOCK_FILE, "utf8"));
const packageLockRoot = packageLock.packages?.[""];
if (
  !packageLockRoot ||
  packageLock.name !== packageMetadata.name ||
  packageLock.version !== packageMetadata.version ||
  packageLockRoot.name !== packageMetadata.name ||
  packageLockRoot.version !== packageMetadata.version ||
  packageLockRoot.engines?.node !== packageMetadata.engines?.node
) {
  fail("package-lock.json project metadata must match package.json exactly.");
}
const nodeEngine = String(packageMetadata.engines?.node ?? "");
if (
  nodeEngine.length === 0 ||
  /(?:\^|>=)20(?:\.|\b)/.test(nodeEngine)
) {
  fail("Production tooling must not advertise the end-of-life Node 20 line.");
}
const threeVersion = packageMetadata.dependencies?.three;
const threeTypesVersion = packageMetadata.devDependencies?.["@types/three"];
if (
  !threeVersion ||
  !threeTypesVersion ||
  releaseLine(threeVersion) !== releaseLine(threeTypesVersion)
) {
  fail("Three.js must declare @types/three from the same release line.");
}
const pinnedNodeVersion = readFileSync(NODE_VERSION_FILE, "utf8").trim();
if (pinnedNodeVersion !== PINNED_NODE_VERSION) {
  fail(
    `Local production tooling must pin patched Node ${PINNED_NODE_VERSION} in .nvmrc.`,
  );
}
const npmConfig = readFileSync(NPM_CONFIG_FILE, "utf8");
if (!/^engine-strict\s*=\s*true\s*$/m.test(npmConfig)) {
  fail("npm must enforce package.json engine constraints during install.");
}

console.log("[production-policy] Fixed-target deployment, single-entry Pages artifact, reproducible cache/environment metadata, legal notices, dependency, and runtime policies verified.");