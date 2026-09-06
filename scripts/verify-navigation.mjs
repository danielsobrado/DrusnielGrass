import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * Build gate for map travel.
 *
 * The projection is exercised against the real module rather than a copy: a
 * flipped axis or a half-cell bias still renders a plausible map and still
 * teleports somewhere, so only a round-trip against the shipped code can tell
 * the difference. The controller contracts are checked as source invariants,
 * because constructing either controller needs a canvas and a WebGL context.
 */
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function fail(message) {
  throw new Error(`[navigation] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const server = await createServer({
  configFile: false,
  root: REPOSITORY_ROOT,
  appType: "custom",
  logLevel: "silent",
  server: {
    middlewareMode: true,
    watch: null,
  },
  optimizeDeps: { noDiscovery: true },
});

try {
  const projection = await server.ssrLoadModule(
    "/src/app/WorldMinimapProjection.ts",
  );
  const {
    minimapCellToWorld,
    minimapUnitToWorld,
    worldToMinimapUnit,
  } = projection;

  const extent = { worldSize: 2048, resolution: 256 };
  const half = extent.worldSize * 0.5;
  const unit = { x: 0, y: 0 };
  const world = { x: 0, z: 0 };

  // A click must land where the player pointed. Round-trip every 16th cell
  // centre through both directions and require metre-level agreement.
  let worstError = 0;
  for (let row = 0; row < extent.resolution; row += 16) {
    for (let column = 0; column < extent.resolution; column += 16) {
      minimapCellToWorld(extent, column, row, world);
      assert(
        Math.abs(world.x) <= half && Math.abs(world.z) <= half,
        `Cell ${column},${row} maps outside the world at ${world.x}, ${world.z}.`,
      );
      const sourceX = world.x;
      const sourceZ = world.z;
      worldToMinimapUnit(extent, sourceX, sourceZ, unit);
      minimapUnitToWorld(extent, unit.x, unit.y, world);
      worstError = Math.max(
        worstError,
        Math.abs(world.x - sourceX),
        Math.abs(world.z - sourceZ),
      );
    }
  }
  assert(
    worstError <= 1e-6,
    `Minimap projection does not round-trip; worst error ${worstError} m.`,
  );

  // Cell centres, not corners: the first cell must sit half a cell inside the
  // world edge, or the whole raster is biased against the terrain it shows.
  minimapCellToWorld(extent, 0, 0, world);
  const halfCell = extent.worldSize / extent.resolution / 2;
  assert(
    Math.abs(world.x - (-half + halfCell)) <= 1e-9 &&
      Math.abs(world.z - (-half + halfCell)) <= 1e-9,
    `First raster cell is not sampled at its centre (${world.x}, ${world.z}).`,
  );

  // Axis orientation. Map space runs +X right and +Z down; a silent flip here
  // sends every teleport to a mirrored destination.
  worldToMinimapUnit(extent, half, -half, unit);
  assert(
    unit.x === 1 && unit.y === 0,
    `Map axes are flipped: world corner mapped to ${unit.x}, ${unit.y}.`,
  );

  // Clicks on the panel border must clamp rather than escape the world.
  minimapUnitToWorld(extent, -0.4, 1.9, world);
  assert(
    world.x === -half && world.z === half,
    `Out-of-range map clicks are not clamped (${world.x}, ${world.z}).`,
  );

  const controller = read("src/controls/WorldController.ts");
  assert(
    controller.includes("teleport(x: number, z: number): void;"),
    "The world controller contract must expose teleport for map travel.",
  );

  // Both control modes must bound the destination. Without this an edge click
  // drops the player outside the streamed world, where terrain never arrives.
  const thirdPerson = read("src/controls/ThirdPersonController.ts");
  const fly = read("src/controls/FlyWorldController.ts");
  const flyController = read("src/controls/FlyController.ts");
  const inputTarget = read("src/controls/InputTarget.ts");
  for (const [name, source] of [
    ["ThirdPersonController", thirdPerson],
    ["FlyWorldController", fly],
  ]) {
    assert(
      /teleport\(x: number, z: number\): void \{/.test(source),
      `${name} must implement teleport.`,
    );
    assert(
      source.includes("worldSize * 0.5 - 2"),
      `${name} must clamp teleport destinations inside the streamed world.`,
    );
    assert(
      source.includes("sampleHeight("),
      `${name} must settle a teleport against the terrain surface.`,
    );
  }

  // Free flight has no collision, so its own bounds must stay in the
  // controller rather than drifting back into the composition root.
  const app = read("src/app/WorldApp.ts");
  assert(
    !app.includes("constrainCamera"),
    "Fly camera bounds must stay owned by FlyWorldController, not WorldApp.",
  );
  assert(
    /if \(!this\.minimap\.isOpen\(\)\) \{[\s\S]*?this\.controls\.update\(deltaSeconds\);[\s\S]*?\}/.test(
      app,
    ),
    "World controls must not advance while the minimap modal is open.",
  );
  assert(
    fly.includes("spawnEyeHeight") && fly.includes("mountainHeight"),
    "FlyWorldController must own its ground clearance and altitude ceiling.",
  );
  assert(
    fly.includes("private worldDisposed = false") &&
      /update\(deltaSeconds: number\): void \{[\s\S]*?if \(this\.worldDisposed\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?super\.update\(deltaSeconds\)/.test(
        fly,
      ) &&
      /dispose\(\): void \{[\s\S]*?if \(this\.worldDisposed\)[\s\S]*?this\.worldDisposed = true;[\s\S]*?super\.dispose\(\)/.test(
        fly,
      ) &&
      /teleport\(x: number, z: number\): void \{[\s\S]*?if \(this\.worldDisposed\)/.test(
        fly,
      ) &&
      /captureLookAt\([\s\S]*?\): void \{[\s\S]*?if \(this\.worldDisposed\)/.test(
        fly,
      ),
    "Disposed fly-world controls must stop terrain sampling and camera mutations through stale references.",
  );
  assert(
    flyController.includes("this.yaw = Math.atan2(-dx, -dz)") &&
      flyController.includes("exitPointerLockSafely()"),
    "Fly capture must use the camera -Z yaw convention and cleanup must release pointer lock without aborting teardown.",
  );
  assert(
    /export function exitPointerLockSafely\(\): void \{[\s\S]*?document\.exitPointerLock\(\)[\s\S]*?catch/.test(
      inputTarget,
    ),
    "Pointer-lock release must remain an isolated optional browser operation.",
  );

  // The raster must stay incremental. A single-shot build of a 256² map runs
  // long enough to trip the app's own frame-stall watchdog.
  const raster = read("src/app/WorldMinimapRaster.ts");
  assert(
    raster.includes("advance(budgetMs: number)") &&
      raster.includes("performance.now() < deadline"),
    "The minimap raster must build under a frame budget.",
  );
  const minimap = read("src/app/WorldMinimap.ts");
  const rasterConstruction = minimap.indexOf(
    "const raster = this.raster ?? new WorldMinimapRaster",
  );
  const openPublication = minimap.indexOf("this.open = true", rasterConstruction);
  assert(
    rasterConstruction >= 0 &&
      openPublication > rasterConstruction &&
      /this\.open = true;[\s\S]*?try \{[\s\S]*?this\.update\(\);[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.open = false;[\s\S]*?this\.root\.hidden = true;[\s\S]*?throw error;/.test(
        minimap,
      ),
    "The minimap must stay lazy but build before publishing modal state, and a failed first update must close it again.",
  );
  assert(
    /update\(\): void \{[\s\S]*?try \{[\s\S]*?raster\.advance\(BUILD_BUDGET_MS\)[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.disableAfterFailure\(error\);/.test(
      minimap,
    ) &&
      /private disableAfterFailure\(error: unknown\): void \{[\s\S]*?this\.open = false;[\s\S]*?this\.dispose\(\);/.test(
        minimap,
      ) &&
      /private travelTo\([\s\S]*?try \{[\s\S]*?this\.controls\.teleport[\s\S]*?\} finally \{[\s\S]*?this\.setOpen\(false\);/.test(
        minimap,
      ) &&
      /dispose\(\): void \{[\s\S]*?this\.disposed = true;[\s\S]*?this\.open = false;/.test(
        minimap,
      ),
    "Minimap paint/raster and teleport faults must fail closed so optional UI cannot leave gameplay controls permanently paused.",
  );
  assert(
    minimap.includes('event.code === "KeyM"') &&
      minimap.includes("isTypingTarget"),
    "The map toggle must bind to M and ignore keys typed into controls.",
  );
  assert(
    minimap.includes("document.pointerLockElement !== null") &&
      minimap.includes("exitPointerLockSafely()") &&
      !minimap.includes("document.exitPointerLock()"),
    "Opening the map must safely release pointer lock so browser denial cannot leave a half-open map.",
  );
  assert(
    minimap.includes("event.stopPropagation()"),
    "Keyboard map activation must not bubble into character movement actions.",
  );
  assert(
    minimap.includes(
      'window.addEventListener("keydown", this.handleKeyDown, true)',
    ) &&
      minimap.includes(
        'window.removeEventListener("keydown", this.handleKeyDown, true)',
      ) &&
      minimap.includes("event.target === this.canvas") &&
      minimap.includes("!this.open ||"),
    "The open minimap must capture keyboard events before world input while preserving its own activation keys.",
  );
  assert(
    /try \{[\s\S]*?document\.body\.appendChild\(this\.root\);[\s\S]*?window\.addEventListener\("keydown", this\.handleKeyDown, true\);[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.canvas\.removeEventListener\("pointerdown", this\.handlePointerDown\);[\s\S]*?window\.removeEventListener\("keydown", this\.handleKeyDown, true\);[\s\S]*?this\.root\.remove\(\);[\s\S]*?throw error;/.test(
      minimap,
    ),
    "A failed minimap publication must remove any partially bound listeners and its orphaned dialog before construction rethrows.",
  );

  console.log(
    `[navigation] OK · projection round-trips within ${worstError.toExponential(1)} m · teleport bounded · fly capture aligned · pointer release isolated · map publication transactional · map faults fail closed`,
  );
} catch (error) {
  console.error(`[navigation] ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await server.close();
}
