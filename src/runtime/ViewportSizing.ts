export interface ViewportSize {
  width: number;
  height: number;
  aspect: number;
}

export function resolveViewportSize(): ViewportSize {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  return { width, height, aspect: width / height };
}

export function resolvePixelRatio(maxPixelRatio: number): number {
  const devicePixelRatio = window.devicePixelRatio;
  const resolvedDeviceRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  return Math.min(resolvedDeviceRatio, maxPixelRatio);
}
