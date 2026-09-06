import * as THREE from "three";
import { WaterChunkInteractionResolver } from "./WaterChunkInteractionResolver";
import {
  createWaterSurfaceGradient,
  resolveWaterSurfaceGradient,
} from "./WaterFlowDirection";
import type { HydrologySample } from "./HydrologyField";
import type { WaterInteractionField } from "./WaterInteractionField";
import { WATER_VISIBLE_COVERAGE_THRESHOLD } from "./WaterMaterialTuning";

/** Owns water-only vertex packing and sparse wet-cell topology for one terrain chunk. */
export class WaterChunkGeometryBuilder {
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly data: Float32Array;
  private readonly context: Float32Array;
  private readonly interactions: Float32Array;
  private readonly stoneClearances: Float32Array;
  private readonly interactionResolver: WaterChunkInteractionResolver;
  private maxCoverage = 0;

  constructor(
    private readonly resolution: number,
    interactionField: WaterInteractionField,
  ) {
    const vertexCount = resolution * resolution;
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.data = new Float32Array(vertexCount * 4);
    this.context = new Float32Array(vertexCount * 4);
    this.interactions = new Float32Array(vertexCount * 2);
    this.stoneClearances = new Float32Array(vertexCount);
    this.interactionResolver = new WaterChunkInteractionResolver(
      resolution,
      this.positions,
      this.data,
      this.interactions,
      this.stoneClearances,
      interactionField,
    );
  }

  writeVertex(
    index: number,
    x: number,
    z: number,
    terrainHeight: number,
    hydrology: HydrologySample,
    stoneClearance: number,
  ): void {
    const positionOffset = index * 3;
    this.positions[positionOffset] = x;
    this.positions[positionOffset + 1] = hydrology.waterLevel;
    this.positions[positionOffset + 2] = z;
    this.normals[positionOffset] = 0;
    this.normals[positionOffset + 1] = 1;
    this.normals[positionOffset + 2] = 0;

    const dataOffset = index * 4;
    this.data[dataOffset] = hydrology.waterCoverage;
    this.data[dataOffset + 1] = Math.max(
      0,
      hydrology.waterLevel - terrainHeight,
    );
    this.data[dataOffset + 2] = hydrology.flowX * hydrology.riverCoverage;
    this.data[dataOffset + 3] = hydrology.flowZ * hydrology.riverCoverage;
    // Hydrology already resolved every one of these; packing them here is what
    // lets one surface pass tell a bend from a straight and a cove from open
    // water, without a second material or another field.
    this.context[dataOffset] = hydrology.riverBend;
    this.context[dataOffset + 1] = hydrology.riverLateral;
    this.context[dataOffset + 2] = hydrology.riverMorphology;
    this.context[dataOffset + 3] = hydrology.lakeNormalizedDistance;
    this.stoneClearances[index] = stoneClearance;
    this.maxCoverage = Math.max(this.maxCoverage, hydrology.waterCoverage);
  }

  advanceInteractions(deadline: number): boolean {
    if (this.maxCoverage < WATER_VISIBLE_COVERAGE_THRESHOLD) return true;
    return this.interactionResolver.advance(deadline);
  }

  createGeometry(): THREE.BufferGeometry | undefined {
    if (this.maxCoverage < WATER_VISIBLE_COVERAGE_THRESHOLD) return undefined;
    if (!this.interactionResolver.isComplete()) {
      throw new Error("Water geometry finalized before interaction resolution completed.");
    }
    const indices = this.createIndices();
    if (!indices) return undefined;
    this.writeSurfaceNormals();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(this.normals, 3));
    geometry.setAttribute("waterData", new THREE.BufferAttribute(this.data, 4));
    geometry.setAttribute(
      "waterContext",
      new THREE.BufferAttribute(this.context, 4),
    );
    geometry.setAttribute(
      "waterInteraction",
      new THREE.BufferAttribute(this.interactions, 2),
    );
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) {
      let maxDepth = 0;
      for (let offset = 1; offset < this.data.length; offset += 4) {
        if (this.data[offset] > maxDepth) maxDepth = this.data[offset];
      }
      box.min.y -= maxDepth;
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      geometry.boundingSphere = sphere;
    }
    return geometry;
  }

  /**
   * The sheet is written flat-up per vertex, so the surface tilt has to be recovered
   * from the settled water levels once every neighbour is known. Shading from these
   * interpolated normals is what keeps a sloping river smooth: a screen-space
   * derivative would give one constant normal per triangle, and would degenerate
   * altogether on a triangle seen edge-on at the bank.
   */
  private writeSurfaceNormals(): void {
    const gradient = createWaterSurfaceGradient();
    const vertexCount = this.resolution * this.resolution;
    for (let index = 0; index < vertexCount; index += 1) {
      resolveWaterSurfaceGradient(
        index,
        this.resolution,
        this.positions,
        this.data,
        gradient,
      );
      const length = Math.hypot(gradient.gradientX, 1, gradient.gradientZ);
      const normalOffset = index * 3;
      this.normals[normalOffset] = -gradient.gradientX / length;
      this.normals[normalOffset + 1] = 1 / length;
      this.normals[normalOffset + 2] = -gradient.gradientZ / length;
    }
  }

  private createIndices(): Uint16Array | Uint32Array | undefined {
    const cells = this.resolution - 1;
    const vertexCount = this.resolution * this.resolution;
    const indices = vertexCount <= 65535
      ? new Uint16Array(cells * cells * 6)
      : new Uint32Array(cells * cells * 6);
    let writeOffset = 0;

    for (let zIndex = 0; zIndex < cells; zIndex += 1) {
      for (let xIndex = 0; xIndex < cells; xIndex += 1) {
        const row = zIndex * this.resolution + xIndex;
        const topLeft = row;
        const bottomLeft = row + this.resolution;
        const topRight = row + 1;
        const bottomRight = bottomLeft + 1;
        const maximumCoverage = Math.max(
          this.data[topLeft * 4],
          this.data[bottomLeft * 4],
          this.data[topRight * 4],
          this.data[bottomRight * 4],
        );
        if (maximumCoverage < WATER_VISIBLE_COVERAGE_THRESHOLD) continue;

        indices[writeOffset] = topLeft;
        indices[writeOffset + 1] = bottomLeft;
        indices[writeOffset + 2] = topRight;
        indices[writeOffset + 3] = topRight;
        indices[writeOffset + 4] = bottomLeft;
        indices[writeOffset + 5] = bottomRight;
        writeOffset += 6;
      }
    }

    return writeOffset > 0 ? indices.slice(0, writeOffset) : undefined;
  }
}
