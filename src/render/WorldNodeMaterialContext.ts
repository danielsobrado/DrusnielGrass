import { DirectionalLightNode, type AmbientLight, type DirectionalLight, type HemisphereLight, type Light, type Node, type NodeBuilder, type NodeMaterial } from "three/webgpu";
import { lights, positionWorld, cameraPosition, cameraViewMatrix, vec3, mix, uniform, reference, lightPosition, lightTargetDirection } from "three/tsl";
import type { WorldCloudShadowNodes } from "../world/sky/WorldCloudShadowNodes";

class CloudDirectionalLightNode extends DirectionalLightNode {
  constructor(light: DirectionalLight, private readonly scale: Node<"float">) { super(light); }
  override getHash(builder: NodeBuilder): string {
    return `${this.light?.uuid}:cloud:${this.scale.getHash(builder)}`;
  }
  override setupDirect(builder: NodeBuilder) {
    const direct = super.setupDirect(builder);
    return direct && { ...direct, lightColor: vec3(direct.lightColor as Node<"vec3">).mul(this.scale) };
  }
}

// r185 LightsNode accepts Light or LightingNode; @types/three 0.185.0 only
// declares Light[]. Keep this verified declaration gap isolated here.
const composeLights = lights as (sources: (Light | DirectionalLightNode)[]) => ReturnType<typeof lights>;

/** A streamed material receives the same light and cloud field at creation. */
export class WorldNodeMaterialContext {
  constructor(private readonly sun: DirectionalLight,
    private readonly otherLights: readonly Light[], private readonly clouds?: WorldCloudShadowNodes) {}

  directionalSurfaceLight(cloudResponseStrength = 1) {
    const color = uniform(this.sun.color).rgb.mul(reference("intensity", "float", this.sun));
    const transmittance = this.clouds?.sample(positionWorld, positionWorld.distance(cameraPosition));
    return {
      direction: lightTargetDirection(this.sun),
      color: transmittance && this.clouds
        ? color.mul(mix(1, this.clouds.relativeDirect(transmittance), cloudResponseStrength)) : color,
    };
  }

  /**
   * Ambient, hemisphere and directional irradiance for a view-space normal.
   *
   * Materials that light themselves rather than through a lighting model — the
   * grass impostor cards sum this once per card in their vertex stage — need
   * the same three terms the built-in uniform blocks carry, in the same order
   * and with the same intensity handling, or a card and the blades it replaces
   * disagree across the handoff.
   */
  vertexIrradiance(viewNormal: Node<"vec3">): Node<"vec3"> {
    let total = vec3(0) as Node<"vec3">;
    for (const light of [this.sun, ...this.otherLights]) {
      const color = uniform(light.color).rgb.mul(reference("intensity", "float", light));
      if ((light as AmbientLight).isAmbientLight) {
        total = total.add(color);
      } else if ((light as HemisphereLight).isHemisphereLight) {
        const hemisphere = light as HemisphereLight;
        const ground = uniform(hemisphere.groundColor).rgb
          .mul(reference("intensity", "float", hemisphere));
        // Three treats the light's world position as a direction here.
        const direction = cameraViewMatrix.transformDirection(lightPosition(hemisphere));
        total = total.add(mix(ground, color, viewNormal.dot(direction).mul(0.5).add(0.5)));
      } else if ((light as DirectionalLight).isDirectionalLight) {
        total = total.add(color.mul(viewNormal.dot(lightTargetDirection(light)).clamp(0, 1)));
      }
    }
    return total;
  }

  /**
   * The hemisphere fill, for materials that add their own sky-side term.
   *
   * Stones lift a downward-facing bevel out of the turf-tuned ground colour
   * with an explicit directional fill, so they need the same sky colour and
   * view-space direction the built-in uniform block carries.
   */
  hemisphereFill(): { skyColor: Node<"vec3">; direction: Node<"vec3"> } | undefined {
    const light = this.otherLights.find((candidate): candidate is HemisphereLight =>
      (candidate as HemisphereLight).isHemisphereLight === true);
    if (!light) return undefined;
    return {
      skyColor: uniform(light.color).rgb.mul(reference("intensity", "float", light)),
      direction: cameraViewMatrix.transformDirection(lightPosition(light)),
    };
  }

  applyTo(material: NodeMaterial, cloudResponseStrength = 1): void {
    let sunNode = new DirectionalLightNode(this.sun);
    if (this.clouds) {
      const transmittance = this.clouds.sample(positionWorld, positionWorld.distance(cameraPosition));
      const scale = mix(1, this.clouds.relativeDirect(transmittance), cloudResponseStrength);
      // Only the directional source is scaled. Hemisphere, ambient, IBL and
      // emissive contributions retain their original material response.
      sunNode = new CloudDirectionalLightNode(this.sun, scale);
    }
    material.lightsNode = composeLights([sunNode, ...this.otherLights]);
  }
}
