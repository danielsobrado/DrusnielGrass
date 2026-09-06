import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const fail = (message) => { throw new Error(`[meadow-topology] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const SIZE = 256;
const STEP = 2;

const server = await createServer({
  configFile: false,
  root: ROOT,
  appType: "custom",
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true },
});

function coherence(values) {
  let gxx = 0;
  let gzz = 0;
  let gxz = 0;
  for (let z = 1; z < SIZE - 1; z += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const gx = values[z * SIZE + x + 1] - values[z * SIZE + x - 1];
      const gz = values[(z + 1) * SIZE + x] - values[(z - 1) * SIZE + x];
      gxx += gx * gx;
      gzz += gz * gz;
      gxz += gx * gz;
    }
  }
  const energy = gxx + gzz;
  return energy > 0
    ? Math.sqrt((gxx - gzz) ** 2 + 4 * gxz ** 2) / energy
    : 0;
}

function componentStats(values) {
  const seen = new Uint8Array(values.length);
  const aspects = [];
  const areas = [];
  const queue = new Int32Array(values.length);
  for (let start = 0; start < values.length; start += 1) {
    if (seen[start] || values[start] >= 0.5) continue;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    seen[start] = 1;
    let minX = start % SIZE;
    let maxX = minX;
    let minZ = Math.floor(start / SIZE);
    let maxZ = minZ;
    while (head < tail) {
      const index = queue[head++];
      const x = index % SIZE;
      const z = Math.floor(index / SIZE);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      for (const next of [index - 1, index + 1, index - SIZE, index + SIZE]) {
        if (next < 0 || next >= values.length || seen[next] || values[next] >= 0.5) continue;
        const nx = next % SIZE;
        const nz = Math.floor(next / SIZE);
        if (Math.abs(nx - x) + Math.abs(nz - z) !== 1) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (tail >= 4) {
      const width = (maxX - minX + 1) * STEP;
      const depth = (maxZ - minZ + 1) * STEP;
      aspects.push(Math.max(width, depth) / Math.max(STEP, Math.min(width, depth)));
      areas.push(tail * STEP * STEP);
    }
  }
  aspects.sort((a, b) => a - b);
  areas.sort((a, b) => a - b);
  const percentile = (values, p) => values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
  return { count: areas.length, medianArea: percentile(areas, 0.5), p95Aspect: percentile(aspects, 0.95) };
}

try {
  const { WorldConfigLoader } = await server.ssrLoadModule("/src/world/WorldConfigLoader.ts");
  const { TerrainField } = await server.ssrLoadModule("/src/world/TerrainField.ts");
  const { GRASS_BIOME_PROFILES } = await server.ssrLoadModule("/src/grass/biome/GrassBiomeProfile.ts");
  const { createGrassBiomeSample, resolveGrassBiomeDensity, sampleGrassBiome } =
    await server.ssrLoadModule("/src/world/grass/WorldBiomeField.ts");
  const { createCommunitySample, sampleWorldCommunity } =
    await server.ssrLoadModule("/src/world/ecology/WorldCommunityField.ts");
  const { createCommunityResponse, resolveCommunityResponse } =
    await server.ssrLoadModule("/src/world/ecology/WorldCommunityResponse.ts");
  const { createGrassHabitatSample, sampleGrassHabitat } =
    await server.ssrLoadModule("/src/world/grass/GrassHabitatField.ts");

  const config = new WorldConfigLoader().parse(read("public/config/world.yaml"));
  const field = new TerrainField(config);
  const biome = createGrassBiomeSample();
  const community = createCommunitySample();
  const response = createCommunityResponse();
  const habitat = createGrassHabitatSample();

  const sampleGrid = (worldConfig) => {
    const density = new Float32Array(SIZE * SIZE);
    const core = new Float32Array(SIZE * SIZE);
    const occupied = new Float32Array(SIZE * SIZE);
    const half = SIZE * STEP * 0.5;
    let open = 0;
    for (let iz = 0; iz < SIZE; iz += 1) {
      for (let ix = 0; ix < SIZE; ix += 1) {
        const x = -half + (ix + 0.5) * STEP;
        const z = -half + (iz + 0.5) * STEP;
        const height = field.sampleHeight(x, z);
        const ecology = field.sampleEcologyAt(x, z, height);
        sampleWorldCommunity(x, z, ecology, worldConfig, community);
        resolveCommunityResponse(community, worldConfig, response);
        const biomeSample = sampleGrassBiome(x, z, biome);
        const a = GRASS_BIOME_PROFILES[biomeSample.indexA];
        const b = GRASS_BIOME_PROFILES[biomeSample.indexB];
        const mix = (left, right) => left + (right - left) * biomeSample.blend;
        sampleGrassHabitat(
          x, z, ecology, resolveGrassBiomeDensity(biomeSample),
          mix(a.minimumClimateDensityRetention, b.minimumClimateDensityRetention),
          mix(a.heightBand[0], b.heightBand[0]),
          mix(a.heightBand[1], b.heightBand[1]),
          mix(a.drynessBias, b.drynessBias),
          mix(a.accentDensity, b.accentDensity),
          response, worldConfig, habitat,
        );
        const index = iz * SIZE + ix;
        density[index] = habitat.density;
        core[index] = community.core;
        occupied[index] = 1 - habitat.openness;
        if (habitat.openness > 0.5) open += 1;
      }
    }
    return {
      densityCoherence: coherence(density),
      coreCoherence: coherence(core),
      openShare: open / density.length,
      components: componentStats(occupied),
    };
  };

  const baseline = sampleGrid({ ...config, grassCommunityWarpDistance: 0 });
  const warped = sampleGrid(config);
  assert(warped.densityCoherence <= baseline.densityCoherence * 1.05,
    `Warp increased density coherence from ${baseline.densityCoherence.toFixed(3)} to ${warped.densityCoherence.toFixed(3)}.`);
  assert(warped.coreCoherence < 0.35,
    `Community core coherence ${warped.coreCoherence.toFixed(3)} is strongly directional.`);
  assert(warped.openShare > 0.08 && warped.openShare < 0.32,
    `Open-ground share ${(warped.openShare * 100).toFixed(1)}% is outside [8%, 32%].`);
  assert(warped.components.count >= 8 && warped.components.medianArea >= 16,
    "Low-density topology lost its hierarchy of connected components.");

  console.log(
    `[meadow-topology] density coherence ${baseline.densityCoherence.toFixed(3)} -> ${warped.densityCoherence.toFixed(3)} · core ${warped.coreCoherence.toFixed(3)} · open ${(warped.openShare * 100).toFixed(1)}% · ${warped.components.count} components · median ${warped.components.medianArea.toFixed(0)} m² · p95 aspect ${warped.components.p95Aspect.toFixed(2)}`,
  );
} finally {
  await server.close();
}
