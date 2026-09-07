import { Vector2, type Node } from "three/webgpu";
import { Fn, float, vec2, vec3, uniform, mix, smoothstep, max } from "three/tsl";
import type { RuntimeCloudConfig } from "../../runtime/RuntimeConfig";

// Numeric constants and coordinates match WorldCloudFieldShader and its CPU
// reference. These functions are shared by the sky volume and shadow raster.
export const cloudHash12Node = Fn(([p]: [Node<"vec2">]) => {
  const p3 = vec3(p.x, p.y, p.x).mul(0.1031).fract().toVar();
  p3.addAssign(p3.dot(p3.yzx.add(33.33)));
  return p3.x.add(p3.y).mul(p3.z).fract();
});

export const cloudValueNoiseNode = Fn(([p]: [Node<"vec2">]) => {
  const cell = p.floor();
  const local = p.fract();
  const blend = local.mul(local).mul(local.mul(-2).add(3));
  return mix(mix(cloudHash12Node(cell), cloudHash12Node(cell.add(vec2(1, 0))), blend.x),
    mix(cloudHash12Node(cell.add(vec2(0, 1))), cloudHash12Node(cell.add(1)), blend.x), blend.y);
});

export function createCloudFieldNodes(config: Readonly<RuntimeCloudConfig>, compact: boolean) {
  const time = uniform(0);
  const wind = uniform(new Vector2(config.windX, config.windZ));
  const detailWind = uniform(new Vector2(config.detailWindX, config.detailWindZ));
  const macroScale = uniform(config.macroScale);
  const detailScale = uniform(config.detailScale);
  const weatherScale = uniform(config.weatherScale);
  const coverage = uniform(config.coverage);
  const softness = uniform(config.softness);
  const fbm = Fn(([input]: [Node<"vec2">]) => {
    const p = input.toVar();
    const value = float(0).toVar();
    let amplitude = 0.5;
    let weight = 0;
    for (let octave = 0; octave < (compact ? 2 : 3); octave++) {
      value.addAssign(cloudValueNoiseNode(p).mul(amplitude));
      // GLSL mat2 columns: (0.8,0.6), (-0.6,0.8).
      p.assign(vec2(p.x.mul(0.8).sub(p.y.mul(0.6)), p.x.mul(0.6).add(p.y.mul(0.8)))
        .mul(2.02).add(vec2(11.7, -7.3)));
      weight += amplitude;
      amplitude *= 0.5;
    }
    return value.div(Math.max(weight, 0.0001));
  });
  const density = Fn(([world]: [Node<"vec2">]) => {
    const macroPosition = world.add(wind.mul(time));
    const detailPosition = world.add(detailWind.mul(time));
    const macroUv = macroPosition.mul(macroScale);
    const macro = fbm(macroUv);
    const warp = cloudValueNoiseNode(macroUv.mul(2.35).add(vec2(17.13, -9.71)));
    const detail = cloudValueNoiseNode(detailPosition.mul(detailScale).add(vec2(41.7, -26.4)));
    const weather = smoothstep(0.28, 0.78,
      cloudValueNoiseNode(macroPosition.mul(weatherScale).add(vec2(-73.1, 52.8))));
    const threshold = coverage.add(weather.negate().add(0.5).mul(0.11));
    const field = macro.add(warp.sub(0.5).mul(0.2)).add(detail.sub(0.5).mul(0.1));
    // Return all three values instead of GLSL out parameters.
    return vec3(smoothstep(threshold.sub(softness), threshold.add(softness), field), weather, detail);
  });
  const verticalProfile = Fn(([world, height]: [Node<"vec2">, Node<"float">]) => {
    const macroPosition = world.add(wind.mul(time));
    const detailPosition = world.add(detailWind.mul(time));
    const topNoise = cloudValueNoiseNode(macroPosition.mul(macroScale).mul(0.61).add(vec2(23.7, -18.2)));
    const baseNoise = cloudValueNoiseNode(macroPosition.mul(macroScale).mul(0.83).add(vec2(-31.4, 14.9)));
    const bodyNoise = cloudValueNoiseNode(detailPosition.mul(detailScale).mul(0.42)
      .add(vec2(9.2, -37.6)).add(vec2(height.mul(7.1), height.mul(-5.3))));
    const top = mix(0.62, 1, topNoise);
    return smoothstep(0, mix(0.045, 0.095, baseNoise), height)
      .mul(smoothstep(max(0.12, top.sub(0.16)), top, height).oneMinus())
      .mul(mix(0.78, 1, smoothstep(0.28, 0.72, bodyNoise)));
  });
  return { time, wind, detailWind, macroScale, detailScale, weatherScale, coverage, softness, fbm, density, verticalProfile };
}
