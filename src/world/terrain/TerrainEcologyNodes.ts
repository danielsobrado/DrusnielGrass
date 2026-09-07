import type { Node } from "three/webgpu";
import { float, max, min, mix, smoothstep, uint, vec2 } from "three/tsl";
import { DRYNESS_PERIOD, DRYNESS_SEED, GRASS_MACRO_DRYNESS_STRENGTH, PATH_EDGE_PERIOD, PATH_EDGE_SEED, VIGOR_PERIOD, VIGOR_SEED } from "../../grass/GrassFieldVariation";
import { grassPatchNoiseNode } from "../../grass/materials/GrassFieldNodes";
import type { TerrainNodeAttributes, TerrainNodeUniforms } from "./TerrainNodeInputs";
import { TERRAIN_HUMIDITY_DRYNESS_WEIGHT, TERRAIN_HUMIDITY_VIGOR_WEIGHT } from "./TerrainSurfaceTuning";

/** Preserves the CPU grass/path field identities, including compact's baked macro field. */
export function terrainEcologyNodes(u: TerrainNodeUniforms, a: TerrainNodeAttributes, world: Node<"vec3">, compact: boolean) {
  const suitability = a.ecology.x.clamp(0, 1);
  const vertexVigor = a.ecology.y.clamp(0, 1);
  const vertexDryness = a.ecology.z.clamp(0, 1);
  const biomeDensity = a.ecology.w.clamp(0, 1);
  const altitude = a.environment.x.clamp(0, 1);
  const water = a.environment.z.clamp(0, 1);
  const stoneClearance = a.environment.w.clamp(0, 1);
  const rootScale = a.base.a.clamp(0, 1);
  const macro = (compact
    ? u.texture("uTerrainMacroField").sample(world.xz.div(u.vector2("uTerrainMacroFieldExtent")).add(0.5)).rg
    : vec2(grassPatchNoiseNode(world.xz, float(DRYNESS_PERIOD), uint(DRYNESS_SEED)),
      grassPatchNoiseNode(world.xz, float(VIGOR_PERIOD), uint(VIGOR_SEED)))).toVar();
  const vigor = macro.y;
  const dryness = vertexDryness.add(macro.x.sub(a.macroDryness).mul(GRASS_MACRO_DRYNESS_STRENGTH)).clamp(0, 1).toVar();
  const humidity = a.environment.y.clamp(0, 1)
    .add(vertexDryness.sub(dryness).mul(TERRAIN_HUMIDITY_DRYNESS_WEIGHT))
    .add(vigor.sub(vertexVigor).mul(TERRAIN_HUMIDITY_VIGOR_WEIGHT)).clamp(0, 1).toVar();
  const edgeNoise = grassPatchNoiseNode(world.xz, float(PATH_EDGE_PERIOD), uint(PATH_EDGE_SEED)).sub(0.5).toVar();
  const halfWidth = u.vector2("uTerrainPathHalfWidth");
  const grassHalfWidth = halfWidth.add(u.number("uTerrainPathEdge")).add(u.number("uTerrainPathClearance"));
  const grassBands = smoothstep(grassHalfWidth, grassHalfWidth.add(u.number("uTerrainPathGrassFeather")),
    a.path.xy.abs().add(u.number("uTerrainPathGrassEdge").mul(edgeNoise)));
  const visibility = a.path.z.clamp(0, 1);
  const pathGrassMask = mix(1, min(grassBands.x, grassBands.y), visibility).toVar();
  const pathExposure = pathGrassMask.oneMinus().toVar();
  const coreDistance = a.path.xy.abs().add(u.number("uTerrainPathEdge").mul(edgeNoise));
  const coreBands = smoothstep(max(vec2(0), halfWidth.sub(0.12)), halfWidth.add(0.28), coreDistance).oneMinus();
  const pathCore = max(coreBands.x, coreBands.y).mul(visibility).toVar();
  const pathShoulder = max(0, pathExposure.sub(pathCore)).toVar();
  dryness.assign(dryness.mul(water.mul(0.58).oneMinus())
    .add(pathShoulder.mul(u.number("uTerrainPathVergeDryness")))
    .add(smoothstep(0.72, 1, altitude).mul(0.08)).clamp(0, 1));
  humidity.assign(humidity.sub(pathExposure.mul(0.18)).clamp(0, 1));
  const concavity = float(0.5).sub(a.path.w).mul(2).clamp(0, 1).toVar();
  humidity.assign(humidity.add(concavity.mul(u.number("uTerrainHollowMoisture"))).clamp(0, 1));
  return { suitability, vigor, dryness, biomeDensity, altitude, humidity, water, stoneClearance, rootScale,
    edgeNoise, pathGrassMask, pathExposure, pathCore, pathShoulder, concavity };
}

export type TerrainEcologyNodes = ReturnType<typeof terrainEcologyNodes>;
