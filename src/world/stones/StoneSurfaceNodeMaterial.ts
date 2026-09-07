import { MeshLambertNodeMaterial, type Node, type NodeBuilder } from "three/webgpu";
import {
  If, diffuseColor, max, mix, normalView, positionViewDirection, pow, smoothstep, vec3,
} from "three/tsl";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import {
  createStoneCoarseNodes, createStoneSurfaceNodes, type StoneSurfaceAttributes,
  type StoneSurfaceInputs,
} from "./StoneSurfaceNodes";

export interface StoneSheenInputs {
  wetSheenStrength: Node<"float">;
  wetSheenPower: Node<"float">;
  drySheenStrength: Node<"float">;
  drySheenPower: Node<"float">;
}

/**
 * The portable stone surface material.
 *
 * Albedo and the grain bump come from the shared surface nodes; the three terms
 * the shipped shader adds around `opaque_fragment` — the sky-side fill, the
 * ambient floor and the sheen — are applied here in that order, because they
 * act on the lit result rather than on the albedo.
 */
export class StoneSurfaceNodeMaterial extends MeshLambertNodeMaterial {
  private readonly sheen: StoneSheenInputs;
  private readonly wet: Node<"float">;
  private readonly context: WorldNodeMaterialContext;

  constructor(name: string, inputs: StoneSurfaceInputs, sheen: StoneSheenInputs,
    attributes: StoneSurfaceAttributes, context: WorldNodeMaterialContext, dithering: boolean) {
    super();
    this.name = name;
    this.dithering = dithering;
    this.sheen = sheen;
    this.wet = attributes.wet;
    this.context = context;
    // The vertex colour is the palette, and the surface starts from it, so the
    // material must not also multiply it in through the built-in path.
    this.vertexColors = false;
    const surface = createStoneSurfaceNodes(inputs, attributes, attributes.color);
    this.colorNode = surface.color;
    if (surface.normal) this.normalNode = surface.normal;
    context.applyTo(this);
  }

  override setupLighting(builder: NodeBuilder): Node<"vec3"> {
    const lambert = vec3(super.setupLighting(builder) as Node<"vec3">);
    const sun = this.context.directionalSurfaceLight();
    const hemisphere = this.context.hemisphereFill();
    const wet = this.wet;
    const sheen = this.sheen;
    return (() => {
      const outgoing = lambert.toVar();
      if (hemisphere) {
        // Directional open-sky fill, deliberately weak under the strong key.
        const sunFacing = normalView.dot(sun.direction).clamp(0, 1);
        const skyFacing = normalView.dot(hemisphere.direction).mul(0.5).add(0.5).clamp(0, 1);
        const skySide = smoothstep(0.08, 0.46, sunFacing).oneMinus()
          .mul(smoothstep(0.18, 0.78, skyFacing));
        outgoing.addAssign(diffuseColor.rgb.mul(hemisphere.skyColor)
          .mul(vec3(0.72, 0.92, 1.18)).mul(skySide.mul(0.2)));
      }
      // A hemisphere ground colour tuned for turf leaves a downward-facing
      // bevel at almost zero; the floor turns that contact rim back into stone.
      outgoing.assign(max(outgoing, diffuseColor.rgb.mul(0.34)));
      const half = sun.direction.add(positionViewDirection).normalize();
      const base = normalView.dot(half).clamp(0, 1).toVar();
      // Unbranched: the dry term applies to every body, so there is no coherent
      // batch to skip and a branch would only cost the divergence it saves.
      const lobe = pow(base, sheen.drySheenPower).mul(sheen.drySheenStrength).toVar();
      If(wet.greaterThan(0.001), () => {
        lobe.assign(mix(lobe, pow(base, sheen.wetSheenPower).mul(sheen.wetSheenStrength), wet));
      });
      outgoing.addAssign(sun.color.mul(lobe));
      return outgoing;
    })();
  }
}

/** Far batches have already passed every close-detail fade. */
export class StoneCoarseNodeMaterial extends MeshLambertNodeMaterial {
  constructor(name: string, wetDarken: Node<"float">, attributes: StoneSurfaceAttributes,
    context: WorldNodeMaterialContext) {
    super();
    this.name = name;
    this.dithering = false;
    this.vertexColors = false;
    this.colorNode = createStoneCoarseNodes(wetDarken, attributes, attributes.color);
    this.context = context;
    context.applyTo(this);
  }

  private readonly context: WorldNodeMaterialContext;

  override setupLighting(builder: NodeBuilder): Node<"vec3"> {
    const lambert = vec3(super.setupLighting(builder) as Node<"vec3">);
    const sun = this.context.directionalSurfaceLight();
    const hemisphere = this.context.hemisphereFill();
    const outgoing = lambert.toVar();
    if (hemisphere) {
      const sunFacing = normalView.dot(sun.direction).clamp(0, 1);
      const skyFacing = normalView.dot(hemisphere.direction).mul(0.5).add(0.5).clamp(0, 1);
      const skySide = smoothstep(0.08, 0.46, sunFacing).oneMinus()
        .mul(smoothstep(0.18, 0.78, skyFacing));
      outgoing.addAssign(diffuseColor.rgb.mul(hemisphere.skyColor)
        .mul(vec3(0.72, 0.92, 1.18)).mul(skySide.mul(0.2)));
    }
    outgoing.assign(max(outgoing, diffuseColor.rgb.mul(0.34)));
    return outgoing;
  }
}
