import { DirectionalLightNode, type AmbientLight, type Color, type DirectionalLight, type HemisphereLight, type Light, type Node, type NodeBuilder, type NodeMaterial, type Vector3 } from "three/webgpu";
import { lights, positionWorld, cameraPosition, cameraViewMatrix, vec3, mix, uniform, reference, lightPosition, lightTargetDirection } from "three/tsl";
import type { WorldCloudShadowNodes } from "../world/sky/WorldCloudShadowNodes";
import type { WorldRainUniforms } from "../world/weather/WorldRainUniforms";
import type { WorldWetness } from "../world/weather/WorldWetness";
import type { WorldWindUniforms } from "../world/weather/WorldWindUniforms";
import type { WorldLightingState } from "./WorldLightingState";

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

const composeLights = lights as (sources: (Light | DirectionalLightNode)[]) => ReturnType<typeof lights>;

/** Shared per-world render state borrowed by every streamed node material. */
export class WorldNodeMaterialContext {
  private wind?: WorldWindUniforms;
  private rain?: WorldRainUniforms;
  private wetness?: WorldWetness;

  constructor(private readonly sun: DirectionalLight,
    private readonly otherLights: readonly Light[], private readonly clouds?: WorldCloudShadowNodes,
    private readonly lighting?: WorldLightingState) {}

  worldSunDirection(): Vector3 | undefined {
    return this.lighting?.sunDirection;
  }

  worldHazeColor(): Color | undefined {
    return this.lighting?.skyHazeColor;
  }

  setWorldWindUniforms(wind: WorldWindUniforms | undefined): void {
    this.wind = wind;
  }

  worldWindUniforms(): WorldWindUniforms | undefined {
    return this.wind;
  }

  setWorldPrecipitation(rain: WorldRainUniforms | undefined, wetness: WorldWetness | undefined): void {
    this.rain = rain;
    this.wetness = wetness;
  }

  worldRainUniforms(): WorldRainUniforms | undefined {
    return this.rain;
  }

  worldWetness() {
    return this.wetness?.uniform;
  }

  directionalSurfaceLight(cloudResponseStrength = 1) {
    const color = uniform(this.sun.color).rgb.mul(reference("intensity", "float", this.sun));
    const transmittance = this.clouds?.sample(positionWorld, positionWorld.distance(cameraPosition));
    return {
      direction: lightTargetDirection(this.sun),
      color: transmittance && this.clouds
        ? color.mul(mix(1, this.clouds.relativeDirect(transmittance), cloudResponseStrength)) : color,
    };
  }

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
        const direction = cameraViewMatrix.transformDirection(lightPosition(hemisphere));
        total = total.add(mix(ground, color, viewNormal.dot(direction).mul(0.5).add(0.5)));
      } else if ((light as DirectionalLight).isDirectionalLight) {
        total = total.add(color.mul(viewNormal.dot(lightTargetDirection(light)).clamp(0, 1)));
      }
    }
    return total;
  }

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
      sunNode = new CloudDirectionalLightNode(this.sun, scale);
    }
    material.lightsNode = composeLights([sunNode, ...this.otherLights]);
  }
}
