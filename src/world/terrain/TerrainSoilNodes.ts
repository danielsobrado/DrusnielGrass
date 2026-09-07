import type { Node } from "three/webgpu";
import { mix, smoothstep } from "three/tsl";
import { grassPatchNoiseNode } from "../../grass/materials/GrassFieldNodes";
import type { TerrainNodeAttributes, TerrainNodeUniforms } from "./TerrainNodeInputs";
import type { TerrainDetailNodes } from "./TerrainDetailNodes";
import type { TerrainEcologyNodes } from "./TerrainEcologyNodes";

export function terrainSoilNodes(u: TerrainNodeUniforms, a: TerrainNodeAttributes, d: TerrainDetailNodes, e: TerrainEcologyNodes, world: Node<"vec3">) {
  const macroVariation = d.baseNoise.r.sub(0.5).mul(0.16).toVar();
  const mesoVariation = d.mesoNoise.g.sub(0.5).mul(u.number("uTerrainMesoStrength")).mul(d.mesoWeight).toVar();
  const hue = grassPatchNoiseNode(world.xz, u.number("uTerrainSoilHuePeriod"), u.uint("uTerrainSoilHueSeed")).toVar();
  const rich = smoothstep(0.52, 0.84, hue).mul(e.humidity.mul(0.65).add(0.35));
  const dry = smoothstep(0.48, 0.82, hue.oneMinus()).mul(e.dryness.mul(0.7).add(0.3));
  const greyColor = u.color("uTerrainSoilGrey"), richColor = u.color("uTerrainSoilRich"), dryColor = u.color("uTerrainSoilDry");
  const variant = mix(mix(greyColor, richColor, rich), dryColor, dry);
  const soil = mix(greyColor, richColor, e.humidity.mul(0.7)).toVar();
  soil.assign(mix(soil, dryColor, e.dryness.mul(0.52)));
  soil.assign(mix(soil, variant, u.number("uTerrainSoilHueStrength")));
  soil.mulAssign(mix(1, 0.62, e.water.mul(0.78)));
  soil.mulAssign(macroVariation.mul(0.45).add(mesoVariation).add(1));
  const underlayer = mix(a.base.rgb, a.dry, e.dryness.mul(0.9)).toVar();
  underlayer.assign(mix(underlayer, a.base.rgb.mul(0.72), e.water.mul(0.34)));
  underlayer.mulAssign(e.rootScale);
  underlayer.mulAssign(macroVariation.add(mesoVariation).add(1));
  const coverage = smoothstep(0.08, 0.5, e.suitability).mul(e.biomeDensity).mul(e.pathGrassMask).mul(e.stoneClearance).toVar();
  const amount = coverage.mul(mix(0.34, 0.78, e.vigor)).mul(mix(1, 0.52, e.dryness))
    .mul(u.number("uTerrainGrassTintStrength")).mul(2).clamp(0, 1);
  const color = mix(soil, underlayer, amount).toVar();
  const vergeFleck = smoothstep(0.58, 0.86, d.mesoNoise.r).mul(d.mesoWeight);
  color.assign(mix(color, u.color("uTerrainPathDust"), e.pathShoulder.mul(u.number("uTerrainVergeFleckStrength")).mul(vergeFleck).clamp(0, 1)));
  const thatch = mix(dryColor, a.dry, 0.48).mul(0.7);
  color.assign(mix(color, thatch, coverage.mul(e.dryness.oneMinus()).mul(e.vigor).mul(0.28)));
  const community = a.community.clamp(0, 1), communityStrength = u.number("uTerrainCommunityTintStrength");
  color.assign(mix(color, dryColor, community.x.mul(communityStrength)));
  color.assign(mix(color, u.color("uTerrainMoss"), community.y.mul(communityStrength)));
  color.assign(mix(color, a.dry, community.z.mul(communityStrength).mul(0.6)));
  const canopy = mix(a.canopy, a.dry, e.dryness.mul(0.68)).mul(macroVariation.add(0.78));
  color.assign(mix(color, canopy, d.farMerge.mul(coverage).mul(u.number("uTerrainCanopyMergeStrength"))));
  return { color, coverage };
}
