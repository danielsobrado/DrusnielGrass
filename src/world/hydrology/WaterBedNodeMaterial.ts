import { FrontSide, MeshLambertNodeMaterial } from "three/webgpu";
import type { IUniform } from "three";
import { reference, texture } from "three/tsl";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { createWaterBedNodes } from "./WaterBedNodes";

/**
 * The portable river bed material.
 *
 * It owns no hydrology state: every uniform is read from the table
 * `WaterBedMaterialController` already writes, and the geometry attributes are
 * the same packed `waterData` and `waterContext` the surface reads, so bed and
 * sheet cannot drift apart about which part of the river they are on.
 */
export class WaterBedNodeMaterial extends MeshLambertNodeMaterial {
  constructor(values: Record<string, IUniform>, context?: WorldNodeMaterialContext) {
    super();
    this.name = "world-hydrology-water-bed-node-material";
    this.color.set(0xffffff);
    this.transparent = false;
    this.opacity = 1;
    this.alphaTest = 0.01;
    this.depthTest = true;
    this.depthWrite = true;
    this.side = FrontSide;
    this.dithering = true;
    // The bed shares its sheet's geometry, lowered by the water depth, so it
    // needs the same offset the shipped material takes to stay off the surface.
    this.polygonOffset = true;
    this.polygonOffsetFactor = -1;
    this.polygonOffsetUnits = -1;
    const bed = createWaterBedNodes({
      time: reference("value", "float", values.uWaterTime),
      noise: texture(values.uWaterBedNoise.value),
      scale: reference("value", "float", values.uWaterBedScale),
      strength: reference("value", "float", values.uWaterBedStrength),
      refraction: reference("value", "float", values.uWaterBedRefraction),
      algaeStrength: reference("value", "float", values.uWaterAlgaeStrength),
      causticStrength: reference("value", "float", values.uWaterCausticStrength),
      riverReferenceDepth: reference("value", "float", values.uWaterRiverReferenceDepth),
      extinction: reference("value", "vec3", values.uWaterBedExtinction),
      pebbleDark: reference("value", "color", values.uWaterPebbleDark).rgb,
      pebbleLight: reference("value", "color", values.uWaterPebbleLight).rgb,
      sand: reference("value", "color", values.uWaterSand).rgb,
      algae: reference("value", "color", values.uWaterAlgae).rgb,
    });
    this.positionNode = bed.position;
    this.colorNode = bed.color;
    context?.applyTo(this);
  }
}
