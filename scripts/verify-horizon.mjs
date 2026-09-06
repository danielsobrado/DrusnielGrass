import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const EPSILON = 1e-4;

function assert(condition, message) {
  if (!condition) throw new Error(`[horizon] ${message}`);
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
  const { createWorldHorizonAxis } = await server.ssrLoadModule(
    "/src/world/horizon/WorldHorizonGrid.ts",
  );
  const { WORLD_HORIZON_SINK_DEPTH } = await server.ssrLoadModule(
    "/src/world/horizon/WorldHorizonTuning.ts",
  );
  const { WORLD_DEFAULT_DESKTOP_FOG_DENSITY } = await server.ssrLoadModule(
    "/src/app/WorldEnvironmentTuning.ts",
  );
  const { TerrainField } = await server.ssrLoadModule("/src/world/TerrainField.ts");
  const { WORLD_CONFIG_SCHEMA } = await server.ssrLoadModule(
    "/src/world/WorldConfigSchema.ts",
  );
  const { validateWorldConfig } = await server.ssrLoadModule(
    "/src/world/WorldConfigValidator.ts",
  );

  const source = readFileSync(
    resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
    "utf8",
  );
  const config = Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).trim(), Number(line.slice(separator + 1))];
      }),
  );
  for (const key of Object.keys(WORLD_CONFIG_SCHEMA)) {
    assert(Number.isFinite(config[key]), `World config is missing ${key}.`);
  }
  validateWorldConfig(config);
  assert(
    config.horizonEnabled >= 1,
    "The shipped world must keep the horizon shell enabled.",
  );

  const axis = createWorldHorizonAxis(
    config.worldSize,
    config.horizonSpacing,
    config.horizonApronRings,
    config.horizonApronGrowth,
  );
  const worldHalf = config.worldSize * 0.5;
  /** Distance at which `FogExp2` reaches 98% opacity. */
  const fogCloseDistance =
    Math.sqrt(-Math.log(1 - 0.98)) / WORLD_DEFAULT_DESKTOP_FOG_DENSITY;

  // --- The grid itself -----------------------------------------------------
  for (let line = 1; line < axis.size; line += 1) {
    assert(
      axis.positions[line] > axis.positions[line - 1],
      "Horizon axis positions must ascend so the grid never folds back on itself.",
    );
  }
  assert(
    Math.abs(axis.positions[0] + axis.outerHalfExtent) <= EPSILON &&
      Math.abs(axis.positions[axis.size - 1] - axis.outerHalfExtent) <= EPSILON,
    "The horizon axis must be symmetric about the world centre.",
  );

  const firstInterior = config.horizonApronRings;
  const lastInterior = firstInterior + axis.interiorCells;
  assert(
    Math.abs(axis.positions[firstInterior] + worldHalf) <= EPSILON &&
      Math.abs(axis.positions[lastInterior] - worldHalf) <= EPSILON,
    "The uniform interior of the shell must span exactly the world bounds.",
  );
  for (let line = firstInterior + 1; line <= lastInterior; line += 1) {
    assert(
      Math.abs(
        axis.positions[line] - axis.positions[line - 1] - config.horizonSpacing,
      ) <= EPSILON,
      "Interior shell spacing must stay uniform so its vertices land where the streamed chunks sample.",
    );
  }

  // --- Coverage: the invariant the shell exists to hold ---------------------
  // Standing anywhere in the world and looking any direction, the shell has to
  // outreach the streamed ring. If it does not, terrain still ends in view and
  // the shell has not actually removed the edge it was built to remove.
  for (const [profile, radius] of [
    ["desktop", config.terrainRadiusDesktop],
    ["compact", config.terrainRadiusCompact],
  ]) {
    const ringOuterReach = (radius + 1) * config.chunkSize;
    assert(
      axis.outerHalfExtent >= worldHalf + ringOuterReach,
      `The shell must outreach the ${profile} streamed ring from every point in the world.`,
    );
  }
  assert(
    axis.outerHalfExtent >= worldHalf + fogCloseDistance,
    `The shell must carry ground past the ${fogCloseDistance.toFixed(0)} m at which fog closes, so the horizon is haze rather than an edge.`,
  );

  // --- The sink band -------------------------------------------------------
  // Buried where the ring is guaranteed present, at true height where it is
  // guaranteed absent. Anything wider leaves a trench past the ring; anything
  // narrower surfaces the coarse shell through the fine terrain.
  for (const [profile, radius] of [
    ["desktop", config.terrainRadiusDesktop],
    ["compact", config.terrainRadiusCompact],
  ]) {
    const guaranteed = radius * config.chunkSize;
    const outer = (radius + 1) * config.chunkSize;
    assert(
      outer - guaranteed === config.chunkSize,
      `The ${profile} sink ramp must be exactly one chunk wide.`,
    );
  }

  // --- Cost ----------------------------------------------------------------
  const cells = axis.size - 1;
  const triangles = cells * cells * 2;
  const ringChunks = Math.pow(2 * config.terrainRadiusDesktop + 1, 2);
  assert(
    triangles <= 120000,
    `The shell costs ${triangles} triangles, above the configured ceiling.`,
  );

  // --- Accuracy against the real field -------------------------------------
  // The sink depth is a bet that the shell's interpolation error stays small.
  // Coarsen horizonSpacing far enough and the coarse mesh starts poking up
  // through the streamed terrain, which is the artefact this whole system is
  // meant to remove — so the bet is measured here rather than assumed.
  const field = new TerrainField(config);
  const spacing = config.horizonSpacing;
  const latticeSize = axis.interiorCells + 1;
  const lattice = new Float64Array(latticeSize * latticeSize);
  for (let row = 0; row < latticeSize; row += 1) {
    for (let column = 0; column < latticeSize; column += 1) {
      lattice[row * latticeSize + column] = field.sampleHeight(
        -worldHalf + column * spacing,
        -worldHalf + row * spacing,
      );
    }
  }
  const interpolate = (x, z) => {
    const fx = Math.min(latticeSize - 1.0001, Math.max(0, (x + worldHalf) / spacing));
    const fz = Math.min(latticeSize - 1.0001, Math.max(0, (z + worldHalf) / spacing));
    const column = Math.floor(fx);
    const row = Math.floor(fz);
    const tx = fx - column;
    const tz = fz - row;
    const lowerLeft = lattice[row * latticeSize + column];
    const lowerRight = lattice[row * latticeSize + column + 1];
    const upperLeft = lattice[(row + 1) * latticeSize + column];
    const upperRight = lattice[(row + 1) * latticeSize + column + 1];
    // Match the shell's actual index buffer. Each cell is two planar triangles,
    // not a bilinear patch; testing a different interpolant can hide the exact
    // ridge error that the sink depth is meant to contain.
    return tx + tz <= 1
      ? lowerLeft + (lowerRight - lowerLeft) * tx +
          (upperLeft - lowerLeft) * tz
      : upperRight + (upperLeft - upperRight) * (1 - tx) +
          (lowerRight - upperRight) * (1 - tz);
  };

  const probe = 220;
  const errors = [];
  for (let row = 0; row < probe; row += 1) {
    for (let column = 0; column < probe; column += 1) {
      const x = -worldHalf + ((column + 0.5) / probe) * config.worldSize;
      const z = -worldHalf + ((row + 0.5) / probe) * config.worldSize;
      errors.push(Math.abs(interpolate(x, z) - field.sampleHeight(x, z)));
    }
  }
  errors.sort((left, right) => left - right);
  const p99 = errors[Math.floor(0.99 * (errors.length - 1))];
  assert(
    p99 <= WORLD_HORIZON_SINK_DEPTH,
    `Shell height error reaches ${p99.toFixed(2)} m at the 99th percentile, past the ${WORLD_HORIZON_SINK_DEPTH} m it is sunk by; it would surface through the streamed terrain.`,
  );

  // --- The built shell -----------------------------------------------------
  // Everything above tests the grid in the abstract. This builds the real mesh
  // and reads the attributes that actually ship.
  const { WorldHorizonShell } = await server.ssrLoadModule(
    "/src/world/horizon/WorldHorizonShell.ts",
  );
  // A stub scene rather than a real one: the shell only ever adds and removes
  // its single mesh, and loading a second copy of three here would leave the
  // script comparing objects built by two different module instances.
  const sceneChildren = [];
  const scene = {
    add(object) {
      sceneChildren.push(object);
    },
    remove(object) {
      const index = sceneChildren.indexOf(object);
      if (index >= 0) sceneChildren.splice(index, 1);
    },
  };
  // Built over a smaller world than the shipped one. The assertions here are
  // about behaviour rather than about this world's dimensions — which the grid,
  // cost, and accuracy checks above already cover against the real config — and
  // a shell only builds 1.5 ms per update by design, so the shipped 25,921
  // vertices would put minutes of sliced building into every `npm run build`.
  const shellConfig = { ...config, worldSize: 512, horizonApronRings: 6 };
  const shellAxis = createWorldHorizonAxis(
    shellConfig.worldSize,
    shellConfig.horizonSpacing,
    shellConfig.horizonApronRings,
    shellConfig.horizonApronGrowth,
  );
  const shellWorldHalf = shellConfig.worldSize * 0.5;
  const shellTriangles = Math.pow(shellAxis.size - 1, 2) * 2;

  // The field has to be built from the same reduced config: grass suitability
  // vanishes outside `worldSize`, so a field still carrying the shipped 2048 m
  // bound would put this whole apron comfortably inside it and the clamp under
  // test would never be exercised.
  const shellField = new TerrainField(shellConfig);
  const shell = new WorldHorizonShell(scene, shellField, shellConfig, false);
  const focus = { x: 0, y: 0, z: 0 };
  const buildStartedAt = Date.now();
  while (!shell.getDiagnostics().complete && Date.now() - buildStartedAt < 60000) {
    shell.update(focus);
  }
  const diagnostics = shell.getDiagnostics();
  assert(diagnostics.complete, "The shell build must terminate.");
  assert(
    diagnostics.triangles === shellTriangles,
    `The built shell holds ${diagnostics.triangles} triangles, not the ${shellTriangles} its grid implies.`,
  );

  const mesh = sceneChildren.find((child) => child.name === "world-horizon-shell");
  assert(mesh !== undefined, "The finished shell must be added to the scene.");
  const colors = mesh.geometry.getAttribute("color");
  const positions = mesh.geometry.getAttribute("position");
  assert(
    positions.count === shellAxis.size * shellAxis.size,
    "The shell must carry one vertex per grid line intersection.",
  );

  // Grass suitability is defined as zero outside the world, and feeding that to
  // the palette paints bare soil — a brown ring around the horizon. The shell
  // clamps its colour reads to the world edge for exactly this reason, so the
  // apron must come out the same colour as the ground it continues.
  // Vegetated fraction is the discriminator, not average colour. Suitability is
  // already zero across plenty of ground inside the world — bare spurs, rock,
  // water margins — so region averages cannot tell a clamped apron from an
  // unclamped one. What only the clamp can produce is apron vertices that are
  // still *green*: without it every vertex beyond the bound takes suitability
  // zero, which drives `bare` to one and erases the grass colour entirely.
  const greenFraction = (predicate) => {
    let green = 0;
    let count = 0;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      if (!predicate(x, z)) continue;
      if (colors.getY(index) - colors.getX(index) > 0.02) green += 1;
      count += 1;
    }
    assert(count > 0, "Colour sampling selected no vertices.");
    return green / count;
  };
  const outside = (x, z) =>
    Math.abs(x) > shellWorldHalf + EPSILON || Math.abs(z) > shellWorldHalf + EPSILON;
  const apronGreen = greenFraction(outside);
  const interiorGreen = greenFraction((x, z) => !outside(x, z));
  assert(
    apronGreen > interiorGreen * 0.5,
    `Only ${(apronGreen * 100).toFixed(1)}% of apron vertices carry vegetation against ${(interiorGreen * 100).toFixed(1)}% inside the world; the colour clamp is not holding and the apron has gone to bare soil.`,
  );
  shell.dispose();
  assert(
    sceneChildren.length === 0,
    "Disposing the shell must remove it from the scene.",
  );

  console.log(
    `[horizon] Shell verified: ${axis.size}x${axis.size} grid, ${triangles} triangles in one draw call against ${ringChunks} streamed chunks, reaching ${axis.outerHalfExtent.toFixed(0)} m with ${p99.toFixed(2)} m p99 error under a ${WORLD_HORIZON_SINK_DEPTH} m sink.`,
  );
} finally {
  await server.close();
}
