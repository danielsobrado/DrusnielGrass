import { Color, MeshLambertNodeMaterial, Vector2, Vector3 } from "three/webgpu";
import { attribute, uniform, varying, vec3, vec4, modelWorldMatrix, normalLocal,
  max, mix, smoothstep, texture } from "three/tsl";
import type { WorldHorizonCoverage } from "./WorldHorizonCoverage";
import { WORLD_HORIZON_SINK_DEPTH } from "./WorldHorizonTuning";
import { WORLD_HORIZON_APRON_HAZE_DISTANCE } from "./WorldHorizonShader";
import { WORLD_SKY_HAZE, WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";

/** TSL equivalent of WorldHorizonMaterial; coverage remains CPU-owned. */
export class WorldHorizonNodeMaterial {
  readonly material = new MeshLambertNodeMaterial();
  private readonly sinkFocus = uniform(new Vector2());

  constructor(ringGuaranteedRadius: number, ringOuterRadius: number,
    worldHalfExtent: number, coverage: WorldHorizonCoverage) {
    const position = attribute<"vec3">("position", "vec3");
    const toFocus = position.xz.sub(this.sinkFocus).abs();
    const ringDistance = max(toFocus.x, toFocus.y);
    const buried = smoothstep(ringGuaranteedRadius, ringOuterRadius, ringDistance).oneMinus();
    this.material.positionNode = vec3(position.x,
      position.y.sub(buried.mul(WORLD_HORIZON_SINK_DEPTH)), position.z);
    const outsideWorld = max(max(position.x.abs(), position.z.abs()).sub(worldHalfExtent), 0);
    const apronHaze = varying(smoothstep(0, WORLD_HORIZON_APRON_HAZE_DISTANCE, outsideWorld));
    const worldNormal = modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz.normalize();
    const sunDirection = uniform(new Vector3(...WORLD_SUN_DIRECTION).normalize());
    const faceGrade = varying(mix(0.88, 1.04, smoothstep(-0.15, 0.35, worldNormal.dot(sunDirection))));
    const grade = mix(faceGrade, 1, apronHaze.mul(0.85));
    this.material.colorNode = mix(attribute<"vec3">("color", "vec3").mul(grade),
      uniform(new Color(WORLD_SKY_HAZE)), apronHaze.mul(0.42));
    const worldXZ = varying(position.xz);
    const coverageUv = worldXZ.add(coverage.worldHalfExtent).div(coverage.worldSize);
    const inside = coverageUv.x.greaterThanEqual(0).and(coverageUv.y.greaterThanEqual(0))
      .and(coverageUv.x.lessThan(1)).and(coverageUv.y.lessThan(1));
    const covered = inside.and(texture(coverage.texture, coverageUv).r.greaterThan(0.5));
    this.material.opacityNode = covered.select(0, 1);
    this.material.alphaTest = 0.5;
    this.material.name = "world-horizon-material";
    this.material.dithering = true;
  }

  update(focus: Vector3): void { this.sinkFocus.value.set(focus.x, focus.z); }
  dispose(): void { this.material.dispose(); }
}
