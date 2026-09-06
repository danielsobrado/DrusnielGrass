import * as THREE from "three";
import { TerrainField } from "../../src/world/TerrainField";
import { WorldConfigLoader } from "../../src/world/WorldConfigLoader";
import type { WorldEcologySample } from "../../src/world/ecology/WorldEcologyField";

/**
 * Side-by-side view of the ecological fields over the whole world.
 *
 * Canvas 2D only, no WebGL: the fields are CPU functions, so the probe that
 * inspects them should not need a GPU. That also makes it usable under software
 * rendering, where the full world takes minutes and this takes seconds.
 *
 * The point of viewing the channels together is to check that they *agree* —
 * dry ground should be the same ground that is rocky, thin-soiled and sun-facing.
 * A channel that looks plausible alone but disagrees with its neighbours is the
 * failure this layer exists to prevent.
 */

const params = new URLSearchParams(window.location.search);
const resolution = Math.min(
  1024,
  Math.max(64, Number(params.get("res") ?? 384)),
);
const span = Number(params.get("span") ?? 0);

const out = document.querySelector<HTMLElement>("#out");
const panels = document.querySelector<HTMLElement>("#panels");
if (!panels) {
  throw new Error("Missing #panels.");
}

const request = new XMLHttpRequest();
request.open("GET", "/config/world.yaml", false);
request.send();
const config = new WorldConfigLoader().parse(request.responseText);
const field = new TerrainField(config);

const worldSize = span > 0 ? span : config.worldSize;
const half = worldSize * 0.5;
const centreX = Number(params.get("x") ?? 0);
const centreZ = Number(params.get("z") ?? 0);

type Channel = {
  readonly label: string;
  readonly paint: (
    ecology: WorldEcologySample,
    colour: THREE.Color,
    shade: number,
  ) => [number, number, number];
};

function ramp(value: number, low: [number, number, number], high: [number, number, number]): [number, number, number] {
  return [
    low[0] + (high[0] - low[0]) * value,
    low[1] + (high[1] - low[1]) * value,
    low[2] + (high[2] - low[2]) * value,
  ];
}

const CHANNELS: readonly Channel[] = [
  {
    label: "ground colour (shaded)",
    paint: (_ecology, colour, shade) => [
      encode(colour.r * shade),
      encode(colour.g * shade),
      encode(colour.b * shade),
    ],
  },
  {
    label: "moisture — parched → saturated",
    paint: (ecology) => ramp(ecology.moisture, [148, 108, 62], [42, 96, 168]),
  },
  {
    label: "fertility — bare → deep soil",
    paint: (ecology) => ramp(ecology.fertility, [126, 118, 104], [58, 132, 52]),
  },
  {
    label: "rockiness — buried → exposed",
    paint: (ecology) => ramp(ecology.rockiness, [40, 58, 44], [214, 210, 198]),
  },
  {
    label: "exposure — shaded → sunward",
    paint: (ecology) => ramp(ecology.exposure, [38, 52, 84], [246, 226, 150]),
  },
  {
    label: "disturbance — untouched → tread",
    paint: (ecology) => ramp(ecology.disturbance, [30, 46, 34], [206, 128, 74]),
  },
];

function encode(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  const value =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(value * 255);
}

const heights = new Float32Array(resolution * resolution);
const metresPerCell = worldSize / resolution;
for (let row = 0; row < resolution; row += 1) {
  for (let column = 0; column < resolution; column += 1) {
    const x = centreX - half + (column + 0.5) * metresPerCell;
    const z = centreZ - half + (row + 0.5) * metresPerCell;
    heights[row * resolution + column] = field.sampleHeight(x, z);
  }
}

function heightAt(column: number, row: number): number {
  const c = Math.max(0, Math.min(resolution - 1, column));
  const r = Math.max(0, Math.min(resolution - 1, row));
  return heights[r * resolution + c];
}

const images = CHANNELS.map(() => new ImageData(resolution, resolution));
const normal = new THREE.Vector3();
const colour = new THREE.Color();
const started = performance.now();

for (let row = 0; row < resolution; row += 1) {
  for (let column = 0; column < resolution; column += 1) {
    const x = centreX - half + (column + 0.5) * metresPerCell;
    const z = centreZ - half + (row + 0.5) * metresPerCell;
    const height = heightAt(column, row);
    normal
      .set(
        heightAt(column - 1, row) - heightAt(column + 1, row),
        metresPerCell * 2,
        heightAt(column, row - 1) - heightAt(column, row + 1),
      )
      .normalize();
    const suitability = field.sampleGrassSuitability(x, z, height, normal);
    const ecology = field.sampleEcologyAt(x, z, height);
    field.sampleColor(x, z, height, suitability, ecology, colour);
    const shade = Math.max(
      0.35,
      Math.min(1.6, normal.x * 0.83 + normal.z * 0.52 + normal.y),
    );

    const offset = (row * resolution + column) * 4;
    for (let index = 0; index < CHANNELS.length; index += 1) {
      const [r, g, b] = CHANNELS[index].paint(ecology, colour, shade);
      const data = images[index].data;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
}

CHANNELS.forEach((channel, index) => {
  const figure = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  canvas.getContext("2d")?.putImageData(images[index], 0, 0);
  const caption = document.createElement("figcaption");
  caption.textContent = channel.label;
  figure.append(canvas, caption);
  panels.appendChild(figure);
});

if (out) {
  out.textContent = `${resolution}² over ${worldSize} m centred ${centreX}, ${centreZ} · ${(performance.now() - started).toFixed(0)} ms`;
}
document.title = "Ecology field probe · ready";
