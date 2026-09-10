import {
  TREE_ATLAS_COLORS,
  TREE_ATLAS_TILE_SIZE,
  type WorldTreeSpecies,
} from "./WorldTreeTuning";
import type { WorldTreeAtlasTile } from "./WorldTreeAtlasLayout";

export function drawTreeBroadLeaf(
  context: CanvasRenderingContext2D,
  tile: WorldTreeAtlasTile,
  species: "oak" | "birch",
): void {
  const [x, y] = tileOrigin(tile);
  context.clearRect(x, y, TREE_ATLAS_TILE_SIZE, TREE_ATLAS_TILE_SIZE);
  const dark = species === "oak"
    ? TREE_ATLAS_COLORS.oakDark
    : TREE_ATLAS_COLORS.birchDark;
  const base = species === "oak"
    ? TREE_ATLAS_COLORS.oakBase
    : TREE_ATLAS_COLORS.birchBase;
  const light = species === "oak"
    ? TREE_ATLAS_COLORS.oakLight
    : TREE_ATLAS_COLORS.birchLight;
  const leaves = species === "oak" ? 34 : 42;
  for (let index = 0; index < leaves; index += 1) {
    const angle = index * 2.3999632297;
    const ring = 18 + ((index * 37) % 82);
    const cx =
      x + TREE_ATLAS_TILE_SIZE * 0.5 + Math.cos(angle) * ring;
    const cy =
      y + TREE_ATLAS_TILE_SIZE * 0.52 + Math.sin(angle) * ring * 0.72;
    const radius = species === "oak"
      ? 17 + (index % 5) * 2
      : 10 + (index % 4) * 2;
    context.fillStyle = index % 5 === 0
      ? light
      : index % 2 === 0
        ? base
        : dark;
    context.beginPath();
    if (species === "oak") {
      context.arc(cx, cy, radius, 0, Math.PI * 2);
    } else {
      context.ellipse(
        cx,
        cy,
        radius * 0.7,
        radius * 1.25,
        angle * 0.35,
        0,
        Math.PI * 2,
      );
    }
    context.fill();
  }
}

export function drawTreeEvergreen(
  context: CanvasRenderingContext2D,
  tile: WorldTreeAtlasTile,
): void {
  const [x, y] = tileOrigin(tile);
  context.clearRect(x, y, TREE_ATLAS_TILE_SIZE, TREE_ATLAS_TILE_SIZE);
  context.lineCap = "round";
  for (let index = 0; index < 34; index += 1) {
    const py = y + 24 + index * 5.9;
    const half = 20 + Math.sin(index * 1.7) * 7 + index * 1.7;
    context.strokeStyle = index % 3 === 0
      ? TREE_ATLAS_COLORS.evergreenLight
      : index % 2 === 0
        ? TREE_ATLAS_COLORS.evergreenBase
        : TREE_ATLAS_COLORS.evergreenDark;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(x + TREE_ATLAS_TILE_SIZE * 0.5 - half, py + 18);
    context.quadraticCurveTo(
      x + TREE_ATLAS_TILE_SIZE * 0.5,
      py - 9,
      x + TREE_ATLAS_TILE_SIZE * 0.5 + half,
      py + 18,
    );
    context.stroke();
  }
}

export function drawTreeFar(
  context: CanvasRenderingContext2D,
  tile: WorldTreeAtlasTile,
  species: WorldTreeSpecies,
): void {
  const [x, y] = tileOrigin(tile);
  const size = TREE_ATLAS_TILE_SIZE;
  context.clearRect(x, y, size, size);
  const center = x + size * 0.5;
  const ground = y + size * 0.94;
  context.strokeStyle = species === "birch"
    ? TREE_ATLAS_COLORS.birchBark
    : TREE_ATLAS_COLORS.barkBase;
  context.lineWidth = species === "birch" ? 13 : 17;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(center, ground);
  context.lineTo(center + (species === "birch" ? 4 : -3), y + size * 0.36);
  context.stroke();
  if (species === "birch") {
    context.strokeStyle = TREE_ATLAS_COLORS.birchMark;
    context.lineWidth = 3;
    for (let mark = 0; mark < 7; mark += 1) {
      const py = ground - 26 - mark * 15;
      context.beginPath();
      context.moveTo(center - 8, py);
      context.lineTo(center + 9, py + 2);
      context.stroke();
    }
  }
  if (species === "evergreen") {
    drawFarEvergreen(context, x, y, size);
  } else {
    drawFarBroadCrown(context, x, y, size, species);
  }
}

function drawFarBroadCrown(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  species: "oak" | "birch",
): void {
  const base = species === "oak"
    ? TREE_ATLAS_COLORS.oakBase
    : TREE_ATLAS_COLORS.birchBase;
  const dark = species === "oak"
    ? TREE_ATLAS_COLORS.oakDark
    : TREE_ATLAS_COLORS.birchDark;
  const light = species === "oak"
    ? TREE_ATLAS_COLORS.oakLight
    : TREE_ATLAS_COLORS.birchLight;
  const count = species === "oak" ? 17 : 22;
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.3999632297;
    const radius = 16 + (index % 5) * 4;
    const reachX = species === "oak" ? 72 : 52;
    const reachY = species === "oak" ? 50 : 72;
    const cx =
      x + size * 0.5 + Math.cos(angle) * ((index * 19) % reachX);
    const cy =
      y +
      size * (species === "oak" ? 0.36 : 0.34) +
      Math.sin(angle) * ((index * 23) % reachY);
    context.fillStyle = index % 6 === 0
      ? light
      : index % 2 === 0
        ? base
        : dark;
    context.beginPath();
    context.ellipse(
      cx,
      cy,
      radius * (species === "oak" ? 1.25 : 0.8),
      radius,
      angle * 0.2,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

function drawFarEvergreen(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const center = x + size * 0.5;
  const layers = [
    { top: 0.13, bottom: 0.45, half: 37 },
    { top: 0.27, bottom: 0.66, half: 58 },
    { top: 0.42, bottom: 0.84, half: 76 },
  ];
  layers.forEach((layer, index) => {
    context.fillStyle = index === 0
      ? TREE_ATLAS_COLORS.evergreenLight
      : index === 1
        ? TREE_ATLAS_COLORS.evergreenBase
        : TREE_ATLAS_COLORS.evergreenDark;
    context.beginPath();
    context.moveTo(center, y + size * layer.top);
    context.lineTo(center - layer.half, y + size * layer.bottom);
    context.quadraticCurveTo(
      center,
      y + size * (layer.bottom - 0.08),
      center + layer.half,
      y + size * layer.bottom,
    );
    context.closePath();
    context.fill();
  });
}

function tileOrigin(tile: WorldTreeAtlasTile): readonly [number, number] {
  return [tile.column * TREE_ATLAS_TILE_SIZE, tile.row * TREE_ATLAS_TILE_SIZE];
}
