import * as THREE from "three";
import type { WorldHorizonCoverage } from "./WorldHorizonCoverage";
import { WORLD_HORIZON_SINK_DEPTH } from "./WorldHorizonTuning";
import {
  WORLD_SKY_HAZE,
  WORLD_SUN_DIRECTION,
} from "../../app/WorldEnvironmentTuning";
import {
  WORLD_HORIZON_APRON_HAZE_DISTANCE,
  WORLD_HORIZON_COVERAGE_DISCARD,
  WORLD_HORIZON_FACE_GRADE,
  WORLD_HORIZON_FRAGMENT,
  WORLD_HORIZON_POSITION,
  WORLD_HORIZON_VERTEX,
} from "./WorldHorizonShader";

const MATERIAL_CACHE_KEY = "world-horizon-shell-v5";
const HORIZON_SUN_DIRECTION = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();
const HORIZON_HAZE_COLOR = new THREE.Color(WORLD_SKY_HAZE);

/**
 * Cheap far-terrain material with exact streamed-chunk ownership.
 *
 * The vertical sink remains as a fallback around chunks that are still being
 * built. Once a detailed chunk is resident, the coverage mask prevents the
 * coarse shell from rasterizing beneath it at all. This removes mountain
 * poke-through without increasing horizon tessellation or global sink depth.
 */
export class WorldHorizonMaterial {
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly sinkFade = new THREE.Vector2();
  private readonly sinkFocus = new THREE.Vector2();

  constructor(
    ringGuaranteedRadius: number,
    ringOuterRadius: number,
    worldHalfExtent: number,
    coverage: WorldHorizonCoverage,
  ) {
    this.sinkFade.set(ringGuaranteedRadius, ringOuterRadius);
    this.material.name = "world-horizon-material";
    this.material.dithering = true;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uHorizonSinkDepth = { value: WORLD_HORIZON_SINK_DEPTH };
      shader.uniforms.uHorizonSinkFade = { value: this.sinkFade };
      shader.uniforms.uHorizonSinkFocus = { value: this.sinkFocus };
      shader.uniforms.uHorizonSunDirection = { value: HORIZON_SUN_DIRECTION };
      shader.uniforms.uHorizonWorldHalfExtent = { value: worldHalfExtent };
      shader.uniforms.uHorizonApronHazeDistance = {
        value: WORLD_HORIZON_APRON_HAZE_DISTANCE,
      };
      shader.uniforms.uHorizonHazeColor = { value: HORIZON_HAZE_COLOR };
      shader.uniforms.uTerrainCoverage = { value: coverage.texture };
      shader.uniforms.uTerrainCoverageHalfExtent = {
        value: coverage.worldHalfExtent,
      };
      shader.uniforms.uTerrainCoverageWorldSize = { value: coverage.worldSize };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>${WORLD_HORIZON_VERTEX}`)
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>${WORLD_HORIZON_POSITION}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>${WORLD_HORIZON_FRAGMENT}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>${WORLD_HORIZON_FACE_GRADE}`,
        )
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>${WORLD_HORIZON_COVERAGE_DISCARD}`,
        );
    };
    this.material.customProgramCacheKey = () => MATERIAL_CACHE_KEY;
    this.material.needsUpdate = true;
  }

  update(focus: THREE.Vector3): void {
    this.sinkFocus.set(focus.x, focus.z);
  }

  dispose(): void {
    this.material.dispose();
  }
}
