import * as THREE from "three";
import type { GrassLodConfig } from "./GrassConfig";
import { GRASS_MID_IMPOSTOR_UNDERFILL } from "./GrassLodTuning";
import {
  GrassLodLevel,
  type GrassFarGroup,
  type GrassPatch,
} from "./GrassPatchGrid";

const VISIBILITY_EPSILON = 0.001;
/**
 * The CPU reproduces the shader's dither in float64 and stores it as float32,
 * so the two can disagree in the last bit. Widening the kept run by this much
 * keeps the truncation strictly conservative. Mirrors the near band's margin in
 * `WorldSingleBladeTileField`.
 */
const DITHER_SAFETY_MARGIN = 1 / 1024;
const INDICES_PER_BLADE = 3;
/** Fallback when the world has not supplied a patch half-diagonal. */
const DEFAULT_MID_INSTANCE_RADIUS = 4;

/** How the mid material thins blades with distance; see PERF-2. */
export interface GrassMidDensityFalloff {
  start: number;
  end: number;
  floor: number;
  /** Global multiplier owned by the quality governor. */
  scale: number;
}

/**
 * Index of the first entry strictly below `value` in a descending array, which
 * is the length of the run that passes `dither > value`.
 */
function lowerBoundDescending(values: Float32Array, value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] > value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export class GrassLodController {
  private readonly cameraPosition = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();
  private readonly projectionViewMatrix = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private midFalloff: GrassMidDensityFalloff = {
    start: 0,
    end: 1,
    floor: 1,
    scale: 1,
  };
  /**
   * What the grass layers actually submit, accumulated during the passes that
   * already visit every patch and group. three's own triangle counter reports
   * each geometry's full index count, so neither the mid `drawRange` trim nor
   * the near `mesh.count` trim is visible there.
   */
  private submittedMidVertices = 0;
  private submittedFarInstances = 0;
  private midInstanceRadius = DEFAULT_MID_INSTANCE_RADIUS;
  private compactFarthest = 0;
  private readonly matrixSwap = new Float32Array(16);
  private readonly variationSwap = new Float32Array(4);

  constructor(private readonly config: GrassLodConfig) {}

  /**
   * Must track whatever the mid material was configured with: the per-batch
   * draw truncation below reproduces the shader's keep threshold from these
   * exact numbers, and an optimistic reproduction would drop visible blades.
   */
  setMidDensityFalloff(falloff: GrassMidDensityFalloff): void {
    this.midFalloff = falloff;
  }

  /**
   * Half-extent of one mid instance, including placement jitter. Instances
   * whose whole bound sits inside the near fade are dropped from the batch
   * before the blade `drawRange` trim, so a 32 m camera batch does not submit
   * the near-side patches that single-blade tiles already cover.
   */
  setMidInstanceRadius(radius: number): void {
    if (Number.isFinite(radius) && radius > 0) {
      this.midInstanceRadius = radius;
    }
  }

  update(camera: THREE.Camera, patches: Iterable<GrassPatch>): void {
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.cameraPosition);
    this.projectionViewMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projectionViewMatrix);
    this.submittedMidVertices = 0;

    // Streaming keeps patches resident well past the far fade so they are ready
    // when the camera turns, so a meaningful share of every sweep is patches
    // that cannot draw. Distance is far cheaper than the frustum test, so take
    // it first and skip the rest for anything past the fade.
    const cullDistance =
      this.config.farMaxDistance + this.config.transitionDistance;

    for (const patch of patches) {
      patch.bounds.clampPoint(this.cameraPosition, this.closestPoint);
      patch.distance = this.cameraPosition.distanceTo(this.closestPoint);

      if (patch.distance >= cullDistance) {
        patch.inFrustum = false;
        if (patch.nearMesh) {
          patch.nearMesh.visible = false;
        }
        patch.midMesh.visible = false;
        if (patch.farMesh) {
          patch.farMesh.visible = false;
        }
        continue;
      }

      patch.inFrustum = this.frustum.intersectsBox(patch.bounds);

      if (patch.farMesh || patch.hasFarImpostor) {
        this.updateThreeStagePatch(patch);
      } else {
        this.updateLegacyPatch(patch);
      }
    }
  }

  /**
   * Far cards, one mesh per streamed chunk. Called after {@link update}, which
   * has already refreshed the camera position and frustum for this frame.
   */
  updateFarGroups(groups: Iterable<GrassFarGroup>): void {
    const cullDistance =
      this.config.farMaxDistance + this.config.transitionDistance;
    const farEntryStart =
      this.config.midMaxDistance - this.config.transitionDistance;
    this.submittedFarInstances = 0;

    for (const group of groups) {
      group.bounds.clampPoint(this.cameraPosition, this.closestPoint);
      group.distance = this.cameraPosition.distanceTo(this.closestPoint);
      if (group.distance >= cullDistance) {
        group.inFrustum = false;
        group.mesh.visible = false;
        continue;
      }
      group.inFrustum = this.frustum.intersectsBox(group.bounds);
      if (!group.inFrustum) {
        group.mesh.visible = false;
        continue;
      }
      const farthestDistance =
        this.cameraPosition.distanceTo(group.boundingSphere.center) +
        group.boundingSphere.radius;
      group.mesh.visible = farthestDistance > farEntryStart;
      if (group.mesh.visible) {
        this.submittedFarInstances += group.mesh.count;
      }
    }
  }

  getSubmittedMidVertices(): number {
    return this.submittedMidVertices;
  }

  getSubmittedFarInstances(): number {
    return this.submittedFarInstances;
  }

  private updateThreeStagePatch(patch: GrassPatch): void {
    patch.lod = this.resolveLevel(patch.distance, patch.lod, true);
    patch.nearCoverage = this.resolveNearCoverage(patch.distance);
    const farEntry = this.resolveFarEntry(patch.distance);
    patch.midCoverage = Math.max(
      0,
      (1 - patch.nearCoverage) * (1 - farEntry),
    );
    patch.farCoverage = this.resolveFarCoverage(
      patch.distance,
      patch.nearCoverage,
      farEntry,
    );

    if (!patch.inFrustum) {
      if (patch.nearMesh) {
        patch.nearMesh.visible = false;
      }
      patch.midMesh.visible = false;
      if (patch.farMesh) {
        patch.farMesh.visible = false;
      }
      return;
    }

    const farthestDistance =
      this.cameraPosition.distanceTo(patch.boundingSphere.center) +
      patch.boundingSphere.radius;
    const nearFadeStart =
      this.config.nearMaxDistance - this.config.transitionDistance;
    const nearFadeEnd =
      this.config.nearMaxDistance + this.config.transitionDistance;
    const farEntryStart =
      this.config.midMaxDistance - this.config.transitionDistance;
    const farEntryEnd =
      this.config.midMaxDistance + this.config.transitionDistance;
    const terrainFadeEnd =
      this.config.farMaxDistance + this.config.transitionDistance;

    // The streamed world path builds no near clump mesh at all; single-blade
    // tiles cover the whole near band.
    if (patch.nearMesh) {
      patch.nearMesh.visible = patch.distance < nearFadeEnd;
    }
    patch.midMesh.visible =
      farthestDistance > nearFadeStart && patch.distance < farEntryEnd;
    if (patch.midMesh.visible) {
      const keepCount = this.compactMidInstances(
        patch,
        nearFadeStart,
        farthestDistance,
      );
      if (keepCount === 0) {
        patch.midMesh.visible = false;
      } else {
        this.trimMidDraw(
          patch,
          Math.min(farthestDistance, this.compactFarthest),
        );
      }
    }
    if (patch.farMesh) {
      patch.farMesh.visible =
        farthestDistance > farEntryStart && patch.distance < terrainFadeEnd;
    }
    // Coverage itself is resolved per instance from world-space distance inside
    // both materials. The patch-level values survive only as diagnostics.
  }

  /**
   * Cuts a visible mid batch's draw to the blades that can survive its vertex
   * shader's keep test.
   *
   * The mid shader keeps a blade when `dither > 1 - falloff * (1 - cut)` with
   * `cut = max(nearCoverage, farEntry)`, and the mid geometry is written in
   * descending dither order, so the survivors are always a leading run. Every
   * term below is evaluated at the extreme of the batch that *minimises* the
   * threshold — near coverage at the batch's farthest point, far entry and the
   * distance falloff at its nearest — so the kept run is a strict superset of
   * what the shader keeps. It can only ever submit blades the shader would have
   * dropped, never drop one it would have kept.
   *
   * Without this the batch under the camera submitted all 64 instances x 1344
   * blades regardless of how many collapse, which was the single largest vertex
   * cost in the scene. The trim only stays cheap if the near fade still covers
   * that 32 m batch: if `near + transition` is shorter than the batch, the
   * farthest corner reports zero near coverage and this keeps every blade.
   */
  private trimMidDraw(patch: GrassPatch, farthestDistance: number): void {
    const dithers = patch.midSortedDithers;
    if (!dithers) {
      return;
    }
    const nearCoverage = this.resolveNearCoverage(farthestDistance);
    const farEntry = this.resolveFarEntry(patch.distance);
    const lodCut = Math.max(nearCoverage, farEntry);
    const falloff =
      this.midFalloff.scale *
      THREE.MathUtils.lerp(
        1,
        this.midFalloff.floor,
        THREE.MathUtils.smoothstep(
          patch.distance,
          this.midFalloff.start,
          this.midFalloff.end,
        ),
      );
    const threshold = 1 - falloff * (1 - lodCut) - DITHER_SAFETY_MARGIN;
    const keptBlades =
      threshold <= 0
        ? dithers.length
        : lowerBoundDescending(dithers, threshold);
    patch.midMesh.geometry.setDrawRange(0, keptBlades * INDICES_PER_BLADE);
    this.submittedMidVertices +=
      keptBlades * INDICES_PER_BLADE * patch.midMesh.count;
  }

  /**
   * Packs mid instances that can survive the near fade to the front of the
   * batch and cuts `mesh.count`. The dropped slots stay in the backing arrays
   * so the next frame can restore them without a source copy.
   */
  private compactMidInstances(
    patch: GrassPatch,
    nearFadeStart: number,
    farthestDistance: number,
  ): number {
    const mesh = patch.midMesh;
    const total = patch.instanceCount;
    if (total <= 0) {
      mesh.count = 0;
      this.compactFarthest = 0;
      return 0;
    }
    // Every instance sits inside the batch bounds, so a batch whose closest
    // point is already past the near interior cannot hide anything. Skipping
    // it avoids a hypot and a buffer upload on the 40–80 m rings.
    if (patch.distance > nearFadeStart) {
      mesh.count = total;
      this.compactFarthest = farthestDistance;
      return total;
    }
    const matrix = mesh.instanceMatrix.array as Float32Array;
    const variation = mesh.geometry.getAttribute("instanceVariation");
    const coverage = mesh.geometry.getAttribute("instanceCoverage");
    const biome = mesh.geometry.getAttribute("instanceBiome");
    if (!variation || !coverage || !biome) {
      mesh.count = total;
      this.compactFarthest = farthestDistance;
      return total;
    }
    const variationValues = variation.array as Float32Array;
    const coverageValues = coverage.array as Float32Array;
    const biomeValues = biome.array as Float32Array;
    const baseCoverage = patch.baseMidCoverage;
    const origin = mesh.position;
    const camera = this.cameraPosition;
    const radius = this.midInstanceRadius;
    let keepCount = 0;
    let farthestRemaining = 0;
    let swapped = false;
    for (let index = 0; index < total; index += 1) {
      const offset = index * 16;
      const distance = Math.hypot(
        origin.x + matrix[offset + 12] - camera.x,
        origin.y + matrix[offset + 13] - camera.y,
        origin.z + matrix[offset + 14] - camera.z,
      );
      if (distance + radius <= nearFadeStart) {
        continue;
      }
      farthestRemaining = Math.max(farthestRemaining, distance);
      if (keepCount !== index) {
        swapped = true;
        swapFloatBlock(matrix, keepCount * 16, offset, 16, this.matrixSwap);
        swapFloatBlock(
          variationValues,
          keepCount * 4,
          index * 4,
          4,
          this.variationSwap,
        );
        swapFloat(coverageValues, keepCount, index);
        swapFloat(biomeValues, keepCount, index);
        if (baseCoverage) {
          swapFloat(baseCoverage, keepCount, index);
        }
      }
      keepCount += 1;
    }
    if (keepCount !== mesh.count) {
      mesh.count = keepCount;
    }
    if (swapped) {
      mesh.instanceMatrix.needsUpdate = true;
      variation.needsUpdate = true;
      coverage.needsUpdate = true;
      biome.needsUpdate = true;
    }
    this.compactFarthest = keepCount === 0 ? 0 : farthestRemaining;
    return keepCount;
  }

  private updateLegacyPatch(patch: GrassPatch): void {
    const nearMesh = patch.nearMesh;
    if (!nearMesh) {
      return;
    }

    patch.lod = this.resolveLevel(patch.distance, patch.lod, false);
    patch.nearCoverage = this.resolveNearCoverage(patch.distance);
    patch.midDistanceFade = this.resolveLegacyMidDistanceFade(patch.distance);
    if (!patch.inFrustum) {
      nearMesh.visible = false;
      patch.midMesh.visible = false;
      return;
    }
    nearMesh.visible = patch.nearCoverage > VISIBILITY_EPSILON;
    patch.midMesh.visible =
      patch.nearCoverage < 1 - VISIBILITY_EPSILON &&
      patch.midDistanceFade > VISIBILITY_EPSILON;
  }

  private resolveLevel(
    distance: number,
    currentLevel: GrassLodLevel,
    hasFarImpostor: boolean,
  ): GrassLodLevel {
    const hysteresis = this.config.hysteresisDistance;

    if (currentLevel === GrassLodLevel.Near) {
      return distance > this.config.nearMaxDistance + hysteresis
        ? GrassLodLevel.Mid
        : GrassLodLevel.Near;
    }

    if (currentLevel === GrassLodLevel.Mid) {
      if (distance < this.config.nearMaxDistance - hysteresis) {
        return GrassLodLevel.Near;
      }
      const upperDistance = hasFarImpostor
        ? this.config.midMaxDistance
        : this.config.farMaxDistance;
      return distance > upperDistance + hysteresis
        ? hasFarImpostor
          ? GrassLodLevel.Far
          : GrassLodLevel.Terrain
        : GrassLodLevel.Mid;
    }

    if (currentLevel === GrassLodLevel.Far && hasFarImpostor) {
      if (distance < this.config.midMaxDistance - hysteresis) {
        return GrassLodLevel.Mid;
      }
      return distance > this.config.farMaxDistance + hysteresis
        ? GrassLodLevel.Terrain
        : GrassLodLevel.Far;
    }

    if (distance >= this.config.farMaxDistance - hysteresis) {
      return GrassLodLevel.Terrain;
    }
    return hasFarImpostor ? GrassLodLevel.Far : GrassLodLevel.Mid;
  }

  private resolveNearCoverage(distance: number): number {
    const start =
      this.config.nearMaxDistance - this.config.transitionDistance;
    const end =
      this.config.nearMaxDistance + this.config.transitionDistance;
    return 1 - THREE.MathUtils.smoothstep(distance, start, end);
  }

  private resolveFarEntry(distance: number): number {
    const start = this.config.midMaxDistance - this.config.transitionDistance;
    const end = this.config.midMaxDistance + this.config.transitionDistance;
    return THREE.MathUtils.smoothstep(distance, start, end);
  }

  private resolveFarCoverage(
    distance: number,
    nearCoverage: number,
    entry: number,
  ): number {
    const terrainFadeStart =
      this.config.farMaxDistance - this.config.transitionDistance;
    const terrainFadeEnd =
      this.config.farMaxDistance + this.config.transitionDistance;
    const terrainFade = THREE.MathUtils.smoothstep(
      distance,
      terrainFadeStart,
      terrainFadeEnd,
    );
    const midUnderfill =
      (1 - nearCoverage) * GRASS_MID_IMPOSTOR_UNDERFILL;
    const densityCoverage = THREE.MathUtils.lerp(midUnderfill, 1, entry);
    return densityCoverage * (1 - terrainFade);
  }

  private resolveLegacyMidDistanceFade(distance: number): number {
    const start = this.config.farMaxDistance - this.config.transitionDistance;
    const end = this.config.farMaxDistance + this.config.transitionDistance;
    return 1 - THREE.MathUtils.smoothstep(distance, start, end);
  }
}

function swapFloat(values: Float32Array, left: number, right: number): void {
  const stored = values[left];
  values[left] = values[right];
  values[right] = stored;
}

function swapFloatBlock(
  values: Float32Array,
  left: number,
  right: number,
  width: number,
  scratch: Float32Array,
): void {
  scratch.set(values.subarray(left, left + width));
  values.copyWithin(left, right, right + width);
  values.set(scratch.subarray(0, width), right);
}
