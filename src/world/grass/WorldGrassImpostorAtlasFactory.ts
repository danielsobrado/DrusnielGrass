import * as THREE from "three";
import { disposeResources } from "../../render/ResourceDisposal";
import type {
  GrassGeometryConfig,
  GrassImpostorConfig,
} from "../../grass/GrassConfig";
import {
  GRASS_IMPOSTOR_BOUNDS_SAFETY_MARGIN,
  GRASS_IMPOSTOR_FOOTPRINT_SCALE,
  GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE,
  GRASS_IMPOSTOR_MAX_VERTICAL_SCALE,
  GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT,
} from "../../grass/GrassLodTuning";
import type { WorldGrassBladeSpec } from "./WorldGrassPatchGeometryFactory";
import {
  calculateGrassBladeCurveReach,
  calculateGrassImpostorRootBoundsRadius,
  resolveGrassBladeArcPoint,
} from "./GrassRuntimeMath";
import {
  IMPOSTOR_MAX_ATLAS_SIZE,
  IMPOSTOR_SUBPATCHES_PER_AXIS,
} from "./WorldGrassImpostorTuning";

export interface WorldGrassImpostorAtlas {
  texture: THREE.CanvasTexture;
  geometry: THREE.BufferGeometry;
  centerHeight: number;
  /** Conservative culling bound around the source patch root. */
  radius: number;
  /** Half-extent of one subpatch billboard quad in local units. */
  cardRadius: number;
  viewsPerAxis: number;
  subpatchesPerAxis: number;
  frameResolution: number;
  padding: number;
  atlasSize: number;
}

interface ProjectedBlade {
  depth: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  tipX: number;
  tipY: number;
  shade: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MIN_PIXEL_BASE_WIDTH = 1.05;
const BYTE_MAX = 255;

export class WorldGrassImpostorAtlasFactory {
  private readonly projectedPoint = new Float64Array(2);

  create(
    blades: readonly WorldGrassBladeSpec[],
    grass: GrassGeometryConfig,
    patchSize: number,
    config: GrassImpostorConfig,
  ): WorldGrassImpostorAtlas {
    const cellSize = config.frameResolution + config.padding * 2;
    const viewPageSize = config.viewsPerAxis * cellSize;
    const atlasSize = viewPageSize * IMPOSTOR_SUBPATCHES_PER_AXIS;
    if (
      !Number.isSafeInteger(atlasSize) ||
      atlasSize <= 0 ||
      atlasSize > IMPOSTOR_MAX_ATLAS_SIZE
    ) {
      throw new Error(
        `World grass impostor atlas must be between 1 and ${IMPOSTOR_MAX_ATLAS_SIZE} pixels per axis; resolved ${atlasSize}.`,
      );
    }
    const canvas = document.createElement("canvas");
    canvas.width = atlasSize;
    canvas.height = atlasSize;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error(
        "Unable to create the grass impostor atlas canvas context.",
      );
    }

    let maximumBladeLength = grass.bladeHeightMax;
    for (const blade of blades) {
      maximumBladeLength = Math.max(maximumBladeLength, blade.height);
    }
    const maximumTip = resolveGrassBladeArcPoint(
      maximumBladeLength,
      grass.bladeCurve,
      1,
    );
    const centerHeight = maximumTip.y * 0.5;
    const subpatchSize = patchSize / IMPOSTOR_SUBPATCHES_PER_AXIS;
    const halfSubpatch = subpatchSize * 0.5;
    const horizontalExtent =
      Math.SQRT2 * halfSubpatch +
      grass.bladeLeanMax +
      grass.bladeWidthMax +
      calculateGrassBladeCurveReach(maximumBladeLength, grass.bladeCurve);
    const cardRadius =
      Math.hypot(horizontalExtent, centerHeight) * config.cameraMargin;
    const subpatchOffsetRadius = Math.SQRT2 * halfSubpatch;
    const cardBoundsRadius = calculateGrassImpostorRootBoundsRadius({
      cardRadius,
      centerHeight,
      footprintScale: GRASS_IMPOSTOR_FOOTPRINT_SCALE,
      maximumHorizontalScale: GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE,
      maximumVerticalScale: GRASS_IMPOSTOR_MAX_VERTICAL_SCALE,
      maximumWindDisplacement: GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT,
      safetyMargin: GRASS_IMPOSTOR_BOUNDS_SAFETY_MARGIN,
    });
    const boundsRadius =
      cardBoundsRadius +
      subpatchOffsetRadius * GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE;
    const subpatchCenters = this.createSubpatchCenters(patchSize);
    const subpatchBlades = this.partitionBlades(blades);

