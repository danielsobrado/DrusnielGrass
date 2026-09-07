import type { Node } from "three/webgpu";
import { Fn, float, int, uint, vec2, mix, min } from "three/tsl";
import { LOD_BAND_JITTER_MAX_METRES, LOD_BAND_JITTER_PERIOD, LOD_BAND_JITTER_SEED } from "../GrassLodBanding";
import { GRASS_CLUMP_CENTER_JITTER, GRASS_CLUMP_CENTER_X_SALT, GRASS_CLUMP_CENTER_Z_SALT } from "../../world/grass/GrassClumpLattice";

/** Keep uint arithmetic: float hashes would move ecology and LOD boundaries. */
export const grassLatticeHashNode = Fn(([x, z, seed]: [Node<"int">, Node<"int">, Node<"uint">]) => {
  const value = uint(x).mul(uint(374761393)).bitXor(uint(z).mul(uint(668265263))).bitXor(seed).toVar();
  value.assign(value.bitXor(value.shiftRight(uint(13))).mul(uint(1274126177)));
  return value.bitXor(value.shiftRight(uint(16)));
});

export const grassHash01Node = Fn(([x, z, seed]: [Node<"int">, Node<"int">, Node<"uint">]) =>
  float(grassLatticeHashNode(x, z, seed)).div(4294967296));

export const grassValueNoiseNode = Fn(([position, seed]: [Node<"vec2">, Node<"uint">]) => {
  const cell = position.floor();
  const fraction = position.sub(cell);
  const weight = fraction.mul(fraction).mul(fraction.mul(-2).add(3));
  const x = int(cell.x), z = int(cell.y);
  return mix(mix(grassHash01Node(x, z, seed), grassHash01Node(x.add(1), z, seed), weight.x),
    mix(grassHash01Node(x, z.add(1), seed), grassHash01Node(x.add(1), z.add(1), seed), weight.x), weight.y);
});

export const grassPatchNoiseNode = Fn(([world, period, seed]: [Node<"vec2">, Node<"float">, Node<"uint">]) =>
  grassValueNoiseNode(world.div(period), seed)
    .add(grassValueNoiseNode(world.mul(2.7).div(period), seed.bitXor(uint(0x9e3779b9))).mul(0.5)).div(1.5));

export const grassLodBandOffsetNode = Fn(([world]: [Node<"vec2">]) =>
  grassPatchNoiseNode(world, float(LOD_BAND_JITTER_PERIOD), uint(LOD_BAND_JITTER_SEED)).sub(0.5));

export const grassLodBandJitterMetresNode = Fn(([start, end, ratio]: [Node<"float">, Node<"float">, Node<"float">]) =>
  min(end.sub(start).mul(ratio), LOD_BAND_JITTER_MAX_METRES));

export const grassClumpHashNode = Fn(([x, z, seed]: [Node<"int">, Node<"int">, Node<"uint">]) => {
  const value = uint(x).mul(uint(374761393)).add(uint(z).mul(uint(668265263))).add(seed).toVar();
  value.assign(value.bitXor(value.shiftRight(uint(13))).mul(uint(1274126177)));
  return value.bitXor(value.shiftRight(uint(16)));
});

export const grassClumpCenterNode = Fn(([clumpUv, seed]: [Node<"vec2">, Node<"uint">]) => {
  const cell = clumpUv.floor();
  const x = int(cell.x), z = int(cell.y);
  const jitterX = float(grassClumpHashNode(x, z, seed.bitXor(uint(GRASS_CLUMP_CENTER_X_SALT)))).div(4294967296);
  const jitterZ = float(grassClumpHashNode(x, z, seed.bitXor(uint(GRASS_CLUMP_CENTER_Z_SALT)))).div(4294967296);
  return cell.add(vec2(jitterX, jitterZ).sub(0.5).mul(GRASS_CLUMP_CENTER_JITTER * 2).add(0.5));
});
