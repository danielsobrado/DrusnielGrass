import * as THREE from "three";

/**
 * One sample of the world's submission funnel.
 *
 * `unculled` is the number that matters most here: those objects carry
 * `frustumCulled = false`, so three.js submits them no matter where the camera
 * looks. A large `unculled` share is what would justify partitioning batches
 * into spatial cells; a small one means the partitioning would add draw calls
 * to reject nothing.
 */
export interface WorldVisibilitySnapshot {
  readonly ready: boolean;
  /** Meshes reached by the traversal, before any visibility decision. */
  readonly renderables: number;
  /** Meshes that opt out of frustum culling and are always submitted. */
  readonly unculled: number;
  /** Culled meshes whose bounds intersect the frustum. */
  readonly frustumVisible: number;
  /** Culled meshes the frustum test rejects this sample. */
  readonly frustumRejected: number;
  /** Meshes skipped because three.js has not produced bounds for them yet. */
  readonly boundsPending: number;
  /** Total instances carried by instanced meshes that are submitted. */
  readonly submittedInstances: number;
  readonly drawCalls: number;
  readonly triangles: number;
  /** Cost of taking the sample itself, so the probe can be held to account. */
  readonly sampleMicroseconds: number;
}

const EMPTY: WorldVisibilitySnapshot = {
  ready: false,
  renderables: 0,
  unculled: 0,
  frustumVisible: 0,
  frustumRejected: 0,
  boundsPending: 0,
  submittedInstances: 0,
  drawCalls: 0,
  triangles: 0,
  sampleMicroseconds: 0,
};

/**
 * Measures how much of the scene actually survives culling.
 *
 * This is deliberately an observer: it never mutates geometry, never forces a
 * bounding-volume computation, and never changes what is drawn. A mesh whose
 * bounds three.js has not built yet is counted as pending rather than being
 * given bounds here, because computing them would move work into the frame the
 * probe is supposed to be measuring.
 *
 * Sampling walks the scene graph, so it is meant to run on the diagnostics HUD
 * cadence rather than every frame.
 */
export class WorldVisibilityProbe {
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private snapshot: WorldVisibilitySnapshot = EMPTY;

  getSnapshot(): WorldVisibilitySnapshot {
    return this.snapshot;
  }

  /**
   * Takes one sample against the camera that just rendered.
   *
   * `info` is read after the render call, so the draw-call and triangle counts
   * describe the frame the traversal is classifying rather than the previous
   * one.
   */
  sample(
    scene: THREE.Scene,
    camera: THREE.Camera,
    info: THREE.WebGLRenderer["info"],
  ): WorldVisibilitySnapshot {
    const started = performance.now();
    this.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.viewProjection);

    let renderables = 0;
    let unculled = 0;
    let frustumVisible = 0;
    let frustumRejected = 0;
    let boundsPending = 0;
    let submittedInstances = 0;

    scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) {
        return;
      }
      renderables += 1;
      const instances = instanceCount(mesh);

      if (mesh.frustumCulled === false) {
        unculled += 1;
        submittedInstances += instances;
        return;
      }

      const bounds = mesh.geometry?.boundingSphere;
      if (!bounds) {
        // Not yet computed by three.js. Counting it as submitted keeps the
        // funnel conservative rather than flattering.
        boundsPending += 1;
        submittedInstances += instances;
        return;
      }

      this.sphere.copy(bounds).applyMatrix4(mesh.matrixWorld);
      if (this.frustum.intersectsSphere(this.sphere)) {
        frustumVisible += 1;
        submittedInstances += instances;
        return;
      }
      frustumRejected += 1;
    });

    this.snapshot = {
      ready: true,
      renderables,
      unculled,
      frustumVisible,
      frustumRejected,
      boundsPending,
      submittedInstances,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      sampleMicroseconds: (performance.now() - started) * 1000,
    };
    return this.snapshot;
  }
}

function instanceCount(mesh: THREE.Mesh): number {
  const instanced = mesh as Partial<THREE.InstancedMesh>;
  return instanced.isInstancedMesh === true ? (instanced.count ?? 0) : 1;
}
