import type { Node } from "three/webgpu";
import { If, cross, dFdx, dFdy, float, mat2, max, smoothstep, vec2, vec3, vec4 } from "three/tsl";
import { grassLodBandJitterMetresNode, grassLodBandOffsetNode, grassPatchNoiseNode } from "../../grass/materials/GrassFieldNodes";
import { TERRAIN_SURFACE_NOISE_SIZE } from "./TerrainSurfaceNoiseTexture";
import type { TerrainNodeUniforms } from "./TerrainNodeInputs";

/** Call inside the surface Fn, before any non-uniform branches. */
export function terrainDetailNodes(u: TerrainNodeUniforms, world: Node<"vec3">, distance: Node<"float">) {
  const face = cross(dFdx(world), dFdy(world)).toVar();
  const faceLength = face.length().toVar();
  If(faceLength.greaterThan(1e-8), () => { face.divAssign(faceLength); })
    .Else(() => { face.assign(vec3(0, 1, 0)); });
  If(face.y.lessThan(0), () => { face.assign(face.negate()); });
  const slope = face.y.clamp(0, 1).oneMinus().toVar();
  const cliff = smoothstep(0.38, 0.66, slope).toVar();
  const tangent = vec2(face.z.negate(), face.x).add(1e-5).normalize();
  const wallUv = vec2(world.xz.dot(tangent), world.y).mul(0.037).toVar();
  const wallDdx = dFdx(wallUv).toVar(), wallDdy = dFdy(wallUv).toVar();
  wallDdx.append(); wallDdy.append();
  const bandOffset = grassLodBandOffsetNode(world.xz).toVar();
  const fade = (name: string) => {
    const range = u.vector2(name);
    return smoothstep(range.x, range.y, distance.add(
      grassLodBandJitterMetresNode(range.x, range.y, u.number("uTerrainBandJitterRatio")).mul(bandOffset)));
  };
  const microWeight = fade("uTerrainMicroRange").oneMinus().toVar();
  const mesoWeight = fade("uTerrainMesoRange").oneMinus().toVar();
  const farMerge = fade("uTerrainCanopyMergeRange").toVar();
  const baseUv = world.xz.div(u.number("uTerrainNoiseWorldSize")).toVar();
  const baseDdx = dFdx(baseUv).toVar(), baseDdy = dFdy(baseUv).toVar();
  baseDdx.append(); baseDdy.append();
  const noise = u.texture("uTerrainSurfaceNoise");
  const baseNoise = noise.sample(baseUv).grad(baseDdx, baseDdy).toVar();
  const mesoNoise = vec4(0.5).toVar();
  If(mesoWeight.greaterThan(0.001), () => {
    // Vector columns avoid TSL's numeric Matrix2 constructor's row order.
    const rotation = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8));
    mesoNoise.assign(noise.sample(rotation.mul(baseUv).mul(2.17).add(vec2(0.317, 0.619)))
      .grad(rotation.mul(baseDdx).mul(2.17), rotation.mul(baseDdy).mul(2.17)));
  });
  const microNoise = vec4(0.5).toVar();
  If(microWeight.greaterThan(0.001), () => {
    const rotation = mat2(vec2(0.94, -0.342), vec2(0.342, 0.94));
    const scale = vec2(8.6, 5.4);
    const dx = rotation.mul(baseDdx).mul(scale), dy = rotation.mul(baseDdy).mul(scale);
    const footprint = max(dx.mul(TERRAIN_SURFACE_NOISE_SIZE).length(), dy.mul(TERRAIN_SURFACE_NOISE_SIZE).length());
    microWeight.mulAssign(smoothstep(0.7, 2.1, footprint).oneMinus());
    microNoise.assign(noise.sample(rotation.mul(baseUv).mul(scale).add(vec2(0.731, 0.143))).grad(dx, dy));
  });
  const fleck = grassPatchNoiseNode(world.xz, u.number("uTerrainFleckPeriod"), u.uint("uTerrainFleckSeed")).sub(float(0.5)).toVar();
  return { face, slope, cliff, wallUv, wallDdx, wallDdy, microWeight, mesoWeight, farMerge, baseNoise, mesoNoise, microNoise, fleck };
}

export type TerrainDetailNodes = ReturnType<typeof terrainDetailNodes>;
