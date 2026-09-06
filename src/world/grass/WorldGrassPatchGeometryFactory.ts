import * as THREE from "three";
import { disposeResources } from "../../render/ResourceDisposal";
import type { GrassGeometryConfig } from "../../grass/GrassConfig";
import { SeededRandom } from "../../grass/internal/SeededRandom";
import type { WorldConfig } from "../WorldConfig";
import { resolveGrassBladeArcPoint } from "./GrassRuntimeMath";

export interface WorldGrassBladeSpec {
  rootX: number;
  rootZ: number;
  facingAngle: number;
  leanAngle: number;
  lean: number;
  height: number;
  width: number;
  phase: number;
  shade: number;
  lodRank: number;
}

export interface WorldGrassPatchGeometryVariants {
  mid: THREE.BufferGeometry[];
  /**
   * Every mid blade's LOD dither, descending, in the order the triangles were
   * written. The mid shader keeps a blade when its dither is *above* a
   * distance-derived threshold, so with the blades in this order the survivors
   * are always a leading run and a batch's draw can be cut with `drawRange`.
   */
  midSortedDithers: Float32Array[];
  bladeVariants: readonly (readonly WorldGrassBladeSpec[])[];
  nearBladesPerPatch: number;
  midBladesPerPatch: number;
}

export function resolveMidBladeDither(
  spec: WorldGrassBladeSpec,
  ditherSeed: number,
): number {
  const value =
    spec.shade * 0.754877666 + spec.phase * 0.569840296 + ditherSeed;
  return value - Math.floor(value);
}

const TWO_PI = Math.PI * 2;
const VARIANT_SEED_STEP = 0x9e3779b9;
const POSITION_JITTER = 0.44;
// The short tier carries canopy mass at middle distance. Making it narrower
// than the readable main tier exposed soil even when every source root survived.
const UNDERLAYER_WIDTH_SCALE = 1.15;
const MAIN_WIDTH_SCALE = 1;
const ACCENT_WIDTH_SCALE = 0.88;
const UNDERLAYER_LEAN_SCALE = 0.64;
const MAIN_LEAN_SCALE = 1;
const ACCENT_LEAN_SCALE = 1.06;

export class WorldGrassPatchGeometryFactory {
  createLodVariants(
    grass: GrassGeometryConfig,
    world: WorldConfig,
    compact: boolean,
    seed: number,
    variantCount: number = grass.variantCount,
    midDitherSeed = 0,
  ): WorldGrassPatchGeometryVariants {
    if (
      !Number.isInteger(variantCount) ||
      variantCount < 1 ||
      variantCount > grass.variantCount
    ) {
      throw new Error(
        `World grass variant count must be between 1 and ${grass.variantCount}.`,
      );
    }
    const density = compact
      ? world.grassBladesPerSquareMeterCompact
      : world.grassBladesPerSquareMeterDesktop;
    const nearBladesPerPatch = Math.max(
      1,
      Math.round(world.grassPatchSize ** 2 * density),
    );
    const midBladesPerPatch = Math.max(
      1,
      Math.round(nearBladesPerPatch * world.grassMidBladeFraction),
    );
    const mid: THREE.BufferGeometry[] = [];
    const midSortedDithers: Float32Array[] = [];
    const bladeVariants: WorldGrassBladeSpec[][] = [];

    try {
      for (let variant = 0; variant < variantCount; variant += 1) {
        const specs = this.createBladeSpecs(
          nearBladesPerPatch,
          world.grassPatchSize,
          seed + variant * VARIANT_SEED_STEP,
          grass,
          world,
        );
        bladeVariants.push(specs);
        const midSpecs = [...specs]
          .sort((left, right) => left.lodRank - right.lodRank)
          .slice(0, midBladesPerPatch)
          .sort(
            (left, right) =>
              resolveMidBladeDither(right, midDitherSeed) -
              resolveMidBladeDither(left, midDitherSeed),
          );
        mid.push(this.createGeometry(midSpecs, grass, true));
        midSortedDithers.push(
          Float32Array.from(midSpecs, (spec) =>
            resolveMidBladeDither(spec, midDitherSeed),
          ),
        );
      }

      return {
        mid,
        midSortedDithers,
        bladeVariants,
        nearBladesPerPatch,
        midBladesPerPatch,
      };
    } catch (error) {
      disposePatchGeometries(mid, "partial patch variants");
      throw error;
    }
  }