    context.clearRect(0, 0, atlasSize, atlasSize);
    for (
      let subpatchIndex = 0;
      subpatchIndex < subpatchBlades.length;
      subpatchIndex += 1
    ) {
      const pageX = subpatchIndex % IMPOSTOR_SUBPATCHES_PER_AXIS;
      const pageY = Math.floor(
        subpatchIndex / IMPOSTOR_SUBPATCHES_PER_AXIS,
      );
      const canvasPageY =
        IMPOSTOR_SUBPATCHES_PER_AXIS - 1 - pageY;
      const pageOffsetX = pageX * viewPageSize;
      const pageOffsetY = canvasPageY * viewPageSize;
      const center = subpatchCenters[subpatchIndex];

      for (let gridY = 0; gridY < config.viewsPerAxis; gridY += 1) {
        for (let gridX = 0; gridX < config.viewsPerAxis; gridX += 1) {
          const direction = this.decodeHemiOctahedral(
            (gridX + 0.5) / config.viewsPerAxis,
            (gridY + 0.5) / config.viewsPerAxis,
          );
          const canvasRow = config.viewsPerAxis - 1 - gridY;
          this.drawFrame(
            context,
            subpatchBlades[subpatchIndex],
            direction,
            pageOffsetX + gridX * cellSize,
            pageOffsetY + canvasRow * cellSize,
            config.frameResolution,
            config.padding,
            new THREE.Vector3(center.x, centerHeight, center.y),
            cardRadius,
            grass.bladeCurve,
          );
        }
      }
    }

