import {
  assertSecureNodeRuntime,
  PINNED_NODE_VERSION,
} from "./node-runtime.mjs";

function assertAccepted(version) {
  try {
    assertSecureNodeRuntime(version);
  } catch (error) {
    throw new Error(
      `[node-runtime] Expected Node ${version} to be accepted: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertRejected(version) {
  let rejected = false;
  try {
    assertSecureNodeRuntime(version);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error(`[node-runtime] Expected Node ${version} to be rejected.`);
  }
}

assertAccepted("22.20.0");
assertAccepted("22.99.0");
assertAccepted("24.18.1");
assertAccepted("24.99.0");
assertRejected("22.19.9");
assertRejected("24.18.0");
assertRejected("20.99.0");
assertRejected("26.0.0");
assertRejected("24.18.1-rc.1");
assertRejected("24.18.1+local");
assertSecureNodeRuntime();

console.log(
  `[node-runtime] Stable patched Node 22/24 floors verified; local production pin is ${PINNED_NODE_VERSION}.`,
);