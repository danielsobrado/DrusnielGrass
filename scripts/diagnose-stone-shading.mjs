import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({
  configFile: false, root: ROOT, appType: "custom", logLevel: "silent",
  server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true },
});
try {
  const quality = await server.ssrLoadModule("/src/world/stones/StoneShapeQuality.ts");
  const geom = await server.ssrLoadModule("/src/world/stones/StoneGeometry.ts");
  const archetype = process.argv[2] ?? "boulder";
  const seeds = Number(process.argv[3] ?? 24);
  const BINS = 10;
  const names = [
    "tone",
    "wear",
    "bounce",
    "mineral",
    "weathering",
    "cavity",
    "moss",
    "normalY",
  ];
  const sums = names.map(() => new Float64Array(BINS));
  const counts = new Float64Array(BINS);

  for (let s = 1; s <= seeds; s += 1) {
    const recipe = quality.resolveQualityStoneRecipe(archetype, s * 7919);
    const m = geom.generateStoneMesh(recipe, true);
    const h = Math.max(1e-6, m.metrics.height);
    for (let v = 0; v < m.tones.length; v += 1) {
      const y = m.positions[v * 3 + 1];
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor((y / h) * BINS)));
      counts[bin] += 1;
      sums[0][bin] += m.tones[v];
      sums[1][bin] += m.wears[v];
      sums[2][bin] += m.bounces[v];
      sums[3][bin] += m.minerals[v];
      sums[4][bin] += m.weatherings[v];
      sums[5][bin] += m.cavities[v];
      sums[6][bin] += m.mosses[v];
      sums[7][bin] += m.normals[v * 3 + 1];
    }
  }
  console.log(`[${archetype}] channel means by height band, ${seeds} seeds`);
  console.log("  band   " + names.map((n) => n.padStart(11)).join(""));
  for (let b = BINS - 1; b >= 0; b -= 1) {
    if (!counts[b]) continue;
    const row = names
      .map((_, i) => (sums[i][b] / counts[b]).toFixed(3).padStart(11))
      .join("");
    console.log(`  ${(b / BINS).toFixed(1)}-${((b + 1) / BINS).toFixed(1)}` + row);
  }
} finally {
  await server.close();
}
