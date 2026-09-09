import { DoubleSide, MeshPhysicalNodeMaterial } from "three/webgpu";
import type { IUniform } from "three";
import { reference } from "three/tsl";
import { createUniformTexture, type UniformTexture } from "../../render/NodeUniformTexture";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { WATER_IOR, WATER_SHALLOW_COLOR, WATER_SPECULAR_COLOR } from "./WaterMaterialTuning";
import { createWaterSurfaceNodes } from "./WaterSurfaceNodes";

/**
 * The portable water surface material.
 *
 * `MeshPhysicalNodeMaterial` is the node counterpart of the shipped
 * `MeshPhysicalMaterial`, and the four nodes below land in the same four slots
 * the GLSL patch writes at `<normal_fragment_maps>`: the view-space normal, the
 * albedo, the roughness and the alpha. Like the bed, it owns no hydrology
 * state — every value is read from the table `WaterMaterialController` writes,
 * so the two paths cannot disagree about the river while both are alive.
 */
export class WaterSurfaceNodeMaterial extends MeshPhysicalNodeMaterial {
  private readonly boundTextures: UniformTexture[] = [];
  constructor(values: Record<string, IUniform>, context?: WorldNodeMaterialContext) {
    super();
    this.name = "world-hydrology-water-node-material";
    this.color.set(WATER_SHALLOW_COLOR);
    // The base roughness is read from the table as `uWaterRoughness`; the
    // material property is left alone so there is nothing here to fall out of
    // step with the controller.
    this.metalness = 0;
    this.ior = WATER_IOR;
    this.specularColor.set(WATER_SPECULAR_COLOR);
    this.specularIntensity = 1;
    this.transparent = true;
    this.opacity = 1;
    this.depthWrite = false;
    this.side = DoubleSide;
    this.dithering = true;
    // The sheet is drawn once even though it is double sided: the two faces of
    // one water surface are the same water, and a second pass over the far side
    // resolves a different fragment where the two overlap.
    this.forceSinglePass = true;

    const number = (name: string) => reference("value", "float", values[name]);
    const color = (name: string) => reference("value", "color", values[name]).rgb;
    const sampler = (name: string, depth = false) => {
      const bound = createUniformTexture(values[name], depth);
      this.boundTextures.push(bound);
      return bound.node;
    };
    const rain = context?.worldRainUniforms();
    const surface = createWaterSurfaceNodes({
      time: number("uWaterTime"),
      opacity: number("uWaterOpacity"),
      roughnessBase: number("uWaterRoughness"),
      rippleStrength: number("uWaterRippleStrength"),
      rippleScale: number("uWaterRippleScale"),
      flowSpeed: number("uWaterFlowSpeed"),
      riverReferenceDepth: number("uWaterRiverReferenceDepth"),
      riverPoolFlowScale: number("uWaterRiverPoolFlowScale"),
      riverRiffleFlowScale: number("uWaterRiverRiffleFlowScale"),
      foamStrength: number("uWaterFoamStrength"),
      shoreFoamWeight: number("uWaterShoreFoamWeight"),
      riffleFoamWeight: number("uWaterRiffleFoamWeight"),
      stoneFoamWeight: number("uWaterStoneFoamWeight"),
      fresnelStrength: number("uWaterFresnelStrength"),
      detailDistance: number("uWaterDetailDistance"),
      lakeWaveStrength: number("uWaterLakeWaveStrength"),
      flowNoise: sampler("uWaterFlowNoise"),
      flowNoiseScale: number("uWaterFlowNoiseScale"),
      flowNoiseStrength: number("uWaterFlowNoiseStrength"),
      glintStrength: number("uWaterGlintStrength"),
      stoneWakeStrength: number("uWaterStoneWakeStrength"),
      shallow: color("uWaterShallow"),
      deep: color("uWaterDeep"),
      reflection: color("uWaterReflection"),
      foam: color("uWaterFoam"),
      sunDirection: reference("value", "vec3", values.uWaterSunDirection),
      quality: number("uWaterOpticsQuality"),
      absorption: color("uWaterAbsorption"),
      depthFade: number("uWaterDepthFade"),
      fresnelF0: number("uWaterFresnelF0"),
      shoreFade: number("uWaterOpticsShoreFade"),
      deepStart: number("uWaterOpticsDeepStart"),
      reflectionGain: number("uWaterOpticsReflectionGain"),
      refraction: sampler("tWaterRefraction"),
      refractionDepth: sampler("tWaterRefractionDepth", true),
      refractionSize: reference("value", "vec2", values.uWaterRefractionSize),
      refractionStrength: number("uWaterRefractionStrength"),
      rainTime: rain?.time,
      rainIntensity: rain?.intensity,
      waterContacts: context?.worldWaterContacts(),
    });
    this.normalNode = surface.normal;
    this.colorNode = surface.color;
    this.roughnessNode = surface.roughness;
    this.opacityNode = surface.alpha;
    context?.applyTo(this);
  }

  /** The refraction capture is swapped whenever the pass re-renders it. */
  syncTextures(): void {
    for (const bound of this.boundTextures) bound.sync();
  }

  override dispose(): void {
    for (const bound of this.boundTextures) bound.dispose();
    this.boundTextures.length = 0;
    super.dispose();
  }
}
