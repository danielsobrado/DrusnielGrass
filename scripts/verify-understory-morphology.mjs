import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

/**
 * The understory's plant art, measured rather than described.
 *
 * Broadleaf and shrub foliage are large, low-contrast, mid-green shapes filling
 * the same visual role, so with two phenotype rows apiece a stand of them read
 * as one undifferentiated green mass. Density could not fix that and neither
 * could the palette: the missing information was silhouette. This gate exists
 * because the community field concentrates exactly that pair, so a regression
 * here would be amplified rather than absorbed.
 *
 * Everything below is measured off the rasterised atlas. Asserting that the
 * source contains the word "serration" would prove someone wrote it, not that
 * a leaf has a margin.
 *
 * The atlas is drawn with the Canvas 2D API, so it has to be rasterised by a
 * browser. Chromium runs on SwiftShader here for the same reason the stone
 * captures do: a headless shell has no GPU, and a silently context-less canvas
 * measures as empty rather than as an error.
 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const BROWSER_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];
const PORT = 5233;

/**
 * Alpha coverage bands, as a share of the cell.
 *
 * A leaf is read against the gaps around it, so these are ceilings rather than
 * targets: past them the plant stops being leaves and becomes area. The floors
 * are there because an empty cell would satisfy any ceiling.
 */
const COVERAGE_BANDS = {
  // The floor is low because a juvenile plant legitimately covers less of its
  // card than a mature one, and the card is scaled per instance anyway. What
  // the ceiling guards is the failure this pass is about; the floor only guards
  // an empty cell.
  "broadleaf-rosette": { min: 0.05, max: 0.42 },
  "low-shrub": { min: 0.05, max: 0.38 },
  fern: { min: 0.05, max: 0.34 },
  "small-fern": { min: 0.04, max: 0.34 },
};
/**
 * Silhouette distance is Jaccard -- the share of the two masks' *union* they do
 * not share -- rather than a share of the cell.
 *
 * These plants cover eight to twenty per cent of their cell, so a cell-relative
 * metric is bounded above by roughly their coverage: a sparse plant could never
 * fail it and a dense one could never pass. Normalising by the union asks the
 * question that was meant all along, which is whether two masks are the same
 * shape, and does it independently of how much of the cell they occupy.
 *
 * The thresholds are statable rules rather than tuned numbers: no two phenotype
 * rows of one species may be more alike than unlike, and the two families must
 * share at most a third of theirs.
 */
const MIN_ROW_DISTANCE = 0.5;
/** Broadleaf and shrub must differ by this much, across every row pair. */
const MIN_FAMILY_DISTANCE = 0.65;
/**
 * Share of a plant's own area it must *not* share with its mirror image,
 * reflected about its centroid.
 */
const MIN_ASYMMETRY = 0.25;
/**
 * Perimeter^2 / area of the largest connected component. A smooth blob scores
 * about 12.5 (4*pi); a margin with teeth scores far higher. Measured on the
 * whole mask rather than per leaf, so a plant with several separated leaves
 * scores high partly through having gaps -- which is the same property being
 * asked for.
 */
const MIN_ISOPERIMETRIC = 22;

