import * as THREE from "three";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import { disposeResources } from "../../render/ResourceDisposal";
import {
  WORLD_ZELDA_EXPOSURE,
} from "../../app/WorldEnvironmentTuning";
import { WORLD_CLOUD_TIME_WRAP_SECONDS } from "./WorldCloudWeather";
import { WorldSkyCloudVolumeController } from "./WorldSkyCloudVolumeController";
import {
  configureWorldSkyClouds,
  createWorldSkyMaterial,
  disableWorldSkyCloudsForEnvironmentBake,
} from "./WorldSkyMaterial";

const SKY_RADIUS = 4000;
const VERTEX_SHADER = /* glsl */ `
varying vec3 vSkyDirection;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  // Keep the celestial direction camera-relative so the horizon and sun do not
  // parallax while the player crosses the streamed world.
  vSkyDirection = worldPosition.xyz - cameraPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Painterly sky dome plus an IBL bake for standard/physical materials.
 *
 * Compact profiles keep the analytic dome. Desktop can add the low-resolution
 * temporally reprojected volume owned by WorldSkyCloudVolumeController.
 */
export class WorldSky {
  private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly environmentEnabled: boolean;
  private environmentTarget?: THREE.WebGLRenderTarget;
  private cloudVolume?: WorldSkyCloudVolumeController;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    profile: RuntimeProfile,
  ) {
    this.mesh = createSkyMesh(this.scene);
    this.environmentEnabled = !profile.compact;
    try {
      configureWorldSkyClouds(this.mesh.material, profile);
      this.cloudVolume = new WorldSkyCloudVolumeController(
        this.scene,
        this.renderer,
        this.mesh,
        profile,
      );
      this.scene.background = null;
      this.renderer.toneMappingExposure = WORLD_ZELDA_EXPOSURE;

      if (this.environmentEnabled) {
        this.initializeEnvironment();
        this.renderer.domElement.addEventListener(
          "webglcontextrestored",
          this.handleContextRestored,
        );
      }
    } catch (error) {
      try {
        this.dispose();
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Sky constructor rollback failed.",
          cleanupError,
        );
      }
      throw error;
    }
  }

  update(elapsedSeconds: number, focus: THREE.Vector3): void {
    if (this.disposed) {
      return;
    }
    const safeTime =
      Math.max(0, elapsedSeconds) % WORLD_CLOUD_TIME_WRAP_SECONDS;
    this.mesh.material.uniforms.uTime.value = safeTime;
    const worldOffset = this.mesh.material.uniforms.uCloudWorldOffset
      .value as THREE.Vector2;
    worldOffset.set(focus.x, focus.z);
    this.cloudVolume?.update(safeTime);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
    );
    const cloudVolume = this.cloudVolume;
    this.cloudVolume = undefined;
    if (cloudVolume) {
      cloudVolume.dispose();
    }
    const environmentTarget = this.environmentTarget;
    this.environmentTarget = undefined;
    if (
      environmentTarget &&
      this.scene.environment === environmentTarget.texture
    ) {
      this.scene.environment = null;
    }
    disposeResources([
      { dispose: () => this.mesh.removeFromParent() },
      this.mesh.geometry,
      this.mesh.material,
      environmentTarget,
    ]);
  }

  private readonly handleContextRestored = (): void => {
    if (this.disposed || !this.environmentEnabled) {
      return;
    }
    this.cloudVolume?.resetHistory();
    const previousTarget = this.environmentTarget;
    this.environmentTarget = undefined;
    if (
      previousTarget &&
      this.scene.environment === previousTarget.texture
    ) {
      this.scene.environment = null;
    }
    if (previousTarget) {
      try {
        previousTarget.dispose();
      } catch (error) {
        console.warn(
          "[Drusniel World] Restored sky environment cleanup failed.",
          error,
        );
      }
    }
    this.initializeEnvironment();
  };

  private initializeEnvironment(): void {
    let environmentTarget: THREE.WebGLRenderTarget | undefined;
    let pmrem: THREE.PMREMGenerator | undefined;
    let bakeMaterial: THREE.ShaderMaterial | undefined;
    try {
      pmrem = new THREE.PMREMGenerator(this.renderer);
      const bakeScene = new THREE.Scene();
      const bakeMesh = new THREE.Mesh(
        this.mesh.geometry,
        this.mesh.material.clone(),
      );
      bakeMaterial = bakeMesh.material;
      disableWorldSkyCloudsForEnvironmentBake(bakeMaterial);
      bakeScene.add(bakeMesh);
      environmentTarget = pmrem.fromScene(bakeScene, 0, 0.1, SKY_RADIUS);
      this.scene.environment = environmentTarget.texture;
      this.environmentTarget = environmentTarget;
    } catch (error) {
      if (
        environmentTarget &&
        this.scene.environment === environmentTarget.texture
      ) {
        this.scene.environment = null;
      }
      try {
        disposeResources([environmentTarget]);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Sky environment cleanup failed.",
          cleanupError,
        );
      }
      console.warn(
        "[Drusniel World] Sky environment bake unavailable; continuing without IBL.",
        error,
      );
    } finally {
      if (bakeMaterial) {
        try {
          bakeMaterial.dispose();
        } catch (cleanupError) {
          console.warn(
            "[Drusniel World] Sky bake material cleanup failed.",
            cleanupError,
          );
        }
      }
      if (pmrem) {
        try {
          pmrem.dispose();
        } catch (cleanupError) {
          console.warn(
            "[Drusniel World] Sky PMREM generator cleanup failed.",
            cleanupError,
          );
        }
      }
    }
  }
}

function createSkyMesh(
  scene: THREE.Scene,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  let material: THREE.ShaderMaterial | undefined;
  let geometry: THREE.SphereGeometry | undefined;
  let mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | undefined;
  try {
    material = createWorldSkyMaterial(VERTEX_SHADER);
    geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 900;
    mesh.name = "world-sky-dome";
    scene.add(mesh);
    return mesh;
  } catch (error) {
    try {
      disposeResources([
        { dispose: () => mesh?.removeFromParent() },
        geometry,
        material,
      ]);
    } catch (cleanupError) {
      console.warn(
        "[Drusniel World] Sky construction cleanup failed.",
        cleanupError,
      );
    }
    throw error;
  }
}