    let texture: THREE.CanvasTexture | undefined;
    let geometry: THREE.BufferGeometry | undefined;
    try {
      texture = new THREE.CanvasTexture(canvas);
      texture.name = "world-grass-subpatch-hemi-octahedral-atlas";
      texture.colorSpace = THREE.NoColorSpace;
      texture.premultiplyAlpha = true;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      geometry = this.createGeometry(cardRadius, subpatchCenters);

      return {
        texture,
        geometry,
        centerHeight,
        radius: boundsRadius,
        cardRadius,
        viewsPerAxis: config.viewsPerAxis,
        subpatchesPerAxis: IMPOSTOR_SUBPATCHES_PER_AXIS,
        frameResolution: config.frameResolution,
        padding: config.padding,
        atlasSize,
      };
    } catch (error) {
      try {
        disposeResources([geometry, texture]);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Grass impostor atlas cleanup failed.",
          cleanupError,
        );
      }
      throw error;
    }
  }

  private partitionBlades(
    blades: readonly WorldGrassBladeSpec[],
  ): WorldGrassBladeSpec[][] {
    const subpatchCount =
      IMPOSTOR_SUBPATCHES_PER_AXIS * IMPOSTOR_SUBPATCHES_PER_AXIS;
    const partitions = Array.from(
      { length: subpatchCount },
      () => [] as WorldGrassBladeSpec[],
    );
    for (const blade of blades) {
      const column = blade.rootX >= 0 ? 1 : 0;
      const row = blade.rootZ >= 0 ? 1 : 0;
      partitions[row * IMPOSTOR_SUBPATCHES_PER_AXIS + column].push(blade);
    }
    return partitions;
  }

  private createSubpatchCenters(patchSize: number): THREE.Vector2[] {
    const halfSubpatch =
      patchSize / (IMPOSTOR_SUBPATCHES_PER_AXIS * 2);
    const centers: THREE.Vector2[] = [];
    for (let row = 0; row < IMPOSTOR_SUBPATCHES_PER_AXIS; row += 1) {
      for (let column = 0; column < IMPOSTOR_SUBPATCHES_PER_AXIS; column += 1) {
        centers.push(
          new THREE.Vector2(
            column === 0 ? -halfSubpatch : halfSubpatch,
            row === 0 ? -halfSubpatch : halfSubpatch,
          ),
        );
      }
    }
    return centers;
  }

  private drawFrame(
    context: CanvasRenderingContext2D,
    blades: readonly WorldGrassBladeSpec[],
    viewDirection: THREE.Vector3,
    offsetX: number,
    offsetY: number,
    frameResolution: number,
    padding: number,
    center: THREE.Vector3,
    radius: number,
    bladeCurve: number,
  ): void {
    const right = new THREE.Vector3().crossVectors(WORLD_UP, viewDirection);
    if (right.lengthSq() < 1e-6) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }
    const up = new THREE.Vector3()
      .crossVectors(viewDirection, right)
      .normalize();
    const projected = blades.map((blade) =>
      this.projectBlade(
        blade,
        viewDirection,
        right,
        up,
        center,
        offsetX + padding,
        offsetY + padding,
        frameResolution,
        radius,
        bladeCurve,
      ),
    );
    projected.sort((left, rightBlade) => left.depth - rightBlade.depth);

    context.save();
    context.beginPath();
    context.rect(
      offsetX + padding,
      offsetY + padding,
      frameResolution,
      frameResolution,
    );
    context.clip();

    for (const blade of projected) {
      const shade = THREE.MathUtils.clamp(blade.shade, 0, 1);
      const dryness = THREE.MathUtils.clamp(
        (0.2 - blade.shade) * 0.8,
        0,
        0.22,
      );
      const baseX = (blade.leftX + blade.rightX) * 0.5;
      const baseY = (blade.leftY + blade.rightY) * 0.5;
      const baseEdgeX = blade.rightX - blade.leftX;
      const baseEdgeY = blade.rightY - blade.leftY;
      const baseLength = Math.hypot(baseEdgeX, baseEdgeY);
      let normalX = baseLength > 1e-5 ? -baseEdgeY / baseLength : 0;
      let normalY = baseLength > 1e-5 ? baseEdgeX / baseLength : -1;
      let projectedHeight =
        (blade.tipX - baseX) * normalX +
        (blade.tipY - baseY) * normalY;
      if (projectedHeight < 0) {
        normalX *= -1;
        normalY *= -1;
        projectedHeight *= -1;
      }
      if (projectedHeight < 1e-4) {
        const tipDistance = Math.max(
          Math.hypot(blade.tipX - baseX, blade.tipY - baseY),
          1e-4,
        );
        normalX = (blade.tipX - baseX) / tipDistance;
        normalY = (blade.tipY - baseY) / tipDistance;
        projectedHeight = tipDistance;
      }
      const gradient = context.createLinearGradient(
        baseX,
        baseY,
        baseX + normalX * projectedHeight,
        baseY + normalY * projectedHeight,
      );
      gradient.addColorStop(0, this.encodeDataColor(0, shade, dryness));
      gradient.addColorStop(
        1,
        this.encodeDataColor(1, shade, dryness * 0.75),
      );
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(blade.leftX, blade.leftY);
      context.lineTo(blade.rightX, blade.rightY);
      context.lineTo(blade.tipX, blade.tipY);
      context.closePath();
      context.fill();
    }

    context.restore();
  }

  private projectBlade(
    blade: WorldGrassBladeSpec,
    viewDirection: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
    center: THREE.Vector3,
    frameX: number,
    frameY: number,
    frameResolution: number,
    radius: number,
    bladeCurve: number,
  ): ProjectedBlade {
    const halfWidth = blade.width * 0.5;
    const widthX = Math.cos(blade.facingAngle) * halfWidth;
    const widthZ = Math.sin(blade.facingAngle) * halfWidth;
    const tip = resolveGrassBladeArcPoint(blade.height, bladeCurve, 1);
    const curveX = -Math.sin(blade.facingAngle) * tip.z;
    const curveZ = Math.cos(blade.facingAngle) * tip.z;
    const tipX =
      blade.rootX + Math.cos(blade.leanAngle) * blade.lean + curveX;
    const tipZ =
      blade.rootZ + Math.sin(blade.leanAngle) * blade.lean + curveZ;
    const leftX = blade.rootX - widthX;
    const leftZ = blade.rootZ - widthZ;
    const rightRootX = blade.rootX + widthX;
    const rightRootZ = blade.rootZ + widthZ;
    this.projectPoint(
      leftX,
      0,
      leftZ,
      right,
      up,
      center,
      frameX,
      frameY,
      frameResolution,
      radius,
    );
    let projectedLeftX = this.projectedPoint[0];
    let projectedLeftY = this.projectedPoint[1];
    this.projectPoint(
      rightRootX,
      0,
      rightRootZ,
      right,
      up,
      center,
      frameX,
      frameY,
      frameResolution,
      radius,
    );
    let projectedRightX = this.projectedPoint[0];
    let projectedRightY = this.projectedPoint[1];
    this.projectPoint(
      tipX,
      tip.y,
      tipZ,
      right,
      up,
      center,
      frameX,
      frameY,
      frameResolution,
      radius,
    );
    const projectedTipX = this.projectedPoint[0];
    const projectedTipY = this.projectedPoint[1];

    const deltaX = projectedRightX - projectedLeftX;
    const deltaY = projectedRightY - projectedLeftY;
    const width = Math.hypot(deltaX, deltaY);
    if (width < MIN_PIXEL_BASE_WIDTH) {
      const centerX = (projectedLeftX + projectedRightX) * 0.5;
      const centerY = (projectedLeftY + projectedRightY) * 0.5;
      const directionX = width > 1e-5 ? deltaX / width : 1;
      const directionY = width > 1e-5 ? deltaY / width : 0;
      const halfWidth = MIN_PIXEL_BASE_WIDTH * 0.5;
      projectedLeftX = centerX - directionX * halfWidth;
      projectedLeftY = centerY - directionY * halfWidth;
      projectedRightX = centerX + directionX * halfWidth;
      projectedRightY = centerY + directionY * halfWidth;
    }

    const averageX = (leftX + rightRootX + tipX) / 3 - center.x;
    const averageY = tip.y / 3 - center.y;
    const averageZ = (leftZ + rightRootZ + tipZ) / 3 - center.z;
    return {
      depth:
        averageX * viewDirection.x +
        averageY * viewDirection.y +
        averageZ * viewDirection.z,
      leftX: projectedLeftX,
      leftY: projectedLeftY,
      rightX: projectedRightX,
      rightY: projectedRightY,
      tipX: projectedTipX,
      tipY: projectedTipY,
      shade: blade.shade,
    };
  }

  private projectPoint(
    pointX: number,
    pointY: number,
    pointZ: number,
    right: THREE.Vector3,
    up: THREE.Vector3,
    center: THREE.Vector3,
    frameX: number,
    frameY: number,
    frameResolution: number,
    radius: number,
  ): void {
    const localX = pointX - center.x;
    const localY = pointY - center.y;
    const localZ = pointZ - center.z;
    const inverseDiameter = 1 / (radius * 2);
    this.projectedPoint[0] =
      frameX +
      (0.5 +
        (localX * right.x + localY * right.y + localZ * right.z) *
          inverseDiameter) *
        frameResolution;
    this.projectedPoint[1] =
      frameY +
      (0.5 -
        (localX * up.x + localY * up.y + localZ * up.z) * inverseDiameter) *
        frameResolution;
  }

  private decodeHemiOctahedral(u: number, v: number): THREE.Vector3 {
    const squareX = u * 2 - 1;
    const squareY = v * 2 - 1;
    const x = (squareX + squareY) * 0.5;
    const z = (squareX - squareY) * 0.5;
    const y = Math.max(0, 1 - Math.abs(x) - Math.abs(z));
    return new THREE.Vector3(x, y, z).normalize();
  }

  private createGeometry(
    radius: number,
    centers: readonly THREE.Vector2[],
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    const subpatchOffsets: number[] = [];
    const subpatchIndices: number[] = [];
    const indices: number[] = [];

    for (let subpatchIndex = 0; subpatchIndex < centers.length; subpatchIndex += 1) {
      const vertexOffset = positions.length / 3;
      positions.push(
        -radius,
        -radius,
        0,
        radius,
        -radius,
        0,
        radius,
        radius,
        0,
        -radius,
        radius,
        0,
      );
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      const center = centers[subpatchIndex];
      for (let vertex = 0; vertex < 4; vertex += 1) {
        subpatchOffsets.push(center.x, center.y);
        subpatchIndices.push(subpatchIndex);
      }
      indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset,
        vertexOffset + 2,
        vertexOffset + 3,
      );
    }

    const geometry = new THREE.BufferGeometry();
    try {
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute(
        "grassSubpatchOffset",
        new THREE.Float32BufferAttribute(subpatchOffsets, 2),
      );
      geometry.setAttribute(
        "grassSubpatchIndex",
        new THREE.Float32BufferAttribute(subpatchIndices, 1),
      );
      geometry.setIndex(indices);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    } catch (error) {
      try {
        geometry.dispose();
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Grass impostor geometry cleanup failed.",
          cleanupError,
        );
      }
      throw error;
    }
  }

  private encodeDataColor(
    bladeProgress: number,
    shade: number,
    dryness: number,
  ): string {
    const red = Math.round(
      THREE.MathUtils.clamp(bladeProgress, 0, 1) * BYTE_MAX,
    );
    const green = Math.round(THREE.MathUtils.clamp(shade, 0, 1) * BYTE_MAX);
    const blue = Math.round(THREE.MathUtils.clamp(dryness, 0, 1) * BYTE_MAX);
    return `rgb(${red}, ${green}, ${blue})`;
  }
}
