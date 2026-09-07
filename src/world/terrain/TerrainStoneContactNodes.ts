import type { Node } from "three/webgpu";
import { If, dFdx, dFdy, float, max, mix, smoothstep } from "three/tsl";
import type { TerrainNodeAttributes, TerrainNodeUniforms } from "./TerrainNodeInputs";
import type { TerrainDetailNodes } from "./TerrainDetailNodes";
import type { TerrainEcologyNodes } from "./TerrainEcologyNodes";

/** Coherence rejects interpolated identities between unrelated stones. */
export function terrainStoneContactNodes(u: TerrainNodeUniforms, a: TerrainNodeAttributes, d: TerrainDetailNodes, e: TerrainEcologyNodes, world: Node<"vec3">, color: Node<"vec3">) {
  const worldGradient = max(dFdx(world.xz).length(), dFdy(world.xz).length()).toVar();
  const coherence = (center: Node<"vec2">, radius: Node<"float">) => {
    const centerGradient = max(dFdx(center).length(), dFdy(center).length());
    const radiusGradient = max(dFdx(radius).abs(), dFdy(radius).abs());
    const slope = max(centerGradient.div(max(1e-4, worldGradient)),
      radiusGradient.div(max(1e-4, worldGradient.mul(max(0.25, radius)))));
    return smoothstep(0.05, 0.35, slope).oneMinus().toVar();
  };
  // Resolve derivatives outside branches for both backends.
  const contactCoherence = coherence(a.stone.xy, a.stone.w);
  const occlusionCoherence = coherence(a.occlusionCenter, a.occlusion);
  const proximity = float(0).toVar();
  If(a.stone.w.greaterThan(0), () => {
    proximity.assign(smoothstep(a.stone.z, a.stone.w, world.xz.sub(a.stone.xy).length()).oneMinus().mul(contactCoherence));
  });
  const edge = smoothstep(0, 0.22, proximity);
  const contact = proximity.mul(u.number("uTerrainStoneContactReach"))
    .add(d.baseNoise.r.sub(0.5).mul(0.42).add(d.mesoNoise.g.sub(0.5).mul(0.30).mul(d.mesoWeight)).mul(edge)).clamp(0, 1).toVar();
  If(contact.greaterThan(0.001), () => {
    const disturbed = smoothstep(0.16, 0.70, contact), compacted = smoothstep(0.54, 0.96, contact);
    const soil = u.color("uTerrainStoneContactSoil");
    const stoneSoil = mix(mix(soil, u.color("uTerrainPathGrit"), 0.34), soil, e.humidity);
    color.assign(mix(color, stoneSoil, disturbed.mul(0.58).add(compacted.mul(0.32)).clamp(0, 1)));
    color.mulAssign(u.number("uTerrainStoneContactDarkening").mul(compacted).oneMinus());
  });
  If(a.occlusion.greaterThan(0).and(occlusionCoherence.greaterThan(0.001)), () => {
    const shade = smoothstep(0, a.occlusion, world.xz.sub(a.occlusionCenter).length()).oneMinus();
    color.mulAssign(u.number("uTerrainStoneOcclusionStrength").mul(shade).mul(shade).mul(occlusionCoherence).oneMinus());
  });
}
