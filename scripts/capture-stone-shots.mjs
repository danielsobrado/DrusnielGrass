import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

/**
 * Headless capture for the stone probes.
 *
 * The probes already publish a readiness signal in their title, so this waits
 * on that rather than on a timer: a stone world builds over many frames, and a
 * fixed sleep either wastes seconds or photographs a half-built chunk.
 *
 * World shots are aimed at a formation the field actually produced instead of
 * at fixed coordinates. A screenshot of empty meadow proves nothing, and the
 * cluster lattice moves whenever placement is tuned.
 */
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const OUTPUT_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  process.env.STONE_SHOT_DIR ?? ".tmp-screenshots/stone-formations",
);
const VIEWPORT = { width: 1600, height: 900 };
const READY_TIMEOUT_MS = 120_000;
/** How far out from the origin to search the cluster lattice for a formation. */
const SEARCH_RADIUS_CELLS = 24;
/** The widest patch a world shot asks for; candidates must leave room for it. */
const MAXIMUM_SPAN = 160;

/**
 * SwiftShader, explicitly. The headless shell has no GPU to fall back from, and
 * a silently context-less canvas photographs as a clear colour rather than as
 * an error.
 */
const BROWSER_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

async function findFormations(server) {
  const { WorldConfigLoader } = await server.ssrLoadModule(
    "/src/world/WorldConfigLoader.ts",
  );
  const { TerrainField } = await server.ssrLoadModule(
    "/src/world/TerrainField.ts",
  );
  const { StoneField } = await server.ssrLoadModule(
    "/src/world/stones/StoneField.ts",
  );
  const config = new WorldConfigLoader().parse(
    readFileSync(resolve(REPOSITORY_ROOT, "public/config/world.yaml"), "utf8"),
  );
  const stones = new StoneField(new TerrainField(config), config);
  // The probe refuses a patch that runs off the edge of the configured world,
  // so candidates near the rim are no use however good the formation is.
  const reach = config.worldSize * 0.5 - MAXIMUM_SPAN * 0.5;

  const found = [];
  for (
    let cellZ = -SEARCH_RADIUS_CELLS;
    cellZ <= SEARCH_RADIUS_CELLS;
    cellZ += 1
  ) {
    for (
      let cellX = -SEARCH_RADIUS_CELLS;
      cellX <= SEARCH_RADIUS_CELLS;
      cellX += 1
    ) {
      const cluster = stones.getResolvedCluster(cellX, cellZ);
      if (!cluster.splitSucceeded) continue;
      const anchor = cluster.members[0].instance;
      const half = cluster.members.find(
        (member) => member.isSplitHalf,
      ).instance;
      const x = (anchor.x + half.x) * 0.5;
      const z = (anchor.z + half.z) * 0.5;
      if (Math.abs(x) > reach || Math.abs(z) > reach) continue;
      found.push({
        x,
        z,
        archetype: anchor.archetype,
        scale: anchor.scale,
        separation: Math.hypot(half.x - anchor.x, half.z - anchor.z),
      });
    }
  }
  found.sort((left, right) => right.scale - left.scale);
  return found;
}

async function capture(page, url, file, label) {
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  await page.goto(url, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  try {
    await page.waitForFunction(
      () =>
        document.title.endsWith("ready") || document.title.endsWith("FAILED"),
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
  } finally {
    page.off("pageerror", onError);
  }
  const title = await page.title();
  if (title.endsWith("FAILED") || errors.length > 0) {
    const detail = await page.textContent("#out").catch(() => "");
    throw new Error(
      `[stone-shots] ${label} failed: ${errors.join("; ") || detail}`,
    );
  }
  // One more frame after readiness: the probes render on demand, and the first
  // paint can land before the compositor has the canvas.
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  await page.screenshot({ path: file });
  const summary = (await page.textContent("#out").catch(() => "")) ?? "";
  return summary.replace(/\s+/g, " ").trim();
}

const server = await createServer({
  root: REPOSITORY_ROOT,
  logLevel: "error",
  server: { port: 0, strictPort: false },
});
await server.listen();
const address = server.resolvedUrls?.local?.[0];
if (!address) {
  await server.close();
  throw new Error("[stone-shots] Dev server published no local URL.");
}
const origin = address.replace(/\/$/, "");

let browser;
try {
  const formations = await findFormations(server);
  rmSync(OUTPUT_DIRECTORY, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  browser = await chromium.launch({ args: BROWSER_ARGS });
  const page = await browser.newPage({ viewport: VIEWPORT });

  const shots = [
    {
      label: "gallery-whole",
      url: `${origin}/stone-gallery.html?focus=boulder&columns=4&dist=9`,
    },
    {
      label: "gallery-formation",
      url: `${origin}/stone-gallery.html?focus=boulder&columns=4&dist=9&formation=1`,
    },
    {
      // Major halves alone, breaks turned to the camera. Mated, the two break
      // faces point at each other and cannot be seen at any crack width.
      label: "gallery-break-faces",
      url: `${origin}/stone-gallery.html?focus=boulder&columns=3&dist=6&formation=a`,
    },
    {
      label: "gallery-formation-close",
      url: `${origin}/stone-gallery.html?focus=boulder&columns=2&dist=5&formation=1&growth=moss`,
    },
    {
      // The base against vegetation. Embed depth, the contact seam and the
      // skirt are all judged on where the silhouette stops being stone, and
      // on bare ground that edge is not the one the world draws.
      label: "gallery-grass-contact",
      url: `${origin}/stone-gallery.html?focus=boulder&columns=2&dist=4.2&formation=1&grass=1`,
    },
  ];

  if (formations.length === 0) {
    console.warn(
      "[stone-shots] No mated formation found; world shots skipped.",
    );
  } else {
    const hero = formations[0];
    shots.push(
      {
        // Cluster context: the formation among its neighbours, from roughly
        // where a player would first notice it.
        label: "world-formation",
        url: `${origin}/stone-world.html?x=${hero.x.toFixed(2)}&z=${hero.z.toFixed(2)}&h=${(hero.scale * 4).toFixed(2)}&d=${(hero.scale * 11).toFixed(2)}&span=160`,
      },
      {
        // Eye level at arm's length, which is where the break has to hold up.
        label: "world-formation-close",
        url: `${origin}/stone-world.html?x=${hero.x.toFixed(2)}&z=${hero.z.toFixed(2)}&h=${(hero.scale * 0.9).toFixed(2)}&d=${(hero.scale * 2.4).toFixed(2)}&span=120`,
      },
      {
        // Looking down on the base, which is where the contact soil reads.
        label: "world-formation-ground",
        url: `${origin}/stone-world.html?x=${hero.x.toFixed(2)}&z=${hero.z.toFixed(2)}&h=${(hero.scale * 2.6).toFixed(2)}&d=${(hero.scale * 2.2).toFixed(2)}&span=120`,
      },
    );
    console.log(
      `[stone-shots] ${formations.length} formations in range; hero ${hero.archetype} scale ${hero.scale.toFixed(2)} at (${hero.x.toFixed(1)}, ${hero.z.toFixed(1)}), halves ${hero.separation.toFixed(2)} m apart.`,
    );
  }

  for (const shot of shots) {
    const file = join(OUTPUT_DIRECTORY, `${shot.label}.png`);
    const summary = await capture(page, shot.url, file, shot.label);
    console.log(`[stone-shots] ${shot.label}.png · ${summary}`);
  }
  console.log(
    `[stone-shots] wrote ${shots.length} shots to ${OUTPUT_DIRECTORY}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
