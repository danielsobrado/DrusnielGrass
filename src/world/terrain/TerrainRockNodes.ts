import type { Node } from "three/webgpu";
import { Fn, vec2, vec4, max, mix, smoothstep } from "three/tsl";

export const terrainResolveBedNode = Fn(([height, warp]: [Node<"float">, Node<"float">]) => {
  const coordinate = height.mul(0.135).add(warp.mul(0.42));
  return vec2(coordinate.floor(), coordinate.fract());
});

export const terrainResolveJointNode = Fn(([along, seed, frequency, sharpness]: [Node<"float">, Node<"float">, Node<"float">, Node<"float">]) =>
  along.mul(frequency).add(seed.mul(3)).fract().mul(2).sub(1).abs().oneMinus().clamp(0, 1).pow(sharpness));

/** RGB rock color and A relief replace the old out-float parameter. */
export const terrainResolveRockNode = Fn(([wallUv, worldHeight, bedWarp, wallNoise, hashNoise, wetness, base, warm, strength]:
  [Node<"vec2">, Node<"float">, Node<"float">, Node<"vec4">, Node<"vec4">, Node<"float">, Node<"vec3">, Node<"vec3">, Node<"float">]) => {
  const bed = terrainResolveBedNode(worldHeight, bedWarp);
  const tone = hashNoise.r;
  const parting = smoothstep(0, 0.05, bed.y).mul(smoothstep(0.93, 1, bed.y).oneMinus());
  const primary = terrainResolveJointNode(wallUv.x, hashNoise.g, 1.49, 12);
  const secondary = terrainResolveJointNode(wallUv.x, hashNoise.b, 6.49, 7).mul(0.45);
  const joint = max(primary, secondary);
  const lithology = tone.mul(0.7).add(wallNoise.b.mul(0.2)).add(wallNoise.r.mul(0.1));
  const rock = mix(base, warm, tone).mul(mix(0.74, 1.16, lithology)).mul(primary.mul(0.08).add(1)).toVar();
  const cavity = max(joint.mul(0.8), parting.oneMinus().mul(0.5));
  rock.mulAssign(cavity.mul(0.42).oneMinus());
  const streak = smoothstep(0.45, 0.82, wallNoise.g);
  const wet = wetness.mul(mix(0.3, 1, streak)).mul(mix(0.75, 1, cavity.oneMinus()));
  rock.mulAssign(wet.mul(0.3).oneMinus());
  const relief = wallNoise.b.sub(0.5).mul(0.55).sub(joint.mul(0.75)).sub(parting.oneMinus().mul(0.45)).mul(strength);
  return vec4(rock, relief);
});
