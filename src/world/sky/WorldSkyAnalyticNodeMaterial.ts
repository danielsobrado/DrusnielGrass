import { BackSide, Color, MeshBasicNodeMaterial, Vector2, Vector3, type Texture } from "three/webgpu";
import { Fn, uniform, positionWorld, cameraPosition, vec2, vec3, max, mix, smoothstep, If, texture, screenUV } from "three/tsl";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { WorldLightingState } from "../../render/WorldLightingState";
import { WORLD_SKY_HAZE, WORLD_SKY_HORIZON, WORLD_SKY_SUN, WORLD_SKY_ZENITH,
  WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
import { cloudValueNoiseNode, createCloudFieldNodes } from "./WorldCloudFieldNodes";

const DEFAULT_DISK_POWER = 10000;

/** Analytic sky path, preserving the existing compact and non-volume equations. */
export class WorldSkyAnalyticNodeMaterial {
  readonly material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  readonly sunDirection;
  readonly zenith;
  readonly horizon;
  readonly haze;
  readonly sunHaloColor;
  readonly sunDiskColor;
  readonly worldOffset = uniform(new Vector2());
  readonly cloudsEnabled = uniform(1);
  readonly field;
  readonly volumeMap;
  private readonly haloPower = uniform(28);
  private readonly diskStart = uniform(0.9992);
  private readonly diskEnd = uniform(0.99985);

  constructor(profile: RuntimeProfile, volumeTexture?: Texture, lighting?: WorldLightingState) {
    this.volumeMap = volumeTexture ? texture(volumeTexture) : undefined;
    this.sunDirection = uniform(lighting?.sunDirection ?? new Vector3(...WORLD_SUN_DIRECTION).normalize());
    this.zenith = uniform(lighting?.skyZenithColor ?? new Color(WORLD_SKY_ZENITH));
    this.horizon = uniform(lighting?.skyHorizonColor ?? new Color(WORLD_SKY_HORIZON));
    this.haze = uniform(lighting?.skyHazeColor ?? new Color(WORLD_SKY_HAZE));
    this.sunHaloColor = uniform(lighting?.skySunHaloColor ?? new Color(WORLD_SKY_SUN));
    this.sunDiskColor = uniform(lighting?.skySunDiskColor ?? new Color(WORLD_SKY_SUN));
    const cloud = profile.cloud;
    const field = this.field = createCloudFieldNodes(cloud, profile.compact);
    const baseHeight = uniform(cloud.baseHeight);
    const thickness = uniform(cloud.thickness);
    const extinction = uniform(cloud.extinction);
    const opacity = uniform(cloud.opacity);
    const selfShadowStrength = uniform(cloud.selfShadowStrength);
    const silverStrength = uniform(cloud.silverLiningStrength);
    const ambient = uniform(new Color(cloud.ambientColor));
    const shadow = uniform(new Color(cloud.shadowColor));
    const sunlit = uniform(new Color(cloud.sunlitColor));
    const rayStrength = uniform(cloud.godRayStrength);
    this.cloudsEnabled.value = cloud.enabled ? 1 : 0;
    if (lighting) this.applyLightingState(lighting);
    this.material.name = "world-sky-dome";
    this.material.colorNode = Fn(() => {
      const direction = positionWorld.sub(cameraPosition).normalize();
      const height = direction.y;
      const sunFacing = max(direction.dot(this.sunDirection), 0);
      const color = mix(this.horizon, this.zenith, smoothstep(-0.04, 0.62, height)).toVar();
      color.assign(mix(this.haze, color, smoothstep(-0.18, 0.14, height)));
      color.addAssign(this.sunHaloColor.mul(sunFacing.pow(this.haloPower).mul(0.42)));
      color.addAssign(this.sunDiskColor.mul(
        smoothstep(this.diskStart, this.diskEnd, sunFacing).mul(1.65),
      ));
      If(this.cloudsEnabled.greaterThan(0.5).and(height.greaterThan(0.015)), () => {
        const horizonFade = smoothstep(0.025, 0.18, height);
        if (this.volumeMap) {
          const volume = this.volumeMap.sample(screenUV);
          color.assign(color.mul(volume.a.oneMinus()).add(volume.rgb));
          if (cloud.godRays) {
            const tangent = this.sunDirection.cross(vec3(0, 1, 0)).add(vec3(0.0001)).normalize();
            const bitangent = this.sunDirection.cross(tangent).normalize();
            const local = vec2(direction.dot(tangent), direction.dot(bitangent));
            const broad = cloudValueNoiseNode(local.mul(18).add(vec2(7.3, -11.7)).add(0.31));
            const rotated = vec2(local.x.mul(0.8).sub(local.y.mul(0.6)), local.x.mul(0.6).add(local.y.mul(0.8)));
            const fine = cloudValueNoiseNode(rotated.mul(37).add(vec2(-19.1, 5.7)).sub(0.31 * 0.37));
            const shaft = smoothstep(0.52, 0.82, broad.mul(0.68).add(fine.mul(0.32)));
            const edge = volume.a.mul(volume.a.oneMinus()).mul(2.4).add(0.35);
            color.addAssign(this.sunHaloColor.mul(sunFacing.pow(7)).mul(volume.a.oneMinus())
              .mul(shaft).mul(edge).mul(horizonFade).mul(rayStrength));
          }
          return;
        }
        const world = this.worldOffset.add(direction.xz.mul(baseHeight.div(max(height, 0.075))));
        const sample = field.density(world).toVar();
        const density = sample.x;
        const weather = sample.y;
        const detail = sample.z;
        const alpha = density.mul(extinction).negate().exp().oneMinus().mul(opacity).mul(horizonFade);
        const silver = density.mul(density.oneMinus()).mul(smoothstep(0.38, 0.78, detail));
        const selfShadow = density.mul(selfShadowStrength).mul(profile.compact ? 0.35 : 1).toVar();
        if (!profile.compact) {
          const sunwardOffset = this.sunDirection.xz.mul(thickness.div(max(this.sunDirection.y, 0.15)));
          const sunwardUv = world.add(sunwardOffset).add(field.wind.mul(field.time)).mul(field.macroScale);
          const threshold = field.coverage.add(weather.negate().add(0.5).mul(0.11));
          selfShadow.mulAssign(smoothstep(threshold.sub(field.softness), threshold.add(field.softness),
            cloudValueNoiseNode(sunwardUv)));
        }
        const shadowMix = smoothstep(0.66, 0.90, weather).mul(0.14)
          .add(smoothstep(0.86, 0.98, weather).mul(0.06)).add(selfShadow).add(0.26).clamp(0.24, 0.62);
        const sunLift = sunFacing.pow(3).mul(0.22).mul(selfShadow.mul(0.65).oneMinus())
          .add(silver.mul(silverStrength));
        const cloudColor = mix(mix(ambient, shadow, shadowMix), sunlit, sunLift.clamp(0, 0.84));
        const hazyCloud = mix(cloudColor, this.haze, smoothstep(0.025, 0.13, height).oneMinus().mul(0.72));
        color.assign(mix(color, hazyCloud, alpha));
        if (cloud.godRays) {
          const tangent = this.sunDirection.cross(vec3(0, 1, 0)).add(vec3(0.0001)).normalize();
          const bitangent = this.sunDirection.cross(tangent).normalize();
          const local = vec2(direction.dot(tangent), direction.dot(bitangent));
          const seed = detail.mul(0.73).add(0.19);
          const broad = cloudValueNoiseNode(local.mul(18).add(vec2(7.3, -11.7)).add(seed));
          const rotated = vec2(local.x.mul(0.8).sub(local.y.mul(0.6)), local.x.mul(0.6).add(local.y.mul(0.8)));
          const fine = cloudValueNoiseNode(rotated.mul(37).add(vec2(-19.1, 5.7)).sub(seed.mul(0.37)));
          const shaft = smoothstep(0.50, 0.80, broad.mul(0.68).add(fine.mul(0.32)));
          const godRay = sunFacing.pow(7).mul(density.oneMinus()).mul(shaft)
            .mul(silver.mul(2.4).add(0.35)).mul(horizonFade);
          color.addAssign(this.sunHaloColor.mul(godRay).mul(rayStrength));
        }
      });
      return color;
    })();
  }

  applyLightingState(lighting: WorldLightingState): void {
    this.field.coverage.value = lighting.cloudThreshold;
    this.haloPower.value = Math.max(1, lighting.skyHaloPower);
    const diskPower = Math.max(10, lighting.skyDiskPower || DEFAULT_DISK_POWER);
    this.diskStart.value = Math.max(0.9, Math.min(0.9998, 1 - 8 / diskPower));
    this.diskEnd.value = Math.max(
      this.diskStart.value + 0.00001,
      Math.min(0.99998, 1 - 1.5 / diskPower),
    );
  }

  update(elapsedSeconds: number, focus: Vector3): void {
    this.field.time.value = Math.max(0, elapsedSeconds) % 86400;
    this.worldOffset.value.set(focus.x, focus.z);
  }

  dispose(): void { this.material.dispose(); }
}
