import { DataTexture, RGBAFormat, UnsignedByteType, type Node, type Texture } from "three/webgpu";
import { Fn, If, float, uniform, reference, texture, max, min, smoothstep, mix } from "three/tsl";
import type { WorldCloudShadowUniforms } from "./WorldCloudShadowUniforms";

/** Explicit material composition, replacing string patches of reflectedLight. */
export class WorldCloudShadowNodes {
  private readonly fallback = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  private readonly map;
  readonly sample;
  readonly relativeDirect;

  constructor(uniforms: WorldCloudShadowUniforms) {
    this.fallback.needsUpdate = true;
    this.map = texture(uniforms.uCloudShadowMap.value ?? this.fallback);
    const enabled = reference("value", "float", uniforms.uCloudShadowEnabled);
    const worldSize = reference("value", "float", uniforms.uCloudShadowWorldSize);
    const baseHeight = reference("value", "float", uniforms.uCloudBaseHeight);
    const edgeFade = reference("value", "float", uniforms.uCloudShadowEdgeFadeUv);
    const start = reference("value", "float", uniforms.uCloudShadowDistanceFadeStart);
    const end = reference("value", "float", uniforms.uCloudShadowDistanceFadeEnd);
    const focus = reference("value", "float", uniforms.uCloudFocusTransmittance);
    const origin = uniform(uniforms.uCloudShadowOriginXZ.value);
    const sun = uniform(uniforms.uCloudSunDirection.value);
    this.sample = Fn(([world, distance]: [Node<"vec3">, Node<"float">]) => {
      const result = float(1).toVar();
      If(enabled.greaterThanEqual(0.5).and(worldSize.greaterThan(0)), () => {
      const cloudHeight = max(baseHeight.sub(world.y), 0);
      const projected = world.xz.add(sun.xz.mul(cloudHeight.div(max(sun.y, 0.08))));
      const coord = projected.sub(origin).div(worldSize).add(0.5);
      const outside = coord.x.lessThan(0).or(coord.y.lessThan(0)).or(coord.x.greaterThan(1)).or(coord.y.greaterThan(1));
      If(outside.not(), () => {
      const edge = min(coord, coord.oneMinus());
      const coverage = smoothstep(0, max(edgeFade, 0.0001), min(edge.x, edge.y));
      const local = mix(1, this.map.sample(coord).r.clamp(0, 1), coverage);
      result.assign(mix(local, 1, smoothstep(start, end, distance)));
      });
      });
      return result;
    });
    this.relativeDirect = Fn(([transmittance]: [Node<"float">]) =>
      min(1.6, max(transmittance, 0).div(max(focus, 0.001))));
  }

  setTexture(value: Texture | null): void { this.map.value = value ?? this.fallback; }
  dispose(): void { this.fallback.dispose(); }
}
