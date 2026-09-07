import type { Node, TextureNode } from "three/webgpu";
import { Fn, If, clamp, exp, float, max, min, mix, pow, smoothstep, vec2, vec3 } from "three/tsl";
import { fragmentCoordinate } from "../../render/FragmentCoordinate";

/**
 * Shared water optics, as nodes.
 *
 * Beer-Lambert transmittance over the real depth, with the bed drawn as opaque
 * geometry beneath rather than reconstructed from a buffer; the high preset adds
 * a shore band that thins toward the waterline, a deep term that saturates
 * instead of darkening forever, and a Fresnel balance that carries grazing
 * reflection without washing the surface to sky.
 */
export interface WaterOpticsInputs {
  quality: Node<"float">;
  absorption: Node<"vec3">;
  depthFade: Node<"float">;
  fresnelF0: Node<"float">;
  shoreFade: Node<"float">;
  deepStart: Node<"float">;
  reflectionGain: Node<"float">;
  refraction: TextureNode;
  refractionDepth: TextureNode;
  refractionSize: Node<"vec2">;
  refractionStrength: Node<"float">;
}

/** Depth 1 in the capture means no refractable geometry was drawn there. */
const REFRACTION_BACKGROUND_DEPTH = 0.9999;

/**
 * Optical depth along the view ray rather than straight down.
 *
 * A surface seen at a grazing angle is looked through for far longer than its
 * vertical depth, which is why a pool goes deep-coloured toward the far bank and
 * pale at your feet. Clamped, because the path length runs away at the horizon.
 */
const pathLength = (depth: Node<"float">, viewY: Node<"float">) =>
  depth.mul(min(float(1).div(max(float(0.18), viewY.abs())), 4.5));

/**
 * Shore to shallow to deep as one curve, returning the weight of the deep tint.
 * The shore end is faded rather than cut so the waterline does not draw itself
 * as a hard band, and the deep end saturates so a plunge pool stops darkening.
 */
const depthBlend = (u: WaterOpticsInputs, optical: Node<"float">) => {
  const shore = smoothstep(float(0), u.shoreFade, optical);
  const deep = smoothstep(u.shoreFade, u.deepStart, optical);
  return shore.mul(mix(float(0.35), float(1), deep));
};

/**
 * Surface colour and the transmittance the alpha term downstream needs.
 *
 * Both are derived from one optical-depth node rather than computed twice, so
 * the two cannot drift apart the way the shipped out-parameter exists to
 * prevent.
 */
export function waterOpticsResolveColorNode(u: WaterOpticsInputs, shallow: Node<"vec3">,
  deep: Node<"vec3">, depth: Node<"float">, worldPosition: Node<"vec3">, eye: Node<"vec3">,
  slope: Node<"vec2">): { color: Node<"vec3">; transmittance: Node<"vec3"> } {
  const absorption = vec3(1).sub(u.absorption).div(max(float(0.01), u.depthFade));
  const optical = Fn(() => {
    const offset = worldPosition.sub(eye).toVar();
    const viewY = float(-1).toVar();
    If(offset.length().greaterThan(1e-4), () => { viewY.assign(offset.normalize().y); });
    const result = depth.toVar();
    If(u.quality.greaterThan(0.5), () => { result.assign(pathLength(depth, viewY)); });
    return result;
  })();
  const transmittance = exp(absorption.negate().mul(optical));
  const color = Fn(() => {
    const resolved = shallow.mul(transmittance)
      .add(deep.mul(transmittance.oneMinus())).toVar();
    If(u.quality.greaterThan(0.5), () => {
      const blend = depthBlend(u, optical).toVar();
      resolved.assign(mix(shallow, resolved, blend));
      // What is actually behind the water, displaced by the surface slope. The
      // offset shrinks as the column deepens because a distant bed is both
      // harder to see and less displaced by the same wave.
      //
      // The capture renders only terrain, bed and stone, so pixels with no
      // refractable geometry hold the target's clear colour. The depth texture
      // is authoritative: depth 1 means nothing was drawn, and sampling those
      // pixels as radiance is what produced pure-black water at grazing angles.
      If(u.refractionSize.x.greaterThan(1), () => {
        const screenUv = fragmentCoordinate().div(u.refractionSize);
        const offsetUv = clamp(screenUv.add(slope.mul(u.refractionStrength)
          .div(optical.add(1))), vec2(0.002), vec2(0.998)).toVar();
        // GLSL gl_FragCoord and its slope offset count from the bottom;
        // portable render-target samplers count from the top on both APIs.
        const captureUv = vec2(offsetUv.x, offsetUv.y.oneMinus());
        const refractionDepth = u.refractionDepth.sample(captureUv).r.toVar();
        If(refractionDepth.lessThan(REFRACTION_BACKGROUND_DEPTH), () => {
          const refracted = u.refraction.sample(captureUv).rgb;
          resolved.assign(mix(refracted.mul(transmittance), resolved, blend));
        });
      });
    });
    return resolved;
  })();
  return { color, transmittance };
}

/**
 * Schlick, with the grazing end pulled back on the high preset. A physically
 * exact curve turns every shallow-angle pixel into sky, which is right for a
 * calm lake seen from its shore and wrong for a river read from inside a gorge,
 * where it erases the depth the rest of this model just established.
 */
export function waterOpticsFresnelNode(u: WaterOpticsInputs, facing: Node<"float">): Node<"float"> {
  return Fn(() => {
    const schlick = u.fresnelF0.add(u.fresnelF0.oneMinus().mul(pow(facing.oneMinus(), 5))).toVar();
    const result = schlick.toVar();
    If(u.quality.greaterThan(0.5), () => { result.assign(schlick.mul(u.reflectionGain)); });
    return result;
  })();
}
