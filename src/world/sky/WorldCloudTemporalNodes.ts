import { Matrix4, MeshBasicNodeMaterial, Vector3, type Texture } from "three/webgpu";
import { Fn, If, float, vec2, vec3, vec4, uniform, texture, uv, getViewPosition,
  max, mix, smoothstep } from "three/tsl";
import type { RuntimeCloudConfig } from "../../runtime/RuntimeConfig";

export function createWorldCloudTemporalNodes(cloud: RuntimeCloudConfig, current: Texture, history: Texture) {
  const currentMap = texture(current), historyMap = texture(history);
  const inverseProjection = uniform(new Matrix4()), cameraWorld = uniform(new Matrix4());
  const previousViewProjection = uniform(new Matrix4()), cameraPosition = uniform(new Vector3());
  const delta = uniform(0), historyValid = uniform(0);
  const material = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
  material.name = "world-cloud-temporal-resolve";
  material.fragmentNode = Fn(() => {
    const currentCloud = currentMap.sample(uv()).toVar();
    const result = currentCloud.toVar();
    If(historyValid.greaterThanEqual(0.5), () => {
      const view = getViewPosition(uv(), float(1), inverseProjection).normalize();
      const ray = cameraWorld.mul(vec4(view, 0)).xyz.normalize();
      const height = float(cloud.baseHeight + cloud.thickness * 0.5).sub(cameraPosition.y);
      If(ray.y.greaterThan(0.025).and(height.greaterThan(0)), () => {
        const parcel = cameraPosition.add(ray.mul(height.div(ray.y)))
          .add(vec3(float(cloud.windX).mul(delta), 0, float(cloud.windZ).mul(delta)));
        const previousClip = previousViewProjection.mul(vec4(parcel, 1));
        If(previousClip.w.greaterThan(0.0001), () => {
          const ndc = previousClip.xy.div(previousClip.w).mul(0.5).add(0.5);
          const previousUv = vec2(ndc.x, ndc.y.oneMinus());
          const inside = previousUv.x.greaterThan(0).and(previousUv.y.greaterThan(0))
            .and(previousUv.x.lessThan(1)).and(previousUv.y.lessThan(1));
          If(inside, () => {
            const old = historyMap.sample(previousUv);
            const alphaDifference = currentCloud.a.sub(old.a).abs();
            const colorDifference = currentCloud.rgb.sub(old.rgb).length();
            const rejection = max(smoothstep(0.055, 0.22, alphaDifference), smoothstep(0.08, 0.30, colorDifference));
            const blend = rejection.oneMinus().mul(cloud.temporalBlend)
              .mul(mix(0.58, 1, smoothstep(0.045, 0.18, ray.y)));
            result.assign(mix(currentCloud, old, blend));
          });
        });
      });
    });
    return result;
  })();
  return { material, currentMap, historyMap, inverseProjection, cameraWorld, previousViewProjection,
    cameraPosition, delta, historyValid };
}
