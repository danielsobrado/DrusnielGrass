import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, ".shots/meadow-review");
const CAPTURE_SCRIPT = resolve(
  SCRIPT_DIRECTORY,
  "capture-visual-matrix-poses.mjs",
);

const server = await createServer({
  root: REPOSITORY_ROOT,
  logLevel: "error",
  server: { port: 0, strictPort: false },
});

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("[meadow-shots] Dev server did not publish a TCP port.");
  }

  rmSync(OUTPUT_DIRECTORY, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  const exitCode = await new Promise((resolveExit, rejectExit) => {
    const child = spawn(
      process.execPath,
      [
        CAPTURE_SCRIPT,
        "meadow-review",
        OUTPUT_DIRECTORY,
        String(address.port),
      ],
      {
        cwd: REPOSITORY_ROOT,
        env: {
          ...process.env,
          FLUFFY_CLEAN_SHOT: "1",
          FLUFFY_NO_SCENIC: "1",
          FLUFFY_VIEWPORT: "1920x1080",
          FLUFFY_CDP_PORT: process.env.FLUFFY_CDP_PORT ?? "9341",
        },
        stdio: "inherit",
      },
    );
    child.once("error", rejectExit);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`[meadow-shots] Capture process exited with ${exitCode}.`);
  }
  console.log(`[meadow-shots] Review set written to ${OUTPUT_DIRECTORY}`);
} finally {
  await server.close();
}
