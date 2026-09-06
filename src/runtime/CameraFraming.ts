import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RuntimeProfile } from "./RuntimeConfig";

const MIN_CAMERA_NEAR = 0.1;
const FAR_DISTANCE_MULTIPLIER = 10;
const MIN_DISTANCE_MULTIPLIER = 0.55;
const MAX_DISTANCE_MULTIPLIER = 6;
const TARGET_HEIGHT_RATIO = 0.08;

export function frameCameraToBounds(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: THREE.Box3,
  profile: RuntimeProfile,
): void {
  if (bounds.isEmpty()) {
    return;
  }

  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.max(0.1, Math.min(verticalFov, horizontalFov));
  const distance =
    (sphere.radius / Math.sin(limitingFov / 2)) * profile.cameraMargin;
  const viewDirection = new THREE.Vector3(
    -1,
    profile.cameraElevation,
    -1,
  ).normalize();
  const target = sphere.center.clone();
  target.y += sphere.radius * TARGET_HEIGHT_RATIO;

  camera.position.copy(target).addScaledVector(viewDirection, distance);
  camera.near = Math.max(MIN_CAMERA_NEAR, distance / 200);
  camera.far = Math.max(1000, distance * FAR_DISTANCE_MULTIPLIER);
  camera.updateProjectionMatrix();

  controls.target.copy(target);
  controls.minDistance = sphere.radius * MIN_DISTANCE_MULTIPLIER;
  controls.maxDistance = sphere.radius * MAX_DISTANCE_MULTIPLIER;
  controls.update();
}
