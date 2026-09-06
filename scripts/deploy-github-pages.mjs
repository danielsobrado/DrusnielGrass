import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertSecureNodeRuntime } from "./node-runtime.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

const CONFIG = Object.freeze({
  branch: "gh-pages",
  sourceBranch: "main",
  remote: "origin",
  distDirectory: resolve(REPOSITORY_ROOT, "dist"),
});

function log(message) {
  console.log(`[github-pages] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    shell: process.platform === "win32" && command.endsWith(".cmd"),
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const details = result.stderr?.trim();
    throw new Error(
      details || `Command failed (${result.status}): ${command} ${args.join(" ")}`,
    );
  }

  return result;
}

function remoteBranchHead(branch) {
  const result = run(
    "git",
    ["ls-remote", "--heads", CONFIG.remote, `refs/heads/${branch}`],
    { capture: true },
  );
  const line = result.stdout.trim();
  if (!line) {
    return undefined;
  }
  return line.split(/\s+/)[0];
}

function assertRepositoryState() {
  run("git", ["rev-parse", "--is-inside-work-tree"], { capture: true });

  const status = run("git", ["status", "--porcelain"], { capture: true });
  if (status.stdout.trim()) {
    throw new Error("The working tree has uncommitted changes. Commit them first.");
  }

  const branch = run("git", ["branch", "--show-current"], {
    capture: true,
  }).stdout.trim();
  if (branch !== CONFIG.sourceBranch) {
    throw new Error(
      `Deployment must run from ${CONFIG.sourceBranch}; current branch is ${branch || "detached HEAD"}.`,
    );
  }

  const localHead = run("git", ["rev-parse", "HEAD"], {
    capture: true,
  }).stdout.trim();
  const remoteHead = remoteBranchHead(CONFIG.sourceBranch);
  if (!remoteHead || localHead !== remoteHead) {
    throw new Error(
      `Local ${CONFIG.sourceBranch} must exactly match ${CONFIG.remote}/${CONFIG.sourceBranch} before deployment.`,
    );
  }
  return localHead;
}

function assertSourceStillCurrent(expectedHead) {
  const currentHead = assertRepositoryState();
  if (currentHead !== expectedHead) {
    throw new Error(
      `${CONFIG.sourceBranch} changed during deployment; rebuild from the new source head.`,
    );
  }
}

function clearWorktree(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === ".git") {
      continue;
    }

    rmSync(join(directory, entry), { force: true, recursive: true });
  }
}

function installAndBuild() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  log("Auditing the locked dependency graph...");
  run(npmCommand, [
    "audit",
    "--package-lock-only",
    "--include=dev",
    "--audit-level=high",
  ]);
  log("Installing locked build dependencies...");
  run(npmCommand, ["ci", "--include=dev", "--no-audit", "--no-fund"]);
  log("Building the production site...");
  run(npmCommand, ["run", "build"]);

  if (!existsSync(join(CONFIG.distDirectory, "index.html"))) {
    throw new Error("The build completed without dist/index.html.");
  }
}

function deploy() {
  assertSecureNodeRuntime();
  const sourceHead = assertRepositoryState();
  installAndBuild();
  assertSourceStillCurrent(sourceHead);

  const deploymentDirectory = mkdtempSync(join(tmpdir(), "fluffygrass-pages-"));
  let worktreeAdded = false;

  try {
    const deploymentHead = remoteBranchHead(CONFIG.branch);
    const sourceRef = deploymentHead ?? sourceHead;
    if (deploymentHead) {
      run("git", ["fetch", CONFIG.remote, CONFIG.branch]);
    }

    run("git", ["worktree", "add", "--detach", deploymentDirectory, sourceRef]);
    worktreeAdded = true;

    clearWorktree(deploymentDirectory);
    cpSync(CONFIG.distDirectory, deploymentDirectory, { recursive: true });
    writeFileSync(join(deploymentDirectory, ".nojekyll"), "", "utf8");

    run("git", ["add", "--all"], { cwd: deploymentDirectory });

    const diff = run("git", ["diff", "--cached", "--quiet"], {
      cwd: deploymentDirectory,
      capture: true,
      allowFailure: true,
    });

    if (diff.status === 0) {
      assertSourceStillCurrent(sourceHead);
      log("No deployment changes were detected.");
      return;
    }
    if (diff.status !== 1) {
      throw new Error(`Unable to inspect deployment changes (git diff exited ${diff.status}).`);
    }

    run(
      "git",
      ["commit", "-m", "deploy: update GitHub Pages"],
      { cwd: deploymentDirectory },
    );
    assertSourceStillCurrent(sourceHead);
    run(
      "git",
      ["push", CONFIG.remote, `HEAD:${CONFIG.branch}`],
      { cwd: deploymentDirectory },
    );

    log(`Published dist/ to ${CONFIG.remote}/${CONFIG.branch}.`);
  } finally {
    if (worktreeAdded) {
      run("git", ["worktree", "remove", "--force", deploymentDirectory], {
        allowFailure: true,
      });
    }
    rmSync(deploymentDirectory, { force: true, recursive: true });
  }
}

try {
  deploy();
} catch (error) {
  console.error(
    `[github-pages] Deployment failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}