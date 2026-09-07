import { DoubleSide, MeshBasicNodeMaterial } from "three/webgpu";
import type { IUniform } from "three";
import { reference, texture } from "three/tsl";
import { WATER_CASCADE_WATER_COLOR } from "./WaterMaterialTuning";
import { createWaterCascadeNodes } from "./WaterCascadeNodes";

/**
 * The portable falling-water material.
 *
 * A curtain is lit by its own aeration far more than by the sun, and it is seen
 * from both sides, so this stays the cheap unlit double-sided transparent
 * material the shipped one is rather than joining the surface's BRDF. Every
 * value comes from the table `WaterCascadeMaterialController` writes, so the
 * clock the strands advect by cannot run twice.
 */
export class WaterCascadeNodeMaterial extends MeshBasicNodeMaterial {
  constructor(values: Record<string, IUniform>) {
    super();
    this.name = "world-water-cascade-node-material";
    this.color.set(WATER_CASCADE_WATER_COLOR);
    this.transparent = true;
    this.opacity = 1;
    this.depthWrite = false;
    this.side = DoubleSide;
    this.toneMapped = true;
    const number = (name: string) => reference("value", "float", values[name]);
    const color = (name: string) => reference("value", "color", values[name]).rgb;
    const cascade = createWaterCascadeNodes({
      time: number("uCascadeTime"),
      foamStrength: number("uCascadeFoamStrength"),
      mistStrength: number("uCascadeMistStrength"),
      detailDistance: number("uCascadeDetailDistance"),
      noise: texture(values.uCascadeNoise.value),
      noiseScale: number("uCascadeNoiseScale"),
      water: color("uCascadeWater"),
      foam: color("uCascadeFoam"),
      mist: color("uCascadeMist"),
    });
    this.colorNode = cascade.color;
    this.opacityNode = cascade.alpha;
  }
}
