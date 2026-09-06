import type { WorldDetailFoliageAtlas } from "./WorldDetailFoliageAtlasFactory";

/**
 * `?accentAtlas=1` debug route: pins the generated atlas to the page so every
 * cell can be inspected. The checkerboard reveals premultiplied-alpha edges.
 */
export function appendDetailFoliageAtlasDebugCanvas(
  atlas: WorldDetailFoliageAtlas,
): void {
  const canvas = atlas.canvas;
  canvas.style.position = "fixed";
  canvas.style.left = "8px";
  canvas.style.top = "8px";
  canvas.style.zIndex = "20";
  canvas.style.width = `${Math.min(atlas.width, 1024)}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.background =
    "repeating-conic-gradient(#444 0% 25%, #666 0% 50%) 50% / 16px 16px";
  document.body.appendChild(canvas);
}
