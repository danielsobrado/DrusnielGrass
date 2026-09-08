import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const DIST_DIRECTORY = resolve(REPOSITORY_ROOT, "dist");
const PUBLIC_DIRECTORY = resolve(REPOSITORY_ROOT, "public");
const INDEX_FILE = resolve(DIST_DIRECTORY, "index.html");
const LOCAL_REFERENCE_PATTERN = /\b(?:src|href)=["']([^"']+)["']/g;
const ABSOLUTE_LOCAL_REFERENCE_PATTERN = /\b(?:src|href)=["']\/(?!\/)/;
const ABSOLUTE_CSS_URL_PATTERN = /url\(\s*["']?\/(?!\/)/i;
const ABSOLUTE_RUNTIME_ASSET_PATTERN =
  /(["'`])\/(?!\/)[^"'`]*\.(?:avif|basis|bin|exr|gif|glb|gltf|hdr|jpe?g|json|ktx2|mp3|ogg|png|svg|wav|webp|ya?ml)(?:\?[^"'`]*)?\1/i;
const REQUIRED_CSP_DIRECTIVES = Object.freeze([
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
]);

function fail(message) {
  throw new Error(`[built-site] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function resolveLocalReference(reference) {
  if (
    reference.startsWith("#") ||
    reference.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(reference)
  ) {
    return undefined;
  }
  const cleanReference = reference.split(/[?#]/, 1)[0];
  if (!cleanReference) {
    return undefined;
  }
  const path = resolve(DIST_DIRECTORY, cleanReference);
  const distPrefix = `${DIST_DIRECTORY}${sep}`;
  if (path !== DIST_DIRECTORY && !path.startsWith(distPrefix)) {
    fail(`Generated HTML reference escapes dist/: ${reference}.`);
  }
  return path;
}

assert(existsSync(INDEX_FILE), "dist/index.html is missing.");
const html = readFileSync(INDEX_FILE, "utf8");
assert(
  !ABSOLUTE_LOCAL_REFERENCE_PATTERN.test(html),
  "Generated index.html contains a root-absolute local asset reference that will break repository-subpath GitHub Pages deployment.",
);
assert(
  html.includes('http-equiv="Content-Security-Policy"'),
  "Generated index.html is missing its Content Security Policy.",
);
for (const directive of REQUIRED_CSP_DIRECTIVES) {
  assert(
    html.includes(directive),
    `Generated index.html CSP is missing required directive: ${directive}.`,
  );
}
assert(
  html.includes('name="referrer" content="strict-origin-when-cross-origin"'),
  "Generated index.html is missing the strict referrer policy.",
);

const references = Array.from(
  html.matchAll(LOCAL_REFERENCE_PATTERN),
  (match) => match[1],
);
let localScriptCount = 0;
let localStyleCount = 0;
for (const reference of references) {
  const path = resolveLocalReference(reference);
  if (!path) {
    continue;
  }
  assert(
    existsSync(path) && statSync(path).isFile(),
    `Generated index.html references a missing file: ${reference}.`,
  );
  if (/\.js(?:[?#]|$)/i.test(reference)) {
    localScriptCount += 1;
  }
  if (/\.css(?:[?#]|$)/i.test(reference)) {
    localStyleCount += 1;
  }
}
assert(localScriptCount > 0, "Generated index.html does not reference a local JavaScript bundle.");
assert(localStyleCount > 0, "Generated index.html does not reference a local stylesheet.");

const builtFiles = listFiles(DIST_DIRECTORY);
const builtHtmlFiles = builtFiles.filter(
  (path) => extname(path).toLowerCase() === ".html",
);
assert(
  builtHtmlFiles.length === 1 && builtHtmlFiles[0] === INDEX_FILE,
  `Generated site must publish only index.html; found: ${builtHtmlFiles
    .map((path) => relative(DIST_DIRECTORY, path))
    .join(", ")}.`,
);
assert(
  !builtFiles.some((path) => extname(path).toLowerCase() === ".map"),
  "Generated site must not publish source-map artifacts.",
);
for (const path of builtFiles) {
  const extension = extname(path).toLowerCase();
  if (extension !== ".css" && extension !== ".js") {
    continue;
  }
  const source = readFileSync(path, "utf8");
  const builtPath = relative(DIST_DIRECTORY, path);
  if (extension === ".css") {
    assert(
      !ABSOLUTE_CSS_URL_PATTERN.test(source),
      `Generated stylesheet contains a root-absolute url(...): ${builtPath}.`,
    );
  } else {
    assert(
      !ABSOLUTE_RUNTIME_ASSET_PATTERN.test(source),
      `Generated JavaScript contains a root-absolute runtime asset path: ${builtPath}.`,
    );
  }
}

for (const sourcePath of listFiles(PUBLIC_DIRECTORY)) {
  const publicPath = relative(PUBLIC_DIRECTORY, sourcePath);
  const builtPath = resolve(DIST_DIRECTORY, publicPath);
  assert(
    existsSync(builtPath) && statSync(builtPath).isFile(),
    `Public runtime asset was not copied to dist/: ${publicPath}.`,
  );
  assert(
    readFileSync(builtPath).equals(readFileSync(sourcePath)),
    `Public runtime asset content changed during copy: ${publicPath}.`,
  );
}

for (const legalFile of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  const sourcePath = resolve(REPOSITORY_ROOT, legalFile);
  const builtPath = resolve(DIST_DIRECTORY, legalFile);
  assert(
    existsSync(builtPath) && statSync(builtPath).isFile(),
    `Generated site is missing ${legalFile}.`,
  );
  assert(
    readFileSync(builtPath).equals(readFileSync(sourcePath)),
    `Generated ${legalFile} does not match the repository source.`,
  );
}

/**
 * The shipped bundle must carry one material implementation, not two.
 *
 * Every legacy GLSL route now lives in a module only `src/dev` and the
 * verifiers import, so the shader text the node materials were ported from
 * stays available as an executable comparison reference without being shipped.
 * These markers are GLSL function, varying and chunk names, which exist only in
 * the legacy sources: if one reappears in a chunk, a production path has
 * reached back into the legacy implementation. Uniform names are deliberately
 * not used here -- both implementations read one shared uniform table, so a
 * uniform name proves nothing about which shading path shipped.
 */
const LEGACY_SHADER_MARKERS = Object.freeze([
  "GRASS_SHEEN_OUTPUT",
  "waterSampleRiverBed",
  "stoneGrowthNoise",
  "uHorizonSinkDepth",
  "vWorldCloudDirectScale",
  "#include <opaque_fragment>",
]);
const bundleFiles = listFiles(resolve(DIST_DIRECTORY, "assets"))
  .filter((file) => file.endsWith(".js"));
for (const marker of LEGACY_SHADER_MARKERS) {
  const carrying = bundleFiles.filter((file) =>
    readFileSync(file, "utf8").includes(marker));
  assert(
    carrying.length === 0,
    `A legacy shader route reached the bundle: ${marker} appears in `
      + carrying.map((file) => relative(DIST_DIRECTORY, file)).join(", "),
  );
}

console.log(
  `[built-site] Single-entry Pages artifact, relative index/bundles, complete runtime CSP, no source maps, ${references.length} HTML references, byte-identical public/legal assets, no legacy shader route in ${bundleFiles.length} chunks verified.`,
);