  private createBladeSpecs(
    count: number,
    patchSize: number,
    seed: number,
    grass: GrassGeometryConfig,
    world: WorldConfig,
  ): WorldGrassBladeSpec[] {
    const random = new SeededRandom(seed);
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const cellWidth = patchSize / columns;
    const cellDepth = patchSize / rows;
    const halfPatch = patchSize * 0.5;
    const specs: WorldGrassBladeSpec[] = [];
    const understoryShare = world.grassUnderlayerFraction;
    const remainingShare = Math.max(1 - understoryShare, Number.EPSILON);
    const accentProbability = Math.min(
      1,
      world.grassAccentBladeShare / remainingShare,
    );
    const heightJitter = world.grassBladeHeightJitter;

    for (let index = 0; index < count; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const underlayer = random.next() < understoryShare;
      const accent = !underlayer && random.next() < accentProbability;
      const tierHeightScale = underlayer
        ? world.grassUnderstoryHeightScale
        : accent
          ? world.grassAccentHeightScale
          : world.grassMainHeightScale;
      const widthScale = underlayer
        ? UNDERLAYER_WIDTH_SCALE
        : accent
          ? ACCENT_WIDTH_SCALE
          : MAIN_WIDTH_SCALE;
      const leanScale = underlayer
        ? UNDERLAYER_LEAN_SCALE
        : accent
          ? ACCENT_LEAN_SCALE
          : MAIN_LEAN_SCALE;
      const rootX =
        -halfPatch +
        (column + 0.5) * cellWidth +
        random.range(-cellWidth * POSITION_JITTER, cellWidth * POSITION_JITTER);
      const rootZ =
        -halfPatch +
        (row + 0.5) * cellDepth +
        random.range(-cellDepth * POSITION_JITTER, cellDepth * POSITION_JITTER);
      const facingAngle = random.range(0, TWO_PI);
      const leanAngle = facingAngle + random.range(-1.1, 1.1);

      specs.push({
        rootX,
        rootZ,
        facingAngle,
        leanAngle,
        lean: random.range(grass.bladeLeanMin, grass.bladeLeanMax) * leanScale,
        height:
          random.range(grass.bladeHeightMin, grass.bladeHeightMax) *
          tierHeightScale *
          random.range(1 - heightJitter, 1 + heightJitter),
        width:
          random.range(grass.bladeWidthMin, grass.bladeWidthMax) * widthScale,
        phase: random.next(),
        shade: underlayer
          ? random.range(0, 0.2)
          : accent
            ? random.range(0.18, 0.55)
            : random.range(0.28, 0.82),
        lodRank: random.next(),
      });
    }

    return specs;
  }

  private createGeometry(
    specs: readonly WorldGrassBladeSpec[],
    grass: GrassGeometryConfig,
    mid: boolean,
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    const progressValues: number[] = [];
    const phaseValues: number[] = [];
    const shadeValues: number[] = [];
    const indices: number[] = [];
    const heightScale = mid ? grass.midHeightScale : 1;
    const widthScale = mid ? grass.midWidthScale : 1;
    const leanScale = mid ? grass.midLeanScale : 1;

    for (const spec of specs) {
      const halfWidth = spec.width * widthScale * 0.5;
      const widthX = Math.cos(spec.facingAngle) * halfWidth;
      const widthZ = Math.sin(spec.facingAngle) * halfWidth;
      const lean = spec.lean * leanScale;
      const tip = resolveGrassBladeArcPoint(
        spec.height * heightScale,
        grass.bladeCurve,
        1,
      );
      const curveX = -Math.sin(spec.facingAngle) * tip.z;
      const curveZ = Math.cos(spec.facingAngle) * tip.z;
      const tipX =
        spec.rootX + Math.cos(spec.leanAngle) * lean + curveX;
      const tipZ =
        spec.rootZ + Math.sin(spec.leanAngle) * lean + curveZ;
      const vertexOffset = positions.length / 3;

      positions.push(
        spec.rootX - widthX,
        0,
        spec.rootZ - widthZ,
        spec.rootX + widthX,
        0,
        spec.rootZ + widthZ,
        tipX,
        tip.y,
        tipZ,
      );
      uvs.push(0, 0, 1, 0, 0.5, 1);
      progressValues.push(0, 0, 1);
      phaseValues.push(spec.phase, spec.phase, spec.phase);
      shadeValues.push(spec.shade, spec.shade, spec.shade);
      indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
    }

    const geometry = new THREE.BufferGeometry();
    try {
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute(
        "grassProgress",
        new THREE.Float32BufferAttribute(progressValues, 1),
      );
      geometry.setAttribute(
        "grassPhase",
        new THREE.Float32BufferAttribute(phaseValues, 1),
      );
      geometry.setAttribute(
        "grassBladeShade",
        new THREE.Float32BufferAttribute(shadeValues, 1),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    } catch (error) {
      disposePatchGeometries([geometry], "patch geometry");
      throw error;
    }
  }
}

function disposePatchGeometries(
  geometries: THREE.BufferGeometry[],
  label: string,
): void {
  try {
    disposeResources(geometries);
  } catch (cleanupError) {
    console.warn(
      `[Drusniel World] Grass ${label} cleanup failed.`,
      cleanupError,
    );
  }
}
