import * as THREE from "three";

const TEXTURE_CHANNELS = 4;
const COVERED_VALUE = 255;
const UNCOVERED_VALUE = 0;
const GRID_EPSILON = 1e-6;

/**
 * Tiny chunk-residency texture used by the horizon shell.
 *
 * Resident streamed terrain owns its pixels completely. The coarse shell is
 * only allowed to draw where no detailed chunk exists, which avoids geometric
 * poke-through even on mountain faces where the two meshes approximate the
 * same height field very differently.
 */
export class WorldHorizonCoverage {
  readonly texture: THREE.DataTexture;
  readonly worldHalfExtent: number;
  readonly worldSize: number;

  private readonly data: Uint8Array;
  private readonly chunksPerAxis: number;
  private readonly minChunk: number;
  private disposed = false;

  constructor(worldSize: number, chunkSize: number) {
    const chunksPerAxis = Math.round(worldSize / chunkSize);
    if (
      !Number.isFinite(chunksPerAxis) ||
      chunksPerAxis < 1 ||
      Math.abs(chunksPerAxis * chunkSize - worldSize) > GRID_EPSILON ||
      chunksPerAxis % 2 !== 0
    ) {
      throw new Error(
        "Horizon coverage requires worldSize to contain an even whole number of chunks.",
      );
    }

    this.worldSize = worldSize;
    this.worldHalfExtent = worldSize * 0.5;
    this.chunksPerAxis = chunksPerAxis;
    this.minChunk = -chunksPerAxis / 2;
    this.data = new Uint8Array(
      chunksPerAxis * chunksPerAxis * TEXTURE_CHANNELS,
    );
    this.texture = new THREE.DataTexture(
      this.data,
      chunksPerAxis,
      chunksPerAxis,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.texture.name = "world-horizon-coverage";
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
  }

  setChunkCovered(chunkX: number, chunkZ: number, covered: boolean): void {
    if (this.disposed) {
      return;
    }
    const column = chunkX - this.minChunk;
    const row = chunkZ - this.minChunk;
    if (
      column < 0 ||
      row < 0 ||
      column >= this.chunksPerAxis ||
      row >= this.chunksPerAxis
    ) {
      return;
    }

    const offset = (row * this.chunksPerAxis + column) * TEXTURE_CHANNELS;
    const nextValue = covered ? COVERED_VALUE : UNCOVERED_VALUE;
    if (this.data[offset] === nextValue) {
      return;
    }

    this.data[offset] = nextValue;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.texture.dispose();
  }
}
