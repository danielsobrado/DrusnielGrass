import {
  TREE_ATLAS_COLORS,
  TREE_ATLAS_TILE_SIZE,
} from "./WorldTreeTuning";
import type { WorldTreeAtlasTile } from "./WorldTreeAtlasLayout";

export function drawTreeBark(
  context: CanvasRenderingContext2D,
  tile: WorldTreeAtlasTile,
): void {
  const [x, y] = tileOrigin(tile);
  const size = TREE_ATLAS_TILE_SIZE;
  const gradient = context.createLinearGradient(x, y, x + size, y);
  gradient.addColorStop(0, TREE_ATLAS_COLORS.barkDark);
  gradient.addColorStop(0.48, TREE_ATLAS_COLORS.barkBase);
  gradient.addColorStop(1, TREE_ATLAS_COLORS.barkLight);
  context.fillStyle = gradient;
  context.fillRect(x, y, size, size);
  context.lineCap = "round";
  for (let index = 0; index < 24; index += 1) {
    const px = x + 8 + ((index * 47) % (size - 16));
    const wobble = ((index * 31) % 23) - 11;
    context.strokeStyle = index % 3 === 0
      ? "rgba(35, 24, 19, 0.42)"
      : "rgba(226, 193, 145, 0.18)";
    context.lineWidth = 2 + (index % 3);
    context.beginPath();
    context.moveTo(px, y - 8);
    context.bezierCurveTo(
      px + wobble,
      y + size * 0.32,
      px - wobble,
      y + size * 0.68,
      px + wobble * 0.35,
      y + size + 8,
    );
    context.stroke();
  }
}

export function drawTreeBirchBark(
  context: CanvasRenderingContext2D,
  tile: WorldTreeAtlasTile,
): void {
  const [x, y] = tileOrigin(tile);
  const size = TREE_ATLAS_TILE_SIZE;
  const gradient = context.createLinearGradient(x, y, x + size, y);
  gradient.addColorStop(0, TREE_ATLAS_COLORS.birchBarkShade);
  gradient.addColorStop(0.45, TREE_ATLAS_COLORS.birchBark);
  gradient.addColorStop(1, "#eee9d8");
  context.fillStyle = gradient;
  context.fillRect(x, y, size, size);
  context.strokeStyle = TREE_ATLAS_COLORS.birchMark;
  context.lineCap = "round";
  for (let index = 0; index < 20; index += 1) {
    const py = y + 9 + ((index * 37) % (size - 18));
    const length = 18 + ((index * 29) % 58);
    const px = x + ((index * 53) % Math.max(1, size - length));
    context.globalAlpha = 0.28 + (index % 4) * 0.08;
    context.lineWidth = 2 + (index % 3);
    context.beginPath();
    context.moveTo(px, py);
    context.lineTo(px + length, py + ((index % 3) - 1) * 3);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function tileOrigin(tile: WorldTreeAtlasTile): readonly [number, number] {
  return [tile.column * TREE_ATLAS_TILE_SIZE, tile.row * TREE_ATLAS_TILE_SIZE];
}
