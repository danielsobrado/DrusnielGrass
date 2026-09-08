import { DoubleSide, MeshLambertNodeMaterial, type Node, type NodeBuilder } from "three/webgpu";
import { Fn, If, abs, diffuseColor, faceDirection, float, mix, normalView, positionViewDirection, smoothstep, vec3 } from "three/tsl";
import type { IUniform } from "three";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { GRASS_LIGHT_MIX } from "./GrassPaletteShader";
import { createGrassNodeUniforms } from "./GrassNearNodeInputs";
import { createGrassNearNodes, setupGrassPosition, type GrassNearNodeFeatures } from "./GrassNearNodes";

/**
 * The portable grass blade material.
 *
 * It owns no grass state: every uniform is read from the table the existing
 * `GrassNearMaterial` already writes, so one configure/art-direction/LOD path
 * drives the legacy and node materials identically while both exist.
 */
export class GrassNearNodeMaterial extends MeshLambertNodeMaterial {
  private readonly inputs: ReturnType<typeof createGrassNodeUniforms>;
  private readonly sun?: { direction: Node<"vec3">; color: Node<"vec3"> };
  private readonly features: GrassNearNodeFeatures;
  private readonly graph: ReturnType<typeof createGrassNearNodes>;

  constructor(name: string, values: Record<string, IUniform>, features: GrassNearNodeFeatures,
    context?: WorldNodeMaterialContext) {
    super();
    this.name = name;
    this.side = DoubleSide;
    this.transparent = false;
    this.depthWrite = true;
    this.features = features;
    this.inputs = createGrassNodeUniforms(values);
    this.graph = createGrassNearNodes(this.inputs, features);
    this.positionNode = this.graph.position;
    // The GLSL writes the blade's view normal into `vNormal`, so
    // `normal_fragment_begin` flips it by `faceDirection` on this double-sided
    // material. `NodeMaterial.setupNormal` returns an assigned `normalNode`
    // verbatim and applies no such flip, so without this every back-facing
    // blade fragment would light from the opposite hemisphere.
    this.normalNode = this.graph.normal.mul(faceDirection);
    this.colorNode = this.graph.color;
    if (context) {
      context.applyTo(this);
      this.sun = context.directionalSurfaceLight();
    }
  }

  override setupPosition(builder: NodeBuilder): Node<"vec3"> {
    return setupGrassPosition(builder, this.graph.position);
  }

  /**
   * The blade's own response, replacing the fragment output the GLSL patched.
   *
   * Lambert light is mixed towards flat albedo, transmission is added for
   * blades standing between the camera and the sun, and the waxy lobe rides the
   * gust so a crest reads as light rather than only as motion.
   */
  override setupLighting(builder: NodeBuilder): Node<"vec3"> {
    const lambert = vec3(super.setupLighting(builder) as Node<"vec3">)
      .add(diffuseColor.rgb.mul(this.inputs.number("uGrassAmbientBoost")));
    const sun = this.sun;
    if (!sun) return mix(diffuseColor.rgb, lambert, GRASS_LIGHT_MIX);
    return Fn(() => {
      const surfaceNormal = normalView.toVar();
      const viewDirection = positionViewDirection.toVar();
      // Transmission, not a rim: the sun must be behind the blade, the blade
      // turned edge-on to it, and a thin tip passes more than a thick base.
      const intoSun = viewDirection.negate().dot(sun.direction).clamp(0, 1).toVar();
      const thinness = abs(surfaceNormal.dot(sun.direction)).oneMinus();
      const rootAttenuation = smoothstep(0.12, 0.72, this.graph.progress);
      const viewFacing = surfaceNormal.dot(viewDirection).clamp(0, 1);
      const wetTransmission = mix(0.78, 1.14, this.graph.dryness.oneMinus());
      const backLight = intoSun.mul(intoSun).mul(thinness).mul(rootAttenuation)
        .mul(float(0.35).add(viewFacing.mul(0.65))).mul(this.graph.sheen.y).mul(wetTransmission)
        .min(0.82).toVar();
      const sheen = vec3(0).toVar();
      if (this.features.sheen) {
        // Skip the half-vector normalization and the high-power lobe once the
        // contribution has faded; the branch is coherent across distant quads.
        If(this.graph.sheen.x.greaterThan(0.001), () => {
          const sunPlusView = sun.direction.add(viewDirection).toVar();
          const half = vec3(0).toVar();
          If(sunPlusView.length().greaterThan(1e-4), () => { half.assign(sunPlusView.normalize()); })
            .Else(() => { half.assign(surfaceNormal); });
          sheen.assign(sun.color.mul(surfaceNormal.dot(half).clamp(0, 1)
            .pow(this.inputs.number("uGrassSheenPower"))
            .mul(this.inputs.number("uGrassSheenStrength")).mul(this.graph.sheen.x)
            .mul(smoothstep(0.3, 0.92, this.graph.progress))));
        });
      }
      return mix(diffuseColor.rgb, lambert, GRASS_LIGHT_MIX)
        .add(mix(diffuseColor.rgb, this.inputs.color("uGrassTipColor"), 0.35)
          .mul(backLight).mul(this.inputs.number("uGrassBacklightStrength")))
        .add(sheen);
    })();
  }

  /** Optional samplers follow their uniform; the trail map is swapped per frame. */
  syncUniformTextures(): void {
    this.inputs.syncTextures();
  }

  override dispose(): void {
    this.inputs.dispose();
    super.dispose();
  }
}
