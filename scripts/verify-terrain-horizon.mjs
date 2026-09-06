import { createServer } from "vite";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[terrain-horizon] ${message}`);
  }
}

const server = await createServer({
  configFile: false,
  appType: "custom",
  server: {
    middlewareMode: true,
    watch: null,
  },
});

try {
  const { TerrainHorizonCuller, DEFAULT_TERRAIN_HORIZON_OPTIONS } =
    await server.ssrLoadModule(
      "/src/render/visibility/TerrainHorizonCuller.ts",
    );

  // A single north ridge 120 m out, 80 m tall. Ground is flat elsewhere, so
  // anything rejected must have been rejected because of this ridge.
  const RIDGE_DISTANCE = 120;
  const RIDGE_HEIGHT = 80;
  const ridgeTerrain = (x, z) =>
    z > RIDGE_DISTANCE - 10 && z < RIDGE_DISTANCE + 10 && Math.abs(x) < 400
      ? RIDGE_HEIGHT
      : 0;

  const culler = new TerrainHorizonCuller(DEFAULT_TERRAIN_HORIZON_OPTIONS);

  assert(
    culler.isOccluded(0, 0, 400, 1) === false,
    "A culler with no profile must never reject; an unbuilt horizon is not an empty horizon.",
  );

  culler.build(0, 2, 0, ridgeTerrain);
  assert(culler.isReady(), "Building a profile over finite terrain must succeed.");

  // Directly behind the ridge and far below its crest.
  assert(
    culler.isOccluded(0, 0, 400, 2) === true,
    "Ground-level content directly behind a tall ridge must be rejected.",
  );

  // Same spot, but tall enough to clear the ridge line.
  assert(
    culler.isOccluded(0, 400, 400, 2) === false,
    "Content whose top clears the ridge must be drawn.",
  );

  // In front of the ridge: nothing can occlude it.
  assert(
    culler.isOccluded(0, 0, 90, 2) === false,
    "Content nearer than the ridge must never be rejected by it.",
  );

  // Off to the side, where the flat ground provides no horizon at all.
  assert(
    culler.isOccluded(400, 0, 0, 2) === false,
    "Flat terrain must not occlude anything; a sector with no ridge rejects nothing.",
  );

  // Near field is exempt regardless of geometry.
  assert(
    culler.isOccluded(0, -50, 30, 1) === false,
    "Content inside minOccludeDistance must never be rejected.",
  );

  // A bound wide enough to straddle the ridge's azimuth edge must be drawn,
  // because part of its angular extent looks past the occluder. The ridge ends
  // at x = 400, z = 120, i.e. azimuth atan2(120, 400) ~= 0.29 rad, so a sphere
  // centred on that bearing at 800 m spans sectors the ridge never covers.
  const edgeAzimuth = Math.atan2(RIDGE_DISTANCE, 400);
  assert(
    culler.isOccluded(
      Math.cos(edgeAzimuth) * 800,
      0,
      Math.sin(edgeAzimuth) * 800,
      120,
    ) === false,
    "A bound spanning past the ridge edge must be drawn; wide bounds take the most permissive sector.",
  );

  // Non-finite camera input must disarm the culler rather than produce NaN
  // comparisons that silently read as "not occluded" forever.
  const broken = new TerrainHorizonCuller(DEFAULT_TERRAIN_HORIZON_OPTIONS);
  broken.build(Number.NaN, 2, 0, ridgeTerrain);
  assert(
    broken.isReady() === false && broken.isOccluded(0, 0, 400, 2) === false,
    "A non-finite camera position must leave the culler unbuilt and rejecting nothing.",
  );

  // Non-finite terrain samples must be skipped, not folded into the horizon.
  const holed = new TerrainHorizonCuller(DEFAULT_TERRAIN_HORIZON_OPTIONS);
  holed.build(0, 2, 0, (x, z) => (z > 200 ? Number.NaN : ridgeTerrain(x, z)));
  assert(
    holed.isOccluded(0, 0, 400, 2) === true,
    "Non-finite height samples must be ignored without destroying the profile.",
  );

  console.log(
    `[terrain-horizon] Conservative rejection verified: ${DEFAULT_TERRAIN_HORIZON_OPTIONS.sectorCount} sectors, ` +
      `${DEFAULT_TERRAIN_HORIZON_OPTIONS.maxDistance} m reach, ` +
      `${DEFAULT_TERRAIN_HORIZON_OPTIONS.elevationMargin} rad margin; ridge occludes behind, never in front, across, or above.`,
  );
} finally {
  await server.close();
}
