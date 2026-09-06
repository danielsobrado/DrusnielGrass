import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({
  configFile: false,
  root: ROOT,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  const quality = await server.ssrLoadModule(
    "/src/world/stones/StoneShapeQuality.ts",
  );
  const silhouette = await server.ssrLoadModule(
    "/src/world/stones/StoneSilhouetteQuality.ts",
  );
  const clipper = await server.ssrLoadModule("/src/world/stones/StoneClipper.ts");
  const topology = await server.ssrLoadModule(
    "/src/world/stones/StoneMeshTopology.ts",
  );

  const archetype = process.argv[2] ?? "boulder";
  const count = Number(process.argv[3] ?? 40);

  let faces = 0, planes = 0, chamfers = 0, cuts = 0, sides = 0;
  let top4 = 0, sil = 0, sym = 0, area = 0;
  let bareFaces = 0, bareSil = 0;
  let rawCorners = 0, meaningfulCorners = 0, maxMeaningful = 0;
  const comp = { turnConcentration: 0, longRun: 0, circularity: 0, hullVertices: 0 };
  const roleCounts = new Map();

  for (let seed = 1; seed <= count; seed += 1) {
    const recipe = quality.resolveQualityStoneRecipe(archetype, seed * 7919);
    const planeSet = clipper.buildStoneSurfacePlanes(recipe, true);
    const body = clipper.facesFromPlanes(planeSet);
    // Match generateStoneMesh: shear, then anisotropic scale.
    transformBody(body, recipe);

    const bare = clipper.facesFromPlanes(
      planeSet.filter((plane) => plane.role !== "edge-bevel"),
    );
    transformBody(bare, recipe);
    bareFaces += bare.length;
    bareSil += silhouette.scoreStoneSilhouette(bare);
    planes += planeSet.length;
    for (const p of planeSet) {
      roleCounts.set(p.role, (roleCounts.get(p.role) ?? 0) + 1);
      if (p.role === "chamfer") chamfers += 1;
      if (p.role === "cut") cuts += 1;
      if (p.role === "side") sides += 1;
    }
    faces += body.length;
    sil += silhouette.scoreStoneSilhouette(body);
    sym += silhouette.scoreStoneRotationalSymmetry(body);
    const complexity = silhouette.measureStoneSilhouetteComplexity(body);
    rawCorners += complexity.meanRawCorners;
    meaningfulCorners += complexity.meanMeaningfulCorners;
    maxMeaningful = Math.max(maxMeaningful, complexity.maximumMeaningfulCorners);
    const pts = body.filter((f) => f.role !== "bottom").flatMap((f) => f.points);
    const c = outlineComponents(pts);
    for (const k of Object.keys(comp)) comp[k] += c[k];

    const areas = body
      .map((f) => topology.calculateStonePolygonAreaAndNormal(f)[0])
      .sort((a, b) => b - a);
    const total = areas.reduce((a, b) => a + b, 0);
    area += total;
    top4 += areas.slice(0, 4).reduce((a, b) => a + b, 0) / total;
  }

  const n = count;
  console.log(`[${archetype}] over ${n} quality-selected seeds`);
  console.log(`  planes/body      ${(planes / n).toFixed(1)}`);
  console.log(`  faces/body       ${(faces / n).toFixed(1)}`);
  console.log(`  top-4 area share ${(top4 / n * 100).toFixed(1)}%`);
  console.log(`  silhouette       ${(sil / n).toFixed(3)}`);
  console.log(`  rot. symmetry    ${(sym / n).toFixed(3)}`);
  console.log(`  turn concentration ${(comp.turnConcentration / n).toFixed(3)} x0.9 = ${(comp.turnConcentration / n * 0.9).toFixed(3)}`);
  console.log(`  long-edge run      ${(comp.longRun / n).toFixed(3)} x0.7 = ${(comp.longRun / n * 0.7).toFixed(3)}`);
  console.log(`  circularity        ${(comp.circularity / n).toFixed(3)} x0.9 = -${(comp.circularity / n * 0.9).toFixed(3)}`);
  console.log(`  raw hull corners   ${(rawCorners / n).toFixed(1)}`);
  console.log(`  meaningful corners ${(meaningfulCorners / n).toFixed(1)} avg · ${maxMeaningful} max`);
  console.log(`  -- without edge bevels --`);
  console.log(`  faces/body       ${(bareFaces / n).toFixed(1)}`);
  console.log(`  silhouette       ${(bareSil / n).toFixed(3)}`);
  const roles = [...roleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `${r} ${(c / n).toFixed(1)}`)
    .join(", ");
  console.log(`  planes by role   ${roles}`);
} finally {
  await server.close();
}

function transformBody(body, recipe) {
  const seen = new Set();
  for (const poly of body) {
    for (const q of poly.points) {
      if (seen.has(q)) continue;
      seen.add(q);
      const sx = q.x + recipe.leanX * q.y;
      const sz = q.z + recipe.leanZ * q.y;
      q.x = recipe.width * sx;
      q.y = recipe.height * q.y;
      q.z = recipe.depth * sz;
    }
  }
}

// Component breakdown of scoreOutline, replicated so the three score terms can
// be inspected separately from the canonical complexity measurement above.
export function outlineComponents(points, pitches = [0.31, 0.52], azimuths = 8) {
  let turnC = 0, longR = 0, circ = 0, verts = 0, views = 0;
  for (const pitch of pitches) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (let step = 0; step < azimuths; step += 1) {
      const az = (step / azimuths) * Math.PI * 2;
      const ca = Math.cos(az), sa = Math.sin(az);
      const proj = points.map((q) => ({
        x: q.x * -sa + q.z * ca,
        y: q.x * (-sp * ca) + q.y * cp + q.z * (-sp * sa),
      }));
      const hull = convexHull2(proj);
      if (hull.length < 3) continue;
      const edges = [], turns = [];
      let per = 0, area2 = 0;
      for (let i = 0; i < hull.length; i += 1) {
        const c = hull[i], nx = hull[(i + 1) % hull.length];
        const pv = hull[(i + hull.length - 1) % hull.length];
        const len = Math.hypot(nx.x - c.x, nx.y - c.y);
        edges.push(len); per += len;
        area2 += c.x * nx.y - nx.x * c.y;
        const ix = c.x - pv.x, iy = c.y - pv.y;
        const ox = nx.x - c.x, oy = nx.y - c.y;
        turns.push(Math.abs(Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy)));
      }
      turns.sort((a, b) => b - a);
      edges.sort((a, b) => b - a);
      turnC += turns.slice(0, 4).reduce((a, b) => a + b, 0) / (Math.PI * 2);
      longR += edges.slice(0, 3).reduce((a, b) => a + b, 0) / per;
      circ += (4 * Math.PI * (Math.abs(area2) * 0.5)) / (per * per);
      verts += hull.length;
      views += 1;
    }
  }
  return {
    turnConcentration: turnC / views,
    longRun: longR / views,
    circularity: circ / views,
    hullVertices: verts / views,
  };
}

function convexHull2(pts) {
  if (pts.length < 3) return [...pts];
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const build = (src) => {
    const ch = [];
    for (const p of src) {
      while (ch.length >= 2) {
        const a = ch[ch.length - 2], b = ch[ch.length - 1];
        if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 1e-9) break;
        ch.pop();
      }
      ch.push(p);
    }
    ch.pop();
    return ch;
  };
  return [...build(s), ...build([...s].reverse())];
}