function fail(message) {
  throw new Error(`[understory-morphology] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const server = await createServer({
  root: REPOSITORY_ROOT,
  server: { port: PORT, strictPort: true },
});
await server.listen();

const browser = await chromium.launch({ args: BROWSER_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://localhost:${PORT}/index.html`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });

  const measured = await page.evaluate(async () => {
    const factoryModule = await import(
      "/src/world/grass/WorldDetailFoliageAtlasFactory.ts"
    );
    const atlas = new factoryModule.WorldDetailFoliageAtlasFactory().create();
    const context = atlas.canvas.getContext("2d");
    const cellSize = atlas.cellResolution + atlas.padding * 2;
    const cells = {};
    for (let row = 0; row < atlas.variantRows; row += 1) {
      for (const species of atlas.species) {
        const image = context.getImageData(
          species.index * cellSize + atlas.padding,
          row * cellSize + atlas.padding,
          atlas.cellResolution,
          atlas.cellResolution,
        );
        // Binarised at half coverage. The atlas premultiplies, so a partially
        // covered edge texel is genuinely partial rather than dark.
        const size = atlas.cellResolution;
        const mask = new Uint8Array(size * size);
        let covered = 0;
        for (let index = 0; index < size * size; index += 1) {
          const inside = image.data[index * 4 + 3] >= 128 ? 1 : 0;
          mask[index] = inside;
          covered += inside;
        }
        cells[`${species.key}:${row}`] = {
          key: species.key,
          row,
          size,
          covered,
          mask: Array.from(mask),
        };
      }
    }
    return {
      width: atlas.width,
      height: atlas.height,
      variantRows: atlas.variantRows,
      columns: atlas.columns,
      cellResolution: atlas.cellResolution,
      cells,
    };
  });

  assert(errors.length === 0, `Page errors while building the atlas: ${errors[0]}`);
  assert(
    measured.variantRows === 4,
    `The atlas carries ${measured.variantRows} phenotype rows; four maturation states are what separate the understory families.`,
  );
  assert(
    measured.height === measured.variantRows * (measured.cellResolution + 16),
    `Atlas height ${measured.height} does not match ${measured.variantRows} rows.`,
  );

  const cell = (key, row) => measured.cells[`${key}:${row}`];
  const area = (entry) => entry.covered / (entry.size * entry.size);

  // --- Coverage: leaves, not area ---
  for (const [key, band] of Object.entries(COVERAGE_BANDS)) {
    for (let row = 0; row < measured.variantRows; row += 1) {
      const entry = cell(key, row);
      assert(entry !== undefined, `Atlas is missing ${key} row ${row}.`);
      const coverage = area(entry);
      assert(
        coverage >= band.min && coverage <= band.max,
        `${key} row ${row} covers ${(coverage * 100).toFixed(1)}% of its cell, outside the ${(band.min * 100).toFixed(0)}-${(band.max * 100).toFixed(0)}% band. Above it the plant stops reading as leaves and becomes a mass.`,
      );
    }
  }

  const jaccardDistance = (a, b) => {
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < a.mask.length; index += 1) {
      const left = a.mask[index];
      const right = b.mask[index];
      if (left === 1 && right === 1) {
        intersection += 1;
      }
      if (left === 1 || right === 1) {
        union += 1;
      }
    }
    return union === 0 ? 0 : 1 - intersection / union;
  };

  // --- Rows must be different plants, not the same plant reseeded ---
  for (const key of Object.keys(COVERAGE_BANDS)) {
    for (let a = 0; a < measured.variantRows; a += 1) {
      for (let b = a + 1; b < measured.variantRows; b += 1) {
        const distance = jaccardDistance(cell(key, a), cell(key, b));
        assert(
          distance >= MIN_ROW_DISTANCE,
          `${key} rows ${a} and ${b} share ${((1 - distance) * 100).toFixed(1)}% of their combined area. Rows that differ by a reseed still read as one plant.`,
        );
      }
    }
  }

  // --- The two families must not be confusable ---
  for (let a = 0; a < measured.variantRows; a += 1) {
    for (let b = 0; b < measured.variantRows; b += 1) {
      const distance = jaccardDistance(
        cell("broadleaf-rosette", a),
        cell("low-shrub", b),
      );
      assert(
        distance >= MIN_FAMILY_DISTANCE,
        `broadleaf-rosette row ${a} and low-shrub row ${b} share ${((1 - distance) * 100).toFixed(1)}% of their combined area; a mixed stand of them would read as one plant twice.`,
      );
    }
  }

  // --- A rosette lies down and a shrub stands up ---
  const extent = (entry) => {
    let minX = entry.size;
    let maxX = -1;
    let minY = entry.size;
    let maxY = -1;
    for (let y = 0; y < entry.size; y += 1) {
      for (let x = 0; x < entry.size; x += 1) {
        if (entry.mask[y * entry.size + x] === 0) {
          continue;
        }
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { width: maxX - minX + 1, height: maxY - minY + 1 };
  };
  for (let row = 0; row < measured.variantRows; row += 1) {
    const rosette = extent(cell("broadleaf-rosette", row));
    const shrub = extent(cell("low-shrub", row));
    const rosetteRatio = rosette.width / rosette.height;
    const shrubRatio = shrub.width / shrub.height;
    assert(
      rosetteRatio > shrubRatio,
      `Row ${row}: the rosette (${rosetteRatio.toFixed(2)}) is not wider relative to its height than the shrub (${shrubRatio.toFixed(2)}). Ground-hugging against upright is what separates them at range.`,
    );
  }

  // --- Plants are asymmetric, not mirrored ---
  //
  // Measured by reflecting the mask about its own centroid's vertical axis and
  // asking how much of the union the shape and its mirror fail to share. An
  // earlier version compared left and right pixel counts about the centroid,
  // which is very nearly zero for any shape by the definition of a centroid --
  // it would have passed a perfectly mirrored plant.
  for (const key of ["broadleaf-rosette", "low-shrub", "fern"]) {
    for (let row = 0; row < measured.variantRows; row += 1) {
      const entry = cell(key, row);
      let total = 0;
      let weightedX = 0;
      for (let y = 0; y < entry.size; y += 1) {
        for (let x = 0; x < entry.size; x += 1) {
          if (entry.mask[y * entry.size + x] === 1) {
            total += 1;
            weightedX += x;
          }
        }
      }
      const axis = weightedX / Math.max(total, 1);
      let intersection = 0;
      let union = 0;
      for (let y = 0; y < entry.size; y += 1) {
        for (let x = 0; x < entry.size; x += 1) {
          const here = entry.mask[y * entry.size + x];
          const mirroredX = Math.round(2 * axis - x);
          const mirrored =
            mirroredX >= 0 && mirroredX < entry.size
              ? entry.mask[y * entry.size + mirroredX]
              : 0;
          if (here === 1 && mirrored === 1) {
            intersection += 1;
          }
          if (here === 1 || mirrored === 1) {
            union += 1;
          }
        }
      }
      const asymmetry = union === 0 ? 0 : 1 - intersection / union;
      assert(
        asymmetry >= MIN_ASYMMETRY,
        `${key} row ${row} shares ${((1 - asymmetry) * 100).toFixed(1)}% of its area with its own mirror image; a mirrored plant reads as printed rather than grown.`,
      );
    }
  }

  // --- Margins have structure ---
  for (const key of Object.keys(COVERAGE_BANDS)) {
    for (let row = 0; row < measured.variantRows; row += 1) {
      const entry = cell(key, row);
      let perimeter = 0;
      for (let y = 0; y < entry.size; y += 1) {
        for (let x = 0; x < entry.size; x += 1) {
          if (entry.mask[y * entry.size + x] === 0) {
            continue;
          }
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (
              nx < 0 ||
              ny < 0 ||
              nx >= entry.size ||
              ny >= entry.size ||
              entry.mask[ny * entry.size + nx] === 0
            ) {
              perimeter += 1;
            }
          }
        }
      }
      const ratio = (perimeter * perimeter) / Math.max(entry.covered, 1);
      assert(
        ratio >= MIN_ISOPERIMETRIC,
        `${key} row ${row} scores ${ratio.toFixed(1)} on perimeter²/area; below ${MIN_ISOPERIMETRIC} the plant is a smooth blob rather than leaves with margins and gaps.`,
      );
    }
  }

  // --- The packing must match what the shader decodes ---
  const { readFileSync } = await import("node:fs");
  const speciesSource = readFileSync(
    resolve(REPOSITORY_ROOT, "src/grass/biome/GrassAccentSpecies.ts"),
    "utf8",
  );
  const materialSource = readFileSync(
    resolve(REPOSITORY_ROOT, "src/world/grass/WorldDetailFoliageMaterial.ts"),
    "utf8",
  );
  const packStride = Number(
    speciesSource.match(/return speciesIndex \* (\d+) \+ variantRow \* 8/)?.[1],
  );
  const decodeStride = Number(
    materialSource.match(/floor\(accent \/ (\d+)\.0\)/)?.[1],
  );
  assert(
    Number.isFinite(packStride) && packStride === decodeStride,
    `packGrassAccent strides by ${packStride} but the shader decodes by ${decodeStride}; every card would resolve to the wrong atlas cell.`,
  );
  assert(
    packStride >= measured.variantRows * 8,
    `A stride of ${packStride} cannot address ${measured.variantRows} phenotype rows of 8 tints.`,
  );

  console.log(
    `[understory-morphology] ${measured.columns}x${measured.variantRows} atlas at ${measured.width}x${measured.height}: coverage, row and family distinctness, asymmetry, margin structure, and packing verified.`,
  );
} finally {
  await browser.close();
  await server.close();
}
