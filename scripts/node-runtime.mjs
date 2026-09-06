const MINIMUM_NODE_BY_MAJOR = Object.freeze({
  22: Object.freeze([22, 20, 0]),
  24: Object.freeze([24, 18, 1]),
});

function parseNodeVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `Unsupported Node.js version format ${version}. Production builds require a stable release.`,
    );
  }
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function formatVersion(version) {
  return version.join(".");
}

export function assertSecureNodeRuntime(version = process.versions.node) {
  const parsed = parseNodeVersion(version);
  const minimum = MINIMUM_NODE_BY_MAJOR[parsed[0]];
  if (!minimum) {
    throw new Error(
      `Unsupported Node.js ${version}. Use the pinned Node 24 LTS runtime or a supported Node 22 LTS runtime.`,
    );
  }
  if (compareVersions(parsed, minimum) < 0) {
    throw new Error(
      `Node.js ${version} is below the production security floor ${formatVersion(minimum)} for the ${parsed[0]}.x line.`,
    );
  }
}

export const PINNED_NODE_VERSION = formatVersion(MINIMUM_NODE_BY_MAJOR[24]);