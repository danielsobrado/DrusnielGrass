import type { Node, TextureNode } from "three/webgpu";
import {
  Discard, Fn, If, attribute, cameraPosition, exp, float, floor, fract, max, mix, mod,
  modelWorldMatrix, positionGeometry, sin, smoothstep, varying, vec2, vec3, vec4,
} from "three/tsl";
import { fragmentCoordinate } from "../../render/FragmentCoordinate";
import { WATER_VISIBLE_COVERAGE_THRESHOLD } from "./WaterMaterialTuning";
import { waterResolveBankSidesNode } from "./WaterRegimeNodes";

/**
 * The river bed, as nodes.
 *
 * The bed reads the same packed hydrology the surface does — coverage, depth
 * and flow in `waterData`, bend, lateral offset and morphology in
 * `waterContext` — so the two layers agree about which part of the river they
 * are on instead of each guessing from depth.
 */
export interface WaterBedInputs {
  time: Node<"float">;
  noise: TextureNode;
  scale: Node<"float">;
  strength: Node<"float">;
  refraction: Node<"float">;
  algaeStrength: Node<"float">;
  causticStrength: Node<"float">;
  riverReferenceDepth: Node<"float">;
  extinction: Node<"vec3">;
  pebbleDark: Node<"vec3">;
  pebbleLight: Node<"vec3">;
  sand: Node<"vec3">;
  algae: Node<"vec3">;
}

export function createWaterBedNodes(u: WaterBedInputs) {
  const data = attribute<"vec4">("waterData", "vec4");
  const context = attribute<"vec4">("waterContext", "vec4");
  // The bed sits a depth below the surface sheet it shares geometry with.
  const position = positionGeometry.sub(vec3(0, max(float(0), data.y), 0));
  const worldPosition = varying(modelWorldMatrix.mul(vec4(position, 1)).xyz);
  const bedData = varying(data);
  const bedContext = varying(context);

  /**
   * Bed albedo and its relief.
   *
   * A point bar on the inside of a bend is where the coarse bedload piles up;
   * the scoured outer side and a still basin are where the fines settle out.
   */
  const sampleRiverBed = (bedPosition: Node<"vec2">, flowDirection: Node<"vec2">,
    riverAmount: Node<"float">, riffle: Node<"float">, pool: Node<"float">, bank: Node<"float">,
    channelCore: Node<"float">, zones: Node<"vec3">) => Fn(() => {
    const bed = u.noise.sample(bedPosition.mul(u.scale)).toVar();
    const pebble = bed.r.toVar();
    const shade = bed.a.toVar();
    const coarseBias = riffle.mul(0.24).add(channelCore.mul(0.04)).add(zones.y.mul(0.28))
      .sub(pool.mul(0.16));
    pebble.assign(pebble.add(coarseBias).clamp(0, 1));
    const fineDeposition = pool.mul(0.2).add(bank.mul(0.12)).add(zones.x.mul(0.24))
      .add(zones.z.mul(0.55)).clamp(0, 1);
    pebble.mulAssign(fineDeposition.oneMinus());

    const stone = mix(u.pebbleDark, u.pebbleLight, bed.g);
    const sand = mix(u.pebbleLight, u.sand, 0.62).mul(bed.g.mul(0.2).add(0.9));
    // Never a full commit to stone: at 1.0 the bed became a cobble mosaic with
    // sand only in the gaps, which is what read as gravel rather than riverbed.
    const color = mix(sand, stone, pebble.mul(0.82)).toVar();
    // Baked cobble shading may only take light away.
    color.mulAssign(shade.mul(0.42).add(0.58));

    const sway = sin(u.time.mul(0.9).add(bedPosition.x.mul(0.4)).add(bedPosition.y.mul(0.27)));
    const algaeDrift = flowDirection.mul(sway).mul(riverAmount.mul(0.22).add(0.06));
    const algae = u.noise.sample(bedPosition.add(algaeDrift).mul(u.scale).mul(0.45)).b.toVar();
    algae.assign(smoothstep(0.66, 0.93, algae).mul(u.algaeStrength));
    algae.mulAssign(mix(float(1), float(0.55), pebble));
    algae.mulAssign(float(1).add(bank.mul(0.24)).add(zones.z.mul(0.4)).sub(riffle.mul(0.28))
      .clamp(0.58, 1.42));
    color.assign(mix(color, u.algae.mul(shade.mul(0.5).add(0.68)), algae));
    return vec4(color, pebble.mul(algae.mul(0.5).oneMinus()));
  })();

  const color = Fn(() => {
    const coverageRaw = bedData.x.clamp(0, 1).toVar();
    Discard(coverageRaw.lessThan(WATER_VISIBLE_COVERAGE_THRESHOLD));
    Discard(u.strength.lessThan(0.001));

    const depth = max(float(0), bedData.y).toVar();
    const packedFlow = bedData.zw.toVar();
    const riverAmount = packedFlow.length().clamp(0, 1).toVar();
    const flowDirection = vec2(0.78, 0.63).normalize().toVar();
    If(riverAmount.greaterThan(0.001), () => {
      flowDirection.assign(packedFlow.div(riverAmount));
    });
    const flowPerpendicular = vec2(flowDirection.y.negate(), flowDirection.x).toVar();
    const viewDiff = worldPosition.sub(cameraPosition).toVar();
    const viewRay = vec3(0, -1, 0).toVar();
    If(viewDiff.length().greaterThan(1e-4), () => { viewRay.assign(viewDiff.normalize()); });
    const grazing = viewRay.y.abs().clamp(0, 1).oneMinus().toVar();
    // The phase rate is deliberately uniform: scaling it by the river amount,
    // which has a spatial gradient wherever a lake meets a river, multiplies
    // that gradient by absolute time and the wobble's spatial frequency climbs
    // without bound as a session runs.
    const wobble = sin(worldPosition.xz.dot(flowPerpendicular).mul(0.18)
      .add(u.time.mul(0.23))).mul(mix(float(0.62), float(1), riverAmount)).toVar();
    const depthRatio = depth.div(max(float(0.1), u.riverReferenceDepth)).toVar();
    const channelCore = smoothstep(0.4, 0.88, coverageRaw).toVar();
    // Depth alone put nearly the whole channel in one class, because a 12 m
    // river is shallow almost everywhere; the meander's own morphology is what
    // makes pools and riffles alternate along the reach.
    const morphology = bedContext.z.toVar();
    const riffle = riverAmount.mul(channelCore).mul(
      smoothstep(0.68, 1.02, depthRatio).oneMinus().mul(0.68)
        .add(morphology.negate().clamp(0, 1).mul(0.32)).clamp(0, 1)).toVar();
    const pool = riverAmount.mul(channelCore).mul(
      smoothstep(1.05, 1.24, depthRatio).mul(0.68)
        .add(morphology.clamp(0, 1).mul(0.32)).clamp(0, 1)).toVar();
    const bank = riverAmount.mul(smoothstep(0.42, 0.86, coverageRaw).oneMinus()).toVar();
    const bedPosition = worldPosition.xz
      .add(viewRay.xz.mul(depth).mul(u.refraction).mul(grazing.mul(0.05).add(0.025)))
      .add(flowPerpendicular.mul(wobble).mul(depth).mul(u.refraction).mul(0.018)).toVar();

    const banks = waterResolveBankSidesNode(bedContext.x, bedContext.y, riverAmount).toVar();
    const still = riverAmount.oneMinus().mul(channelCore).toVar();
    const sampled = sampleRiverBed(bedPosition, flowDirection, riverAmount, riffle, pool, bank,
      channelCore, vec3(banks, still)).toVar();
    const bedColor = sampled.rgb.toVar();
    bedColor.mulAssign(sampled.w.mul(0.06).add(0.96));
    bedColor.mulAssign(pool.mul(0.05).oneMinus());

    // Depth attenuation. Without it the bed keeps full dry-lit radiance at any
    // depth and the river reads as a snow ribbon from the air. Reuses the
    // surface's own absorption vector — no new sample.
    bedColor.mulAssign(exp(u.extinction.negate().mul(depth)));

    const shallow = smoothstep(0.18, 2.4, depth).oneMinus().toVar();
    const causticA = u.noise.sample(bedPosition.mul(u.scale).mul(2.35)
      .add(vec2(u.time.mul(0.031), u.time.mul(-0.019)))).r;
    const causticB = u.noise.sample(bedPosition.mul(u.scale).mul(1.62)
      .sub(vec2(u.time.mul(0.022), u.time.mul(0.027)))).g;
    bedColor.mulAssign(causticA.mul(causticB).mul(shallow).mul(u.causticStrength).mul(0.28).add(1));

    const coverage = smoothstep(0.025, 0.34, coverageRaw).toVar();
    // A 4x4 screen-space stipple, so a thinning margin dissolves instead of
    // ending on a hard line.
    // The stipple is a fixed 4x4 tile keyed to the fragment coordinate, so it
    // has to read the same coordinate the shipped material does or an
    // equivalent but different set of margin pixels dissolves.
    const dither = fract(floor(mod(fragmentCoordinate(), 4)).dot(vec2(0.17, 0.37))).toVar();
    Discard(coverage.mul(u.strength).lessThan(dither.mul(0.52).add(0.14)));
    return bedColor;
  })();

  return { position, color };
}
