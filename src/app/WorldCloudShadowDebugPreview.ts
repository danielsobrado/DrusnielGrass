export interface WorldCloudShadowDebugPreviewStats {
  minTransmittance: number;
  maxTransmittance: number;
  minDensity: number;
  maxDensity: number;
}

export class WorldCloudShadowDebugPreview {
  private pixels?: Uint8Array;
  private imageData?: ImageData;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
    private readonly readPixels: (target: Uint8Array) => boolean,
  ) {}

  update(resolution: number): WorldCloudShadowDebugPreviewStats | undefined {
    if (resolution <= 0) {
      return undefined;
    }
    const byteCount = resolution * resolution * 4;
    if (!this.pixels || this.pixels.length !== byteCount) {
      this.pixels = new Uint8Array(byteCount);
      this.imageData = this.context.createImageData(resolution * 2, resolution);
      this.canvas.width = resolution * 2;
      this.canvas.height = resolution;
    }
    if (!this.imageData || !this.pixels || !this.readPixels(this.pixels)) {
      return undefined;
    }

    const output = this.imageData.data;
    let minTransmittance = 255;
    let maxTransmittance = 0;
    let minDensity = 255;
    let maxDensity = 0;
    for (let y = 0; y < resolution; y += 1) {
      const sourceY = resolution - 1 - y;
      for (let x = 0; x < resolution; x += 1) {
        const source = (sourceY * resolution + x) * 4;
        const transmittance = this.pixels[source];
        const density = this.pixels[source + 1];
        minTransmittance = Math.min(minTransmittance, transmittance);
        maxTransmittance = Math.max(maxTransmittance, transmittance);
        minDensity = Math.min(minDensity, density);
        maxDensity = Math.max(maxDensity, density);
        const left = (y * resolution * 2 + x) * 4;
        const right = (y * resolution * 2 + x + resolution) * 4;
        writeGray(output, left, transmittance);
        writeGray(output, right, density);
      }
    }
    this.context.putImageData(this.imageData, 0, 0);
    return {
      minTransmittance: minTransmittance / 255,
      maxTransmittance: maxTransmittance / 255,
      minDensity: minDensity / 255,
      maxDensity: maxDensity / 255,
    };
  }

  dispose(): void {
    this.pixels = undefined;
    this.imageData = undefined;
  }
}

function writeGray(target: Uint8ClampedArray, offset: number, value: number): void {
  target[offset] = value;
  target[offset + 1] = value;
  target[offset + 2] = value;
  target[offset + 3] = 255;
}
