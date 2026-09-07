import type { Node, TextureNode } from "three/webgpu";
import {
  Fn, attribute, cameraPosition, float, max, mix, modelWorldMatrix, positionGeometry, smoothstep,
  sqrt, varying, vec2, vec4,
} from "three/tsl";

/**
 * Falling water, as nodes.
 *
 * A curtain is not a river surface seen edge-on: it accelerates, it separates
 * into strands, it is thin and bright where it leaves the lip and dense and
 * white where it lands. Everything keys off the fall progress carried in the
 * geometry, so one material covers a 2 m cascade and a 20 m plunge — and the
 * node port keeps that, reading the very attributes and uniforms the shipped
 * material does rather than restating any of the geometry's contract.
 */
export interface WaterCascadeInputs {
  time: Node<"float">;
  foamStrength: Node<"float">;
  mistStrength: Node<"float">;
  detailDistance: Node<"float">;
  noise: TextureNode;
  noiseScale: Node<"float">;
  water: Node<"vec3">;
  foam: Node<"vec3">;
  mist: Node<"vec3">;
}

export function createWaterCascadeNodes(u: WaterCascadeInputs) {
  const cascade = varying(attribute<"vec3">("cascade", "vec3"));
  // Sill height in units of the height at which rock stands clear of the sheet:
  // below zero runs heavier, above one is dry rock the fall parts around.
  const sill = varying(attribute<"float">("cascadeCrest", "float"));
  const worldPosition = varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz);

  /**
   * Everything the two noise taps feed, resolved once.
   *
   * Both the colour and the alpha read the same strand, breakup, gap, impact
   * and aeration terms; sharing the node objects is what keeps them describing
   * one curtain rather than two that merely look alike.
   */
  const across = cascade.x;
  const fall = cascade.y.clamp(0, 1);
  const drop = max(float(0.5), cascade.z);
  const detail = smoothstep(u.detailDistance.mul(0.55), u.detailDistance,
    cameraPosition.distance(worldPosition)).oneMinus();

  /**
   * Water in free fall keeps accelerating, so the streaks must stretch and
   * speed up on the way down — but that belongs in the mapping, never in a
   * scroll rate multiplied by absolute time. A fall-dependent speed times the
   * clock compresses the strands further every second and eventually runs the
   * curtain upward; a parcel's age goes as the square root of the distance
   * dropped, so advecting by that age and scrolling at one constant rate is
   * stable for any run length. Derivation in the waterfall gorge geology plan,
   * section 0.7.
   *
   * The domain stays many tiles across and only a few tall: that ratio is what
   * turns the noise into vertical strands rather than a cloudy wash.
   */
  const strandUv = across.mul(6);
  const flowUv = sqrt(fall).mul(drop).mul(u.noiseScale).mul(2.6).sub(u.time.mul(1.55));
  const noise = u.noise.sample(vec2(strandUv, flowUv));
  const coarse = u.noise.sample(vec2(strandUv.mul(0.37).add(0.21),
    flowUv.mul(0.44).sub(u.time.mul(0.35))));

  /**
   * Strands. The sheet leaves the lip whole and pulls apart as it falls, so the
   * fine layer is mixed in only once the fall is under way; without the coarse
   * layer underneath, every strand is the same width and the curtain stripes.
   * The tear height is jittered per column, or the sheet parts along a contour.
   */
  const breakup = smoothstep(0.04, 0.72, fall.add(coarse.a.sub(0.5).mul(0.42)));
  const strand = mix(coarse.r, noise.g, breakup.mul(0.45).add(0.4));
  const gap = smoothstep(0.28, 0.72, strand);
  const sheet = breakup.mul(gap).mul(0.85).oneMinus();

  // The lip runs thin and bright; the middle aerates; the base is whitewater.
  // Narrow: a wide crest band at high alpha becomes a solid slab at the lip.
  const crest = smoothstep(0, 0.05, fall).oneMinus();
  // Broken by the strand noise so the base is a ragged boil, not a painted band.
  const impact = smoothstep(0.55, 1, fall).mul(coarse.b.mul(0.75).add(0.55))
    .add(smoothstep(0.86, 1, fall).mul(0.35)).clamp(0, 1);
  /**
   * Aeration is what makes falling water white, and it starts the moment the
   * sheet leaves the lip rather than only at the base. Holding it low through
   * the middle left the curtain a grey pane between a bright crest and a bright
   * foot.
   */
  const aeration = float(0.1).add(breakup.mul(0.66)).add(impact.mul(0.95))
    .add(gap.oneMinus().mul(0.3).mul(detail)).clamp(0, 1);

  const color = Fn(() => {
    const resolved = mix(u.water, u.foam, aeration).toVar();
    resolved.assign(mix(resolved, u.mist, impact.mul(u.mistStrength).mul(0.5)));
    // Falling water is lit from every side at once and is the brightest thing
    // in a gorge. Keeping it near its own albedo, rather than shading it down
    // like a surface, is what stops it reading as a pane of dirty glass.
    return resolved.mul(float(0.96).add(sheet.mul(0.16)).add(crest.mul(0.24)));
  })();

  /**
   * The curtain has to lose its own silhouette at both edges and at the base,
   * or the geometry's rectangle shows. Noise breaks the boundary, and the
   * falloff is squared and closed before the mesh edge: a linear ramp leaves a
   * skirt of low-alpha fragments that collectively redraw the rectangle anyway.
   */
  const edgeNoise = coarse.g.mul(0.3).add(0.55);
  const edgeRamp = smoothstep(edgeNoise.mul(0.34), float(0.9), across.abs()).oneMinus();
  const edge = edgeRamp.mul(edgeRamp);

  const alpha = Fn(() => {
    // The gaps must be genuinely see-through: a uniformly semi-opaque curtain
    // is a wall, one you can read the gorge through between dense strands is a
    // waterfall.
    const resolved = aeration.mul(0.95).mul(u.foamStrength).add(0.16)
      .mul(edge).mul(mix(float(0.12), float(1), sheet)).clamp(0, 1).toVar();
    // Base spray has no surface of its own, so it thins rather than ending on a
    // cut.
    resolved.mulAssign(smoothstep(0.82, 1, fall).mul(0.55).oneMinus());
    resolved.assign(max(resolved, crest.mul(0.2).mul(edge)));
    // Dissolve the sill's line, and thin the sheet where the rock stands proud.
    resolved.mulAssign(smoothstep(float(0), coarse.r.mul(0.14).add(0.03), fall));
    resolved.mulAssign(sill.oneMinus().clamp(0, 1).mul(sill.mul(0.35).oneMinus())
      .mul(sill.negate().clamp(0, 1).mul(0.3).add(1)));
    return resolved;
  })();

  return { color, alpha };
}
