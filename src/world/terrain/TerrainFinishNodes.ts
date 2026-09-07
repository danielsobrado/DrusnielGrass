import type { Node } from "three/webgpu";
import { If, float, max, mix, smoothstep, vec2, vec3 } from "three/tsl";
import { grassClumpCenterNode } from "../../grass/materials/GrassFieldNodes";
import type { TerrainNodeAttributes, TerrainNodeUniforms } from "./TerrainNodeInputs";
import type { TerrainDetailNodes } from "./TerrainDetailNodes";
import type { TerrainEcologyNodes } from "./TerrainEcologyNodes";
import { TERRAIN_DRY_FIBRE_PULSE_MEAN, TERRAIN_GRIT_PULSE_MEAN } from "./TerrainSurfaceNoiseTexture";
import { terrainResolveBedNode, terrainResolveRockNode } from "./TerrainRockNodes";

export function terrainFinishNodes(u: TerrainNodeUniforms, a: TerrainNodeAttributes, d: TerrainDetailNodes, e: TerrainEcologyNodes,
  world: Node<"vec3">, color: Node<"vec3">, coverage: Node<"float">) {
  // Match the precision of the constants embedded in the original shader.
  const fibreMean = Number(TERRAIN_DRY_FIBRE_PULSE_MEAN.toFixed(4));
  const gritMean = Number(TERRAIN_GRIT_PULSE_MEAN.toFixed(4));
  const fibre = smoothstep(0.68, 0.9, d.microNoise.a).sub(fibreMean).mul(d.microWeight).add(fibreMean)
    .mul(e.dryness).mul(coverage).mul(e.water.mul(0.82).oneMinus());
  color.assign(mix(color, a.dry.mul(0.68), fibre.mul(0.34)));
  color.mulAssign(d.fleck.mul(u.number("uTerrainFleckStrength")).mul(d.microWeight).add(1));
  color.mulAssign(d.microNoise.b.sub(0.5).mul(u.number("uTerrainMicroStrength")).mul(d.microWeight).add(1));
  color.mulAssign(u.number("uTerrainCanopyDarkening").mul(coverage).mul(e.vigor).oneMinus());
  const moss = e.humidity.mul(1.25).sub(0.42).clamp(0, 1).mul(d.slope.mul(2.2).oneMinus().clamp(0, 1))
    .mul(smoothstep(-0.08, 0.28, d.fleck)).mul(e.concavity.mul(0.65).add(0.35));
  color.assign(mix(color, u.color("uTerrainMoss"), moss.clamp(0, 1).mul(u.number("uTerrainMossStrength"))));
  color.mulAssign(u.number("uTerrainHollowDarkening").mul(e.concavity).oneMinus());
  const clumpUv = world.xz.div(u.vector2("uTerrainClumpSpan"));
  const clumpDistance = clumpUv.sub(grassClumpCenterNode(clumpUv, u.uint("uTerrainClumpSeed"))).length().toVar();
  const clumpShade = smoothstep(0.16, 0.52, clumpDistance).oneMinus();
  color.mulAssign(u.number("uTerrainClumpAo").mul(clumpShade).mul(coverage).mul(d.microWeight).oneMinus());
  const litter = smoothstep(0.30, 0.50, clumpDistance).mul(smoothstep(0.50, 0.72, clumpDistance).oneMinus());
  color.assign(mix(color, mix(u.color("uTerrainMoss"), a.dry.mul(0.6), e.dryness),
    litter.mul(coverage).mul(d.microWeight).mul(u.number("uTerrainClumpLitter"))));
  const shoreBand = smoothstep(0.94, 1, e.water).toVar();
  const exposure = shoreBand.mul(coverage.mul(0.75).oneMinus()).mul(d.cliff.oneMinus());
  const patch = d.baseNoise.r.sub(0.5).mul(0.90).add(d.mesoNoise.g.sub(0.5).mul(0.65)).add(0.55).clamp(0, 1);
  color.assign(mix(color, u.color("uTerrainSoilRich").mul(0.82), exposure.mul(smoothstep(0.46, 0.63, patch).oneMinus())));
  color.assign(mix(color, u.color("uTerrainPathGrit"), exposure.mul(smoothstep(0.68, 0.84, patch))));
  const ecologyMask = smoothstep(0.025, 0.34, e.suitability).toVar();
  color.assign(mix(a.color, color, ecologyMask));
  const grain = d.baseNoise.r.sub(0.5).mul(0.75).add(d.mesoNoise.g.sub(0.5).mul(0.9).mul(d.mesoWeight))
    .add(d.microNoise.b.sub(0.5).mul(0.45).mul(d.microWeight)).add(0.5).clamp(0, 1);
  const path = mix(u.color("uTerrainPathSoil"), u.color("uTerrainPathDust"), grain).toVar();
  path.mulAssign(u.number("uTerrainPathCoreDarkening").mul(smoothstep(0.15, 1, e.pathCore)).oneMinus());
  const grit = smoothstep(0.64, 0.86, d.microNoise.b).sub(gritMean).mul(d.microWeight).add(gritMean);
  path.assign(mix(path, u.color("uTerrainPathGrit"), grit.mul(0.24)));
  const pathCoverage = e.pathCore.add(e.pathShoulder.mul(0.82)).clamp(0, 1).toVar();
  color.assign(mix(color, path, pathCoverage));
  const rockRelief = float(0).toVar();
  If(d.cliff.greaterThan(0.001), () => {
    const noise = u.texture("uTerrainSurfaceNoise");
    const wallNoise = noise.sample(d.wallUv.add(vec2(0.19, 0.63))).grad(d.wallDdx, d.wallDdy);
    const warp = d.baseNoise.r.sub(0.5).mul(1.4);
    const bed = terrainResolveBedNode(world.y, warp);
    const hash = noise.sample(vec2(bed.x.mul(0.137).add(0.41), 0.317)).grad(vec2(0), vec2(0));
    const rock = terrainResolveRockNode(d.wallUv, world.y, warp, wallNoise, hash, e.water,
      vec3(u.color("uTerrainRockBase")), vec3(u.color("uTerrainRockWarm")), u.number("uTerrainRockReliefStrength")).toVar();
    color.assign(mix(color, rock.rgb, d.cliff));
    rockRelief.assign(rock.a);
  });
  const normalMask = max(max(ecologyMask, d.cliff), pathCoverage);
  const height = d.microNoise.b.sub(0.5).mul(0.58).add(d.microNoise.a.sub(0.5).mul(0.24)).add(d.fleck.mul(0.18))
    .mul(mix(1, 0.58, e.water)).mul(d.microWeight).add(rockRelief.mul(d.cliff));
  const wetBand = shoreBand.mul(coverage.mul(0.7).oneMinus());
  return { normalMask, height, wetBand };
}
