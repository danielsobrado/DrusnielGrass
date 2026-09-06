import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import type { GrassDistributionConfig } from "./GrassConfig";
import { SeededRandom } from "./internal/SeededRandom";

const TWO_PI = Math.PI * 2;
const MAX_SAMPLE_ATTEMPTS_MULTIPLIER = 32;

type SeedableMeshSurfaceSampler = MeshSurfaceSampler & {
  setRandomGenerator(randomFunction: () => number): MeshSurfaceSampler;
};

export interface GrassPlacement {
  matrix: THREE.Matrix4;
  position: THREE.Vector3;
  variation: readonly [number, number, number, number];
}

export class GrassDistribution {
  generate(
    surface: THREE.Mesh,
    instanceCount: number,
    config: GrassDistributionConfig,
  ): GrassPlacement[] {
    const random = new SeededRandom(config.seed);
    const sampler = (
      new MeshSurfaceSampler(surface).setWeightAttribute(
        "color",
      ) as SeedableMeshSurfaceSampler
    )
      .setRandomGenerator(() => random.next())
      .build();

    surface.updateWorldMatrix(true, false);

    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const worldNormal = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const alignRotation = new THREE.Quaternion();
    const yawRotation = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(surface.matrixWorld);
    const minimumUpDot = Math.cos(
      THREE.MathUtils.degToRad(config.maxSlopeDegrees),
    );
    const maximumAttempts = instanceCount * MAX_SAMPLE_ATTEMPTS_MULTIPLIER;
    const placements: GrassPlacement[] = [];

    for (
      let attempt = 0;
      attempt < maximumAttempts && placements.length < instanceCount;
      attempt += 1
    ) {
      sampler.sample(position, normal);
      position.applyMatrix4(surface.matrixWorld);
      worldNormal.copy(normal).applyMatrix3(normalMatrix).normalize();

      if (worldNormal.dot(up) < minimumUpDot) {
        continue;
      }

      const density = this.sampleDensity(position, config);
      if (random.next() > density) {
        continue;
      }

      position.addScaledVector(worldNormal, -config.rootSink);
      alignRotation.setFromUnitVectors(up, worldNormal);
      yawRotation.setFromAxisAngle(up, random.range(0, TWO_PI));
      alignRotation.multiply(yawRotation);

      const widthScale = 1 + random.range(-config.widthVariation, config.widthVariation);
      const heightScale = 1 + random.range(-config.heightVariation, config.heightVariation);
      scale.set(widthScale, heightScale, widthScale);
      matrix.compose(position, alignRotation, scale);

      placements.push({
        matrix: matrix.clone(),
        position: position.clone(),
        variation: [
          random.next(),
          random.range(0.72, 1.18),
          random.range(0.9, 1.04),
          THREE.MathUtils.clamp(
            (1 - density) * 0.7 + random.range(0, 0.18),
            0,
            1,
          ),
        ],
      });
    }

    if (placements.length === 0) {
      throw new Error("Grass distribution could not place any clumps on the surface.");
    }

    if (placements.length < instanceCount) {
      console.warn(
        `[FluffyGrass] Placed ${placements.length}/${instanceCount} grass clumps.`,
      );
    }

    return placements;
  }

  private sampleDensity(
    position: THREE.Vector3,
    config: GrassDistributionConfig,
  ): number {
    const primary = this.valueNoise(
      position.x * config.densityScale,
      position.z * config.densityScale,
      config.seed,
    );
    const detail = this.valueNoise(
      position.x * config.densityScale * 2.37,
      position.z * config.densityScale * 2.37,
      config.seed + 7919,
    );
    const combined = primary * 0.72 + detail * 0.28;
    return THREE.MathUtils.lerp(config.densityMin, config.densityMax, combined);
  }

  private valueNoise(x: number, z: number, seed: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = x - x0;
    const tz = z - z0;
    const smoothX = tx * tx * (3 - 2 * tx);
    const smoothZ = tz * tz * (3 - 2 * tz);
    const a = this.hash(x0, z0, seed);
    const b = this.hash(x0 + 1, z0, seed);
    const c = this.hash(x0, z0 + 1, seed);
    const d = this.hash(x0 + 1, z0 + 1, seed);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(a, b, smoothX),
      THREE.MathUtils.lerp(c, d, smoothX),
      smoothZ,
    );
  }

  private hash(x: number, z: number, seed: number): number {
    let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }
}
