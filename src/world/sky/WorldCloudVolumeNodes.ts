import { Color, Matrix4, MeshBasicNodeMaterial, Vector3 } from "three/webgpu";
import { Fn, If, Loop, Break, float, vec2, vec3, vec4, uniform, uv,
  getViewPosition, screenCoordinate, screenSize, max, mix, smoothstep } from "three/tsl";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { WorldLightingState } from "../../render/WorldLightingState";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
import { cloudValueNoiseNode, createCloudFieldNodes } from "./WorldCloudFieldNodes";

/** Raster raymarch, with the legacy strata, optical model and early-out gates. */
export function createWorldCloudVolumeNodes(
  profile: RuntimeProfile,
  steps: number,
  lighting?: WorldLightingState,
) {
  const cloud = profile.cloud;
  // The shipped volume pass never defines WORLD_CLOUD_COMPACT: its density
  // field has three octaves even when compact settings supply the parameters.
  // Only analytic sky and shadow-map passes use the compact two-octave field.
  const field = createCloudFieldNodes(cloud, false);
  if (lighting) field.coverage.value = lighting.cloudThreshold;
  const inverseProjection = uniform(new Matrix4());
  const cameraWorld = uniform(new Matrix4());
  const cameraPosition = uniform(new Vector3());
  const sun = uniform(lighting?.sunDirection ?? new Vector3(...WORLD_SUN_DIRECTION).normalize());
  const frameIndex = uniform(0);
  const ambient = uniform(new Color(cloud.ambientColor));
  const shadow = uniform(new Color(cloud.shadowColor));
  const sunlit = uniform(new Color(cloud.sunlitColor));
  const material = new MeshBasicNodeMaterial({ depthWrite: false, depthTest: false, toneMapped: false });
  material.name = "world-cloud-volume";
  material.fragmentNode = Fn(() => {
    const view = getViewPosition(uv(), float(1), inverseProjection).normalize();
    const ray = cameraWorld.mul(vec4(view, 0)).xyz.normalize().toVar();
    const output = vec4(0).toVar();
    If(ray.y.greaterThan(0.025), () => {
      const base = float(cloud.baseHeight).sub(cameraPosition.y).div(max(ray.y, 0.0001)).toVar();
      const top = float(cloud.baseHeight + cloud.thickness).sub(cameraPosition.y).div(max(ray.y, 0.0001));
      If(top.greaterThan(0).and(base.lessThanEqual(18000)), () => {
        base.assign(max(base, 0));
        const previewAt = (fraction: number) => field.density(cameraPosition.add(ray.mul(mix(base, top, fraction))).xz).x;
        const preview = previewAt(0.5).toVar();
        If(ray.y.lessThan(0.35), () => { preview.assign(max(preview, max(previewAt(0.2), previewAt(0.8)))); });
        If(preview.greaterThan(0.0015), () => {
          const segment = top.sub(base).div(steps);
          const transmittance = float(1).toVar();
          const radiance = vec3(0).toVar();
          const pixel = vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y));
          Loop(steps, ({ i }) => {
            const ordinal = float(i);
            const rotation = frameIndex.mul(0.61803398875).add(ordinal.mul(0.75487766625));
            const jitter = pixel.x.add(ordinal.mul(47)).mul(0.06711056)
              .add(pixel.y.add(ordinal.mul(89)).mul(0.00583715)).add(rotation).fract().mul(52.9829189).fract();
            const distance = base.add(ordinal.add(mix(0.06, 0.94, jitter)).mul(segment));
            const world = cameraPosition.add(ray.mul(distance));
            const height = world.y.sub(cloud.baseHeight).div(Math.max(cloud.thickness, 0.0001));
            const sample = field.density(world.xz).toVar();
            const density = sample.x.mul(field.verticalProfile(world.xz, height)).toVar();
            If(density.greaterThan(0.003), () => {
              const optical = density.mul(cloud.extinction).mul(segment.div(Math.max(cloud.thickness, 1)));
              const alpha = optical.negate().exp().oneMinus();
              const sunward = sun.xz.mul(float(cloud.thickness).div(max(sun.y, 0.15)));
              const sunwardUv = world.xz.add(sunward).add(field.wind.mul(field.time)).mul(field.macroScale);
              const threshold = field.coverage.add(sample.y.negate().add(0.5).mul(0.11));
              const selfShadow = density.mul(cloud.selfShadowStrength)
                .mul(smoothstep(threshold.sub(field.softness), threshold.add(field.softness), cloudValueNoiseNode(sunwardUv)));
              const shadowMix = smoothstep(0.66, 0.90, sample.y).mul(0.14)
                .add(smoothstep(0.86, 0.98, sample.y).mul(0.07)).add(selfShadow).add(0.24).clamp(0.22, 0.64);
              const silver = density.mul(density.oneMinus()).mul(smoothstep(0.36, 0.78, sample.z));
              const sunLift = max(ray.dot(sun), 0).pow(3).mul(0.20).mul(selfShadow.mul(0.68).oneMinus())
                .add(silver.mul(cloud.silverLiningStrength));
              const sampleColor = mix(mix(ambient, shadow, shadowMix), sunlit, sunLift.clamp(0, 0.86));
              radiance.addAssign(transmittance.mul(sampleColor).mul(alpha));
              transmittance.mulAssign(alpha.oneMinus());
              If(transmittance.lessThanEqual(0.025), () => { Break(); });
            });
          });
          const opacity = smoothstep(0.035, 0.16, ray.y).mul(cloud.opacity);
          output.assign(vec4(radiance.mul(opacity), transmittance.oneMinus().mul(opacity)));
        });
      });
    });
    return output;
  })();
  return { material, field, inverseProjection, cameraWorld, cameraPosition, frameIndex, sun };
}
