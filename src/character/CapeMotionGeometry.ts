import * as THREE from "three";
import {
  CAPE_BOUNDS_PADDING,
  CAPE_FLUTTER_FREQUENCY,
  CAPE_FLUTTER_HORIZONTAL_VARIATION,
  CAPE_FLUTTER_PHASE_SPREAD,
  CAPE_FLUTTER_STRENGTH,
  CAPE_GEOMETRY_UPDATE_EPSILON,
} from "./CapeMotionTuning";

const TWO_PI = Math.PI * 2;

interface CapePanelState {
  readonly geometry: THREE.BufferGeometry;
  readonly position: THREE.BufferAttribute;
  readonly basePositions: Float32Array;
  readonly weights: Float32Array;
  readonly phase: number;
  readonly flexScale: number;
  readonly lateralScale: number;
}

export class CapeMotionGeometry {
  private readonly panels: CapePanelState[];
  private previousBendX = Number.NaN;
  private previousBendZ = Number.NaN;
  private previousFlutterAmplitude = Number.NaN;

  constructor(
    back: THREE.Object3D,
    left: THREE.Object3D,
    right: THREE.Object3D,
  ) {
    this.panels = [
      ...collectPanels(back, 0, 1, 0.55),
      ...collectPanels(left, Math.PI * 0.7, 0.88, 1),
      ...collectPanels(right, Math.PI * 1.3, 0.88, 1),
    ];
  }

  update(
    elapsedSeconds: number,
    bendX: number,
    bendZ: number,
    flutterAmplitude: number,
  ): void {
    if (!this.shouldUpdate(bendX, bendZ, flutterAmplitude)) {
      return;
    }

    const flutterTime = elapsedSeconds * CAPE_FLUTTER_FREQUENCY * TWO_PI;
    for (const panel of this.panels) {
      const values = panel.position.array as Float32Array;
      for (let index = 0; index < panel.position.count; index += 1) {
        const offset = index * 3;
        const baseX = panel.basePositions[offset];
        const baseY = panel.basePositions[offset + 1];
        const baseZ = panel.basePositions[offset + 2];
        const weight = panel.weights[index];
        const smoothWeight = weight * weight * (3 - 2 * weight);
        const angleX = bendX * panel.flexScale * smoothWeight;
        const angleZ = bendZ * panel.lateralScale * smoothWeight;
        const cosineX = Math.cos(angleX);
        const sineX = Math.sin(angleX);
        const rotatedY = baseY * cosineX - baseZ * sineX;
        let rotatedZ = baseY * sineX + baseZ * cosineX;
        const cosineZ = Math.cos(angleZ);
        const sineZ = Math.sin(angleZ);
        const rotatedX = baseX * cosineZ - rotatedY * sineZ;
        const finalY = baseX * sineZ + rotatedY * cosineZ;
        rotatedZ +=
          Math.sin(
            flutterTime -
              weight * CAPE_FLUTTER_PHASE_SPREAD +
              baseX * CAPE_FLUTTER_HORIZONTAL_VARIATION +
              panel.phase,
          ) *
          flutterAmplitude *
          smoothWeight;
        values[offset] = rotatedX;
        values[offset + 1] = finalY;
        values[offset + 2] = rotatedZ;
      }
      panel.position.needsUpdate = true;
      panel.geometry.computeVertexNormals();
    }

    this.previousBendX = bendX;
    this.previousBendZ = bendZ;
    this.previousFlutterAmplitude = flutterAmplitude;
  }

  private shouldUpdate(
    bendX: number,
    bendZ: number,
    flutterAmplitude: number,
  ): boolean {
    if (!Number.isFinite(this.previousBendX)) {
      return true;
    }
    return (
      Math.abs(flutterAmplitude) > CAPE_GEOMETRY_UPDATE_EPSILON ||
      Math.abs(bendX - this.previousBendX) > CAPE_GEOMETRY_UPDATE_EPSILON ||
      Math.abs(bendZ - this.previousBendZ) > CAPE_GEOMETRY_UPDATE_EPSILON ||
      Math.abs(flutterAmplitude - this.previousFlutterAmplitude) >
        CAPE_GEOMETRY_UPDATE_EPSILON
    );
  }
}

function collectPanels(
  group: THREE.Object3D,
  phase: number,
  flexScale: number,
  lateralScale: number,
): CapePanelState[] {
  const panels: CapePanelState[] = [];
  const visited = new Set<THREE.BufferGeometry>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    const geometry = object.geometry;
    if (!(geometry instanceof THREE.BufferGeometry) || visited.has(geometry)) {
      return;
    }
    visited.add(geometry);
    const position = geometry.getAttribute("position");
    if (
      !(position instanceof THREE.BufferAttribute) ||
      position.itemSize !== 3 ||
      position.count === 0
    ) {
      return;
    }

    const basePositions = Float32Array.from(
      position.array as ArrayLike<number>,
    );
    position.setUsage(THREE.DynamicDrawUsage);
    setConservativeBounds(geometry, basePositions);
    panels.push({
      geometry,
      position,
      basePositions,
      weights: createWeights(basePositions, position.count),
      phase,
      flexScale,
      lateralScale,
    });
  });
  return panels;
}

function setConservativeBounds(
  geometry: THREE.BufferGeometry,
  positions: Float32Array,
): void {
  let radiusSquared = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    radiusSquared = Math.max(radiusSquared, x * x + y * y + z * z);
  }
  const radius =
    Math.sqrt(radiusSquared) + CAPE_FLUTTER_STRENGTH + CAPE_BOUNDS_PADDING;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-radius, -radius, -radius),
    new THREE.Vector3(radius, radius, radius),
  );
}

function createWeights(
  positions: Float32Array,
  vertexCount: number,
): Float32Array {
  let top = Number.NEGATIVE_INFINITY;
  let bottom = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertexCount; index += 1) {
    const y = positions[index * 3 + 1];
    top = Math.max(top, y);
    bottom = Math.min(bottom, y);
  }

  const height = Math.max(top - bottom, Number.EPSILON);
  const weights = new Float32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    weights[index] = THREE.MathUtils.clamp(
      (top - positions[index * 3 + 1]) / height,
      0,
      1,
    );
  }
  return weights;
}
