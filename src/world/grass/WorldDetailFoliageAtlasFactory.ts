import * as THREE from "three";
import {
  GRASS_ACCENT_SPECIES,
  type GrassAccentSpeciesDefinition,
} from "../../grass/biome/GrassAccentSpecies";
import { SeededRandom } from "../../grass/internal/SeededRandom";

/**
 * Bakes the detail-foliage atlas with Canvas 2D at init, exactly as
 * {@link WorldGrassImpostorAtlasFactory} bakes the impostor atlas.
 *
 * The channels are semantic, not display colour — the same decision that keeps
 * the impostors preset- and biome-consistent for free:
 *
 * | channel | meaning |
 * | --- | --- |
 * | R | root-to-tip progress, fed to `grassResolvePalette` |
 * | G | per-shape shade, fed to the same palette |
 * | B | accent-tint strength on petals and seed clusters |
 * | A | coverage; premultiplied, mipped, and cut with a distance-compensated test |
 *
 * Nothing here is derived from reference imagery: every cell is drawn from a
 * seeded routine, so the atlas is deterministic, recolourable through the
 * shared palette, and carries no third-party licence.
 */

/** Drawn pixels per cell, before padding. */
export const DETAIL_FOLIAGE_CELL_RESOLUTION = 112;
/**
 * Transparent gutter around each cell. Coarse mip levels average across cell
 * boundaries; the gutter plus the shader's half-texel UV clamp keeps a species
 * from bleeding its neighbour's silhouette at distance.
 */
export const DETAIL_FOLIAGE_CELL_PADDING = 8;
/**
 * Four phenotype rows per species, and they are maturation states rather than
 * reseeds: a population that differs only in random seed still reads as one
 * plant.
 *
 * Two was survivable for flowers, where the tint channel supplies most of the
 * variety and the silhouette is small and high-contrast. It was not survivable
 * for broadleaf and shrub foliage. Those are large, low-contrast, mid-green
 * shapes occupying the same visual role, so two silhouettes across the whole
 * world made a patch of them read as one undifferentiated mass — which is what
 * the community field would otherwise have concentrated rather than fixed.
 *
 * Four rows cost 1.3 MB of atlas. Nothing about that is close to a limit.
 */
export const DETAIL_FOLIAGE_VARIANT_ROWS = 4;

/**
 * What a phenotype row means. Ordered by how much leaf area the plant carries,
 * so a row index reads as a stage rather than as an arbitrary bucket.
 */
export const FOLIAGE_PHENOTYPE_JUVENILE = 0;
export const FOLIAGE_PHENOTYPE_MATURE = 1;
export const FOLIAGE_PHENOTYPE_SENESCENT = 2;
export const FOLIAGE_PHENOTYPE_GRAZED = 3;

export interface WorldDetailFoliageAtlas {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  species: readonly GrassAccentSpeciesDefinition[];
  columns: number;
  variantRows: number;
  cellResolution: number;
  padding: number;
  width: number;
  height: number;
}

const ATLAS_SEED = 0x5f_35_6d_11;
const BYTE_MAX = 255;

function encode(
  progress: number,
  shade: number,
  tintMask: number,
  alpha = 1,
): string {
  const red = Math.round(THREE.MathUtils.clamp(progress, 0, 1) * BYTE_MAX);
  const green = Math.round(THREE.MathUtils.clamp(shade, 0, 1) * BYTE_MAX);
  const blue = Math.round(THREE.MathUtils.clamp(tintMask, 0, 1) * BYTE_MAX);
  return `rgba(${red}, ${green}, ${blue}, ${THREE.MathUtils.clamp(alpha, 0, 1)})`;
}

export class WorldDetailFoliageAtlasFactory {
  create(): WorldDetailFoliageAtlas {
    const cellSize =
      DETAIL_FOLIAGE_CELL_RESOLUTION + DETAIL_FOLIAGE_CELL_PADDING * 2;
    const columns = GRASS_ACCENT_SPECIES.length;
    const width = columns * cellSize;
    const height = DETAIL_FOLIAGE_VARIANT_ROWS * cellSize;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error(
        "Unable to create the detail foliage atlas canvas context.",
      );
    }
    context.clearRect(0, 0, width, height);

    for (let row = 0; row < DETAIL_FOLIAGE_VARIANT_ROWS; row += 1) {
      for (const species of GRASS_ACCENT_SPECIES) {
        this.drawCell(context, species, species.index, row, cellSize);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = "world-grass-detail-foliage-atlas";
    // RGB stores progress, shade, and the tint mask, never display colour.
    texture.colorSpace = THREE.NoColorSpace;
    // Keep the semantic channels alpha-weighted through filtering; the shader
    // divides once after the fetch, as the impostor shader does.
    texture.premultiplyAlpha = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return {
      texture,
      canvas,
      species: GRASS_ACCENT_SPECIES,
      columns,
      variantRows: DETAIL_FOLIAGE_VARIANT_ROWS,
      cellResolution: DETAIL_FOLIAGE_CELL_RESOLUTION,
      padding: DETAIL_FOLIAGE_CELL_PADDING,
      width,
      height,
    };
  }

  private drawCell(
    context: CanvasRenderingContext2D,
    species: GrassAccentSpeciesDefinition,
    column: number,
    row: number,
    cellSize: number,
  ): void {
    const resolution = DETAIL_FOLIAGE_CELL_RESOLUTION;
    const originX = column * cellSize + DETAIL_FOLIAGE_CELL_PADDING;
    const originY = row * cellSize + DETAIL_FOLIAGE_CELL_PADDING;
    const random = new SeededRandom(
      (ATLAS_SEED ^ (species.index * 0x9e3779b9) ^ (row * 0x85ebca6b)) >>> 0,
    );

    context.save();
    context.beginPath();
    context.rect(originX, originY, resolution, resolution);
    context.clip();
    // Draw in card space: x spans the card's own width (its aspect, in units of
    // card height) and y runs 0 at the root to 1 at the top, upwards. The
    // non-uniform scale is what lets each routine draw round petals as circles
    // and still have them render round on a card that is not square.
    context.setTransform(
      resolution / species.aspect,
      0,
      0,
      -resolution,
      originX + resolution * 0.5,
      originY + resolution,
    );

    switch (species.key) {
      case "grass-tuft":
        this.drawTuft(context, random, 11, 0.78, 0.62);
        break;
      case "low-shrub":
        this.drawLowShrub(context, random, row);
        break;
      case "fern":
        this.drawFrond(context, random, 1, 0, 0.98, row);
        break;
      case "small-fern":
        this.drawFrond(context, random, 0.68, -0.2, 0.72, row);
        this.drawFrond(context, random, 0.66, 0.21, 0.7, row);
        break;
      case "daisy":
        this.drawDaisy(context, random, row);
        break;
      case "round-bloom":
        this.drawRoundBloom(context, random, row);
        break;
      case "seed-head":
        this.drawSeedHead(context, random);
        break;
      case "broadleaf-rosette":
        this.drawBroadleafRosette(context, random, row);
        break;
      case "clover-patch":
        this.drawCloverPatch(context, random, row);
        break;
      case "leaf-litter":
        this.drawLeafLitter(context, random, row);
        break;
      default:
        throw new Error(
          `No detail foliage drawing routine for species ${species.key}.`,
        );
    }

    context.restore();
  }

  /**
   * A fan of tapered blades sharing a root. `width` is the horizontal reach as
   * a fraction of the card.
   */
  private drawTuft(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    blades: number,
    height: number,
    width: number,
  ): void {
    for (let index = 0; index < blades; index += 1) {
      const side = (index / Math.max(1, blades - 1)) * 2 - 1;
      const lean = side * width * 0.5 * random.range(0.6, 1.15);
      const bladeHeight =
        height * random.range(0.6, 1) * (1 - Math.abs(side) * 0.22);
      const halfWidth = width * random.range(0.03, 0.05);
      const rootX = side * width * 0.06;
      const shade = random.range(0.4, 0.75);
      this.fillBlade(context, rootX, bladeHeight, halfWidth, lean, shade);
    }
  }

  /** One tapered blade, root at `rootX`, tip at `rootX + lean`. */
  private fillBlade(
    context: CanvasRenderingContext2D,
    rootX: number,
    height: number,
    halfWidth: number,
    lean: number,
    shade: number,
  ): void {
    const gradient = context.createLinearGradient(rootX, 0, rootX + lean, height);
    gradient.addColorStop(0, encode(0, shade * 0.86, 0));
    gradient.addColorStop(1, encode(1, shade, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(rootX - halfWidth, 0);
    context.lineTo(rootX + halfWidth, 0);
    context.lineTo(rootX + lean + halfWidth * 0.12, height);
    context.lineTo(rootX + lean - halfWidth * 0.12, height);
    context.closePath();
    context.fill();
  }

  /**
   * A fern frond: a curved central stem with pinnae pairs that shrink toward
   * the tip. Ferns carry no tint mask and sit a shade darker than the tufts.
   */
  private drawFrond(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    scale: number,
    baseX: number,
    curve: number,
    variant = FOLIAGE_PHENOTYPE_MATURE,
  ): void {
    const phenotype = variant % DETAIL_FOLIAGE_VARIANT_ROWS;
    const grazed = phenotype === FOLIAGE_PHENOTYPE_GRAZED;
    const senescent = phenotype === FOLIAGE_PHENOTYPE_SENESCENT;
    const juvenile = phenotype === FOLIAGE_PHENOTYPE_JUVENILE;
    const height = 0.94 * scale * (juvenile ? 0.66 : grazed ? 0.74 : 1);
    // How far the frond arches over. A young frond has barely uncurled and
    // leans hard; a senescent one has collapsed the other way; a mature one
    // stands. Without this the four rows were one stipe at four heights, and a
    // stipe is most of a frond's silhouette -- so they measured as one shape
    // however differently the pinnae were drawn.
    const leanScale = juvenile ? 3.2 : senescent ? -2.1 : grazed ? 1.6 : 1;
    const tipLean = curve * 0.16 * scale * leanScale;
    const shade = random.range(0.26, 0.4);
    const pinnaeShade = shade + 0.08;
    context.fillStyle = encode(0.35, shade, 0);
    context.beginPath();
    context.moveTo(baseX - 0.012 * scale, 0);
    context.quadraticCurveTo(
      baseX + tipLean * 0.4,
      height * 0.55,
      baseX + tipLean,
      height,
    );
    context.lineTo(baseX + tipLean, height);
    context.quadraticCurveTo(
      baseX + tipLean * 0.4 + 0.012 * scale,
      height * 0.55,
      baseX + 0.012 * scale,
      0,
    );
    context.closePath();
    context.fill();

    // Pinna count and spacing are what tell two fern rows apart. Varying only
    // the scale gave four fronds that were the same frond at four sizes, which
    // is the failure this whole pass exists to remove.
    const pairs = juvenile ? 6 : grazed ? 7 : senescent ? 11 : 9;
    // Pinnae were ellipses — the least leaf-like shape available, and the
    // reason a fern read as a feather duster rather than as a plant. They are
    // lance-shaped and toothed now, which is what a pinna actually is.
    for (let index = 0; index < pairs; index += 1) {
      const along = 0.12 + (index / pairs) * 0.84;
      const stemX = baseX + tipLean * along * along;
      const stemY = height * along;
      const missing =
        grazed && random.next() < 0.28
          ? true
          : senescent && random.next() < 0.14;
      if (missing) {
        continue;
      }
      // Lanceolate, not linear. `1 - along * 0.8` gives a straight-sided
      // triangle, which is why a frond read as a conifer rather than as a fern:
      // a real frond is widest a third of the way up and narrows toward both the
      // base and the tip.
      const pinnaProfile = Math.sin(Math.PI * Math.pow(along, 0.62));
      const length =
        pinnaProfile *
        (juvenile ? 0.4 : 0.46) *
        scale *
        random.range(0.85, 1.1);
      // Thin enough that successive pinnae do not merge. A pinna as thick as
      // the spacing between pairs fills the rachis and the frond becomes one
      // shape again -- the gaps between pinnae are what say "fern".
      const thickness = length * (juvenile ? 0.26 : 0.22);
      const droop = 0.18 + along * (senescent ? 0.52 : 0.35);
      const progress = 0.3 + along * 0.7;
      for (const direction of [-1, 1]) {
        context.save();
        // Alternate rather than opposite. Pinnae drawn as mirrored pairs at one
        // height make a ladder, and a ladder of triangles is the other half of
        // the conifer read.
        const stagger = direction > 0 ? 0 : (height * 0.84) / pairs / 2;
        context.translate(stemX, stemY + stagger);
        context.rotate(direction > 0 ? -droop : Math.PI + droop);
        this.fillFoliageLeaf(context, {
          length,
          width: thickness,
          progress,
          shade: pinnaeShade * random.range(0.9, 1.1) * (senescent ? 0.85 : 1),
          asymmetry: random.range(0.06, 0.18) * direction,
          serrations: juvenile ? 2 : 4,
          serrationDepth: senescent ? 0.26 : 0.18,
          fold: 0.1,
          midrib: 0.18,
          curve: random.range(0.06, 0.18) * direction,
          taper: 0.92,
        });
        context.restore();
      }
    }
  }

  /** A stem with two small leaves, shared by the flowering species. */
  private drawStem(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    height: number,
    lean: number,
    shade: number,
  ): void {
    const halfWidth = random.range(0.011, 0.019);
    context.fillStyle = encode(0.25, shade, 0);
    context.beginPath();
    context.moveTo(-halfWidth, 0);
    context.lineTo(halfWidth, 0);
    context.quadraticCurveTo(
      lean * 0.35 + halfWidth * 0.5,
      height * 0.6,
      lean + halfWidth * 0.4,
      height,
    );
    context.lineTo(lean - halfWidth * 0.4, height);
    context.quadraticCurveTo(
      lean * 0.35 - halfWidth * 0.5,
      height * 0.6,
      -halfWidth,
      0,
    );
    context.closePath();
    context.fill();

    const leafCount = random.next() < 0.28 ? 1 : 2;
    for (let leaf = 0; leaf < leafCount; leaf += 1) {
      const direction = leaf % 2 === 0 ? -1 : 1;
      const along = random.range(0.2, 0.52);
      const leafLength = random.range(0.07, 0.11);
      context.save();
      context.translate(lean * along * along, height * along);
      context.rotate(direction * random.range(0.55, 1.15));
      context.fillStyle = encode(
        0.35 + along * 0.2,
        shade * random.range(0.9, 1.12),
        0,
      );
      context.beginPath();
      context.ellipse(
        direction * leafLength * 0.55,
        0,
        leafLength * 0.55,
        leafLength * random.range(0.18, 0.3),
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    }
  }

  /**
   * A tapered petal with a semantic shade and tint-strength gradient. Keeping
   * the tint mask below one near the flower centre lets the palette underneath
   * provide natural depth instead of replacing every petal with one flat RGB.
   */
  private fillPetal(
    context: CanvasRenderingContext2D,
    length: number,
    halfWidth: number,
    baseShade: number,
    tipShade: number,
    baseTint: number,
    tipTint: number,
  ): void {
    const gradient = context.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, encode(0.72, baseShade, baseTint));
    gradient.addColorStop(
      0.55,
      encode(0.9, (baseShade + tipShade) * 0.5, (baseTint + tipTint) * 0.5),
    );
    gradient.addColorStop(1, encode(1, tipShade, tipTint));
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(
      length * 0.16,
      -halfWidth * 0.9,
      length * 0.68,
      -halfWidth * 1.08,
      length,
      0,
    );
    context.bezierCurveTo(
      length * 0.7,
      halfWidth,
      length * 0.18,
      halfWidth * 0.82,
      0,
      0,
    );
    context.closePath();
    context.fill();

    context.strokeStyle = encode(
      0.84,
      baseShade * 0.72,
      Math.max(0.65, baseTint - 0.08),
      0.42,
    );
    context.lineWidth = Math.max(0.0022, halfWidth * 0.11);
    context.beginPath();
    context.moveTo(length * 0.08, 0);
    context.quadraticCurveTo(length * 0.5, halfWidth * 0.08, length * 0.86, 0);
    context.stroke();
  }

  private drawCalyx(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    shade: number,
  ): void {
    context.fillStyle = encode(0.6, shade, 0);
    for (const offset of [-0.5, 0, 0.5]) {
      context.save();
      context.translate(x, y - radius * 0.04);
      context.rotate(-Math.PI * 0.5 + offset);
      context.beginPath();
      context.ellipse(
        radius * 0.2,
        0,
        radius * 0.24,
        radius * 0.07,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    }
  }

  private drawDaisy(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    variant: number,
  ): void {
    const narrow = variant % 2 === 1;
    const height = narrow
      ? random.range(0.78, 0.93)
      : random.range(0.62, 0.78);
    const lean = random.range(narrow ? -0.08 : -0.14, narrow ? 0.08 : 0.14);
    const stemShade = random.range(0.32, 0.5);
    this.drawStem(context, random, height, lean, stemShade);

    const centerX = lean;
    const centerY = height;
    const petals = Math.round(
      narrow ? random.range(10, 14) : random.range(7, 10),
    );
    const petalLength = narrow
      ? random.range(0.07, 0.095)
      : random.range(0.09, 0.12);
    this.drawCalyx(
      context,
      centerX,
      centerY,
      petalLength,
      stemShade * random.range(0.8, 1.05),
    );

    for (let index = 0; index < petals; index += 1) {
      // An occasional shorter or missing petal breaks the perfect gear shape.
      if (index > 0 && random.next() < 0.055) {
        continue;
      }
      const angle =
        (index / petals) * Math.PI * 2 + random.range(-0.11, 0.11);
      const length = petalLength * random.range(0.76, 1.18);
      const halfWidth =
        length *
        (narrow ? random.range(0.12, 0.17) : random.range(0.2, 0.28));
      context.save();
      context.translate(centerX, centerY);
      context.rotate(angle);
      this.fillPetal(
        context,
        length,
        halfWidth,
        random.range(0.55, 0.72),
        random.range(0.86, 1),
        random.range(0.78, 0.88),
        random.range(0.94, 1),
      );
      context.restore();
    }

    const centerRadius = petalLength * (narrow ? 0.25 : 0.31);
    context.fillStyle = encode(0.68, 0.42, 0.18);
    context.beginPath();
    context.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = encode(0.84, 0.7, 0.34);
    context.beginPath();
    context.arc(centerX, centerY, centerRadius * 0.68, 0, Math.PI * 2);
    context.fill();

    const centerDots = narrow ? 7 : 5;
    for (let index = 0; index < centerDots; index += 1) {
      const angle = (index / centerDots) * Math.PI * 2 + random.range(-0.2, 0.2);
      context.fillStyle = encode(0.95, random.range(0.72, 0.95), 0.42);
      context.beginPath();
      context.arc(
        centerX + Math.cos(angle) * centerRadius * 0.46,
        centerY + Math.sin(angle) * centerRadius * 0.46,
        centerRadius * random.range(0.08, 0.13),
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }

  private drawRoundBloom(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    variant: number,
  ): void {
    const branched = variant % 2 === 1;
    const height = branched
      ? random.range(0.76, 0.92)
      : random.range(0.6, 0.8);
    const lean = random.range(-0.16, 0.16);
    const stemShade = random.range(0.3, 0.47);
    this.drawStem(context, random, height, lean, stemShade);

    if (branched) {
      const side = random.next() < 0.5 ? -1 : 1;
      const branchStart = 0.58;
      const budX = lean * branchStart * branchStart + side * random.range(0.09, 0.14);
      const budY = height * random.range(0.62, 0.73);
      context.fillStyle = encode(0.38, stemShade * 0.92, 0);
      context.beginPath();
      context.moveTo(
        lean * branchStart * branchStart - 0.008,
        height * branchStart,
      );
      context.quadraticCurveTo(
        budX - side * 0.035,
        budY - 0.035,
        budX,
        budY,
      );
      context.lineTo(budX + side * 0.008, budY + 0.002);
      context.quadraticCurveTo(
        budX - side * 0.025,
        budY - 0.025,
        lean * branchStart * branchStart + 0.008,
        height * branchStart,
      );
      context.closePath();
      context.fill();
      context.save();
      context.translate(budX, budY);
      context.rotate(side * random.range(0.35, 0.7));
      context.fillStyle = encode(0.86, random.range(0.48, 0.66), 0.82);
      context.beginPath();
      context.ellipse(0, 0, 0.025, 0.04, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    const centerX = lean;
    const centerY = height;
    const petalCount = Math.round(
      branched ? random.range(5, 7) : random.range(4, 6),
    );
    const petalLength = branched
      ? random.range(0.075, 0.1)
      : random.range(0.095, 0.13);
    this.drawCalyx(
      context,
      centerX,
      centerY,
      petalLength,
      stemShade * random.range(0.82, 1.08),
    );

    for (let index = 0; index < petalCount; index += 1) {
      const angle =
        (index / petalCount) * Math.PI * 2 + random.range(-0.16, 0.16);
      const length = petalLength * random.range(0.78, 1.16);
      const halfWidth = length * random.range(0.28, 0.39);
      context.save();
      context.translate(centerX, centerY);
      context.rotate(angle);
      context.scale(1, random.range(0.88, 1.08));
      this.fillPetal(
        context,
        length,
        halfWidth,
        random.range(0.4, 0.6),
        random.range(0.72, 0.92),
        random.range(0.76, 0.88),
        random.range(0.9, 0.98),
      );
      context.restore();
    }

    const centerRadius = petalLength * random.range(0.2, 0.27);
    context.fillStyle = encode(0.62, 0.28, 0.12);
    context.beginPath();
    context.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = encode(0.78, 0.48, 0.24);
    context.beginPath();
    context.arc(centerX, centerY, centerRadius * 0.58, 0, Math.PI * 2);
    context.fill();
  }

  /**
   * An upright woody shrub: narrow, tall, many small leaves gathered toward the
   * branch tips, with the stems visible between them.
   *
   * The counterpart to {@link drawBroadleafRosette}'s wide low paddles. The
   * negative space between branches is the point: a shrub read as a mass
   * because its leaves filled the space its branches were supposed to divide.
   */
  private drawLowShrub(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    variant: number,
  ): void {
    const phenotype = variant % DETAIL_FOLIAGE_VARIANT_ROWS;
    const grazed = phenotype === FOLIAGE_PHENOTYPE_GRAZED;
    const senescent = phenotype === FOLIAGE_PHENOTYPE_SENESCENT;
    const mature = phenotype === FOLIAGE_PHENOTYPE_MATURE || senescent;
    const branchCount = grazed
      ? Math.round(random.range(4, 6))
      : mature
        ? Math.round(random.range(6, 8))
        : 5;
    const leafCount = Math.round(
      grazed
        ? random.range(7, 11)
        : mature
          ? random.range(12, 19)
          : random.range(14, 21),
    );
    // More openings than before, and more of them on the grazed and senescent
    // rows: a shrub is read through its gaps.
    const holeCount = grazed ? 4 : senescent ? 3 : mature ? 3 : 2;
    const holeAngles: number[] = [];
    for (let hole = 0; hole < holeCount; hole += 1) {
      holeAngles.push(random.range(-Math.PI * 0.45, Math.PI * 0.45));
    }
    // A woody crown, not a leaf mound. This used to be a 0.2 x 0.16 ellipse,
    // which is a rosette drawn at the base of a shrub: it was most of why a
    // juvenile shrub and a juvenile rosette measured as the same silhouette.
    // The shrub's identity is the column of branches above it.
    const centerShade = random.range(0.22, 0.34);
    context.fillStyle = encode(0.18, centerShade, 0);
    context.beginPath();
    context.ellipse(
      random.range(-0.03, 0.04),
      0.12,
      mature ? 0.1 : 0.08,
      mature ? 0.07 : 0.06,
      random.range(-0.2, 0.2),
      0,
      Math.PI * 2,
    );
    context.fill();

    const aspect = 1.2;
    // Narrowed from 0.45/0.32. A shrub that spreads as wide as it is tall is a
    // rosette; keeping it in a column is half of what separates the two
    // families at the range where only their outlines resolve.
    const span = mature ? 0.34 : 0.26;
    for (let index = 0; index < branchCount; index += 1) {
      const along = index / Math.max(1, branchCount - 1);
      const centerX =
        (along * 2 - 1) * span * aspect + random.range(-0.05, 0.05);
      const top = mature
        ? random.range(0.48, 0.92)
        : random.range(0.55, 0.86);
      const lean = centerX * random.range(0.15, 0.42);
      const shade = random.range(0.28, 0.42);
      context.fillStyle = encode(0.22, shade, 0);
      context.beginPath();
      context.moveTo(centerX * 0.12 - 0.018, 0);
      context.quadraticCurveTo(
        centerX * 0.55,
        top * 0.48,
        centerX + lean * 0.2,
        top,
      );
      context.lineTo(centerX + lean * 0.2 + 0.012, top);
      context.quadraticCurveTo(
        centerX * 0.55 + 0.01,
        top * 0.48,
        centerX * 0.12 + 0.018,
        0,
      );
      context.closePath();
      context.fill();
    }

    for (let index = 0; index < leafCount; index += 1) {
      const along = mature
        ? random.range(0.22, 0.94)
        : random.next() ** 1.35 * 0.85 + 0.12;
      const side = random.range(-span, span) * aspect;
      const angle = Math.atan2(along - 0.18, side);
      let blocked = false;
      for (const hole of holeAngles) {
        if (Math.abs(angle - hole) < 0.38) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        continue;
      }
      const length = mature
        ? random.range(0.1, 0.18)
        : random.range(0.08, 0.16);
      const width = length * random.range(0.38, mature ? 0.6 : 0.58);
      const leafX = side * (0.35 + along * 0.7) + random.range(-0.03, 0.03);
      const leafY = along;
      context.save();
      context.translate(leafX, leafY);
      context.rotate(angle + random.range(-0.35, 0.35));
      this.fillFoliageLeaf(context, {
        length,
        width,
        progress: 0.35 + along * 0.6,
        shade:
          random.range(0.34, 0.58) *
          (along > 0.7 ? 1.08 : 0.92) *
          (senescent ? 0.84 : 1),
        asymmetry: random.range(0.08, 0.22) * (index % 2 === 0 ? 1 : -1),
        // Fewer teeth than the rosette, on a much smaller leaf: the margin has
        // to stay resolvable at the size a shrub leaf actually occupies.
        serrations: 3,
        serrationDepth: senescent ? 0.24 : 0.16,
        fold: 0.13,
        midrib: 0.2,
        curve: random.range(0.08, 0.2) * (index % 2 === 0 ? 1 : -1),
        // Lance-shaped rather than paddle-shaped, the opposite of the rosette.
        taper: random.range(0.86, 1.05),
      });
      context.restore();
    }

    if (mature) {
      // Outriders past the column, so the silhouette is not a clean rectangle.
      const breakers = Math.round(random.range(1, 3));
      for (let index = 0; index < breakers; index += 1) {
        const side = index % 2 === 0 ? -1 : 1;
        context.save();
        context.translate(
          side * random.range(0.34, 0.46) * aspect,
          random.range(0.42, 0.7),
        );
        context.rotate(side * random.range(0.7, 1.2));
        this.fillFoliageLeaf(context, {
          length: random.range(0.12, 0.18),
          width: random.range(0.05, 0.08),
          progress: random.range(0.7, 0.9),
          shade: random.range(0.42, 0.62),
          asymmetry: random.range(0.1, 0.22) * side,
          serrations: 3,
          serrationDepth: 0.18,
          fold: 0.12,
          midrib: 0.2,
          taper: 0.95,
        });
        context.restore();
      }
    }
  }

  /**
   * A ground-hugging rosette: few large leaves, spread wide and low.
   *
   * Deliberately the opposite silhouette to {@link drawLowShrub}, which is
   * upright, narrow and many-leaved. The two used to be large mid-green blobs
   * of the same size class, so a mixed stand of them read as one plant twice —
   * and the community field concentrates exactly this pair, so making them
   * distinguishable is a prerequisite for that work rather than a polish pass.
   *
   * The vertical squash is what does most of it: a rosette's leaves lie down.
   */
  private drawBroadleafRosette(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    variant: number,
  ): void {
    const phenotype = variant % DETAIL_FOLIAGE_VARIANT_ROWS;
    const grazed = phenotype === FOLIAGE_PHENOTYPE_GRAZED;
    const senescent = phenotype === FOLIAGE_PHENOTYPE_SENESCENT;
    const mature =
      phenotype === FOLIAGE_PHENOTYPE_MATURE || senescent;
    // Few and large. Raising the count here is the fastest way back to a mass.
    const leafCount = grazed
      ? Math.round(random.range(4, 6))
      : mature
        ? Math.round(random.range(5, 7))
        : Math.round(random.range(4, 6));
    // Golden-angle phyllotaxis with a per-row phase, not `index * 2pi / count`.
    // Even radial spacing makes the union of a handful of large leaves a disc
    // whatever the leaves themselves look like, which is the shape this whole
    // pass exists to stop drawing — and it made two phenotype rows differ in
    // three per cent of their pixels while looking identical.
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const phase = random.range(0, Math.PI * 2);
    // Where the rosette is thin. A real plant is not radially symmetric: it
    // grows toward light and loses leaves to whatever passed by.
    const gapCenter = random.range(0, Math.PI * 2);
    // The grazed plant is eaten from one side rather than shrunk all over: a wide
    // thin sector with full-length leaves outside it is what reads as damage.
    const gapWidth = grazed ? 2.1 : senescent ? 1.1 : mature ? 0.55 : 0.85;
    const jitter = mature ? 0.34 : 0.22;
    const oneSide = mature ? random.range(0.72, 0.9) : random.range(0.86, 1);
    const otherSide = mature ? random.range(1, 1.14) : 1;
    const rootX = random.range(-0.04, 0.04);
    const rootY = random.range(0.03, 0.08);
    // Leaves lie down rather than standing up. Applied to the whole rosette so
    // the plant's own outline is wide and low before any leaf is drawn.
    // How far the rosette lies down. A juvenile has not spread yet and still
    // stands up; a senescent one has collapsed almost flat. This is the single
    // strongest phenotype signal, because it changes the plant's outline rather
    // than its contents.
    const groundHug = grazed
      ? 0.62
      : senescent
        ? 0.36
        : mature
          ? 0.7
          : 0.92;
    context.fillStyle = encode(0.12, mature ? 0.28 : 0.22, 0);
    context.beginPath();
    context.ellipse(
      rootX,
      rootY,
      mature ? 0.07 : 0.09,
      mature ? 0.05 : 0.07,
      random.range(-0.2, 0.2),
      0,
      Math.PI * 2,
    );
    context.fill();

    // Overall size, on top of the per-leaf differences. A young rosette is not
    // a mature one with shorter leaves, it is a smaller plant; without this the
    // four rows overlapped so heavily around a shared centre that they measured
    // as one shape however differently their leaves were drawn.
    const plantScale = grazed ? 0.82 : senescent ? 1.08 : mature ? 1 : 0.72;
    // A plant eaten from one side keeps its crown off-centre. Scaling and
    // thinning a sector were not enough on their own: two rosettes centred on
    // the same point overlap through their bases whatever happens further out,
    // and it was that shared centre, not the leaves, that made two rows measure
    // as one shape.
    const plantOffsetX = grazed
      ? random.range(0.14, 0.22) * (random.next() < 0.5 ? -1 : 1)
      : 0;
    context.save();
    context.translate(plantOffsetX, rootY);
    context.scale(plantScale, groundHug * plantScale);
    context.translate(0, -rootY);
    // The card is a billboard seen from the side, not a plan view. Spreading
    // leaves around a full circle drew the top-down rosette -- which rendered
    // as a flat star with half its leaves pointing off the bottom of the cell,
    // and no amount of leaf detail rescues that. A side elevation is a fountain:
    // leaves fanning up and outward from a base, the outermost drooping just
    // below horizontal.
    // A senescent rosette has collapsed: its outer leaves lie past horizontal
    // and the whole plant is wider and flatter than the mature one it grew from.
    const spreadLow = senescent ? -0.62 : -0.3;
    const spreadHigh = Math.PI + (senescent ? 0.62 : 0.3);
    for (let index = 0; index < leafCount; index += 1) {
      // Golden-angle progression wrapped into the visible arc: spacing stays
      // irregular, and every leaf lands on the card.
      const along =
        ((phase + index * goldenAngle) % (Math.PI * 2)) / (Math.PI * 2);
      const angle =
        spreadLow +
        along * (spreadHigh - spreadLow) +
        random.range(-jitter, jitter);
      // Leaves inside the thin sector are shortened rather than removed, so the
      // plant keeps a crown and loses a side.
      const fromGap = Math.abs(
        Math.atan2(Math.sin(angle - gapCenter), Math.cos(angle - gapCenter)),
      );
      const gapFloor = grazed ? 0.18 : 0.34;
      const gapScale =
        fromGap < gapWidth
          ? gapFloor + (1 - gapFloor) * (fromGap / gapWidth)
          : 1;
      const sideScale = Math.cos(angle) >= 0 ? otherSide : oneSide;
      const length =
        (grazed
          ? random.range(0.6, 0.82)
          : mature
            ? random.range(0.68, 0.94)
            : random.range(0.52, 0.68)) *
        sideScale *
        gapScale;
      const width =
        length *
        (mature ? random.range(0.4, 0.56) : random.range(0.32, 0.46));
      const offset = random.range(0, 0.04);
      context.save();
      context.translate(
        rootX + Math.cos(angle) * offset,
        rootY + Math.sin(angle) * offset * 0.4,
      );
      context.rotate(angle + random.range(-0.14, 0.14));
      this.fillFoliageLeaf(context, {
        length,
        width,
        progress: 0.28 + (index / leafCount) * 0.55,
        shade:
          random.range(0.32, 0.55) *
          (0.92 + (index % 3) * 0.05) *
          (senescent ? 0.86 : 1),
        // Every leaf gets its own asymmetry, so no two in one rosette are
        // reflections of each other.
        asymmetry: random.range(0.1, 0.26) * (index % 2 === 0 ? 1 : -1),
        serrations: grazed ? 3 : mature ? 5 : 4,
        serrationDepth: senescent ? 0.2 : 0.13,
        fold: 0.16,
        midrib: 0.24,
        curve: random.range(0.05, 0.16) * (index % 2 === 0 ? 1 : -1),
        // Broad-shouldered: a rosette leaf is a paddle, not a lance.
        taper: random.range(0.5, 0.64),
      });
      context.restore();
    }
    context.restore();

    if (grazed) {
      // A bitten leaf keeps its stalk. Two or three stubs is what tells the eye
      // the plant was eaten rather than drawn small.
      const stubs = Math.round(random.range(2, 3));
      for (let index = 0; index < stubs; index += 1) {
        const angle = random.range(-Math.PI, Math.PI);
        context.save();
        context.translate(rootX, rootY);
        context.rotate(angle);
        context.scale(1, groundHug);
        this.fillFoliageLeaf(context, {
          length: random.range(0.12, 0.2),
          width: random.range(0.06, 0.1),
          progress: 0.2,
          shade: random.range(0.26, 0.38),
          taper: 1.15,
          midrib: 0.2,
        });
        context.restore();
      }
    }
  }

  /**
   * A leaf with internal form.
   *
   * The old primitive was a smooth symmetric blob, and every understory species
   * drew every one of its leaves with it. That is most of why a patch of
   * broadleaf or shrub read as an undifferentiated green mass: at any distance
   * where the individual plants are not resolved, a field of identical convex
   * shapes has no structure to see. Nothing about the density or the palette
   * could fix that, because the missing information was silhouette.
   *
   * Four things are added, and each is visible at a different range:
   *
   * - **Asymmetry** breaks the mirrored outline that reads as printed.
   * - **Serrations** give the margin a length scale of its own, so the leaf has
   *   detail at the range where its overall shape has already resolved.
   * - **The fold** fills the two halves as separate paths at different shades,
   *   which is what gives a large leaf form rather than area.
   * - **The midrib** darkens the axis in the shade channel only, so the palette
   *   still owns colour and the rib survives every art direction.
   *
   * The fold and midrib deliberately touch only the G channel. Alpha is
   * geometric coverage in this atlas — the shader treats a partial alpha as a
   * partially covered pixel — so shading by drawing translucent overlays would
   * eat holes in the leaf.
   */
  private fillFoliageLeaf(
    context: CanvasRenderingContext2D,
    options: {
      length: number;
      width: number;
      progress: number;
      shade: number;
      /** Extra half-width on the +y margin, as a fraction. 0 is symmetric. */
      asymmetry?: number;
      /** Notches per margin. 0 leaves the margin smooth. */
      serrations?: number;
      /** Notch depth, as a fraction of the local half-width. */
      serrationDepth?: number;
      /** Shade difference between the two halves. 0 leaves the leaf flat. */
      fold?: number;
      /** Midrib darkening, as a fraction of shade. 0 omits the rib. */
      midrib?: number;
      /** Lateral bow of the leaf's own axis, as a fraction of length. */
      curve?: number;
      /** Taper exponent; lower is broader-shouldered, higher is lance-like. */
      taper?: number;
    },
  ): void {
    const {
      length,
      width,
      progress,
      shade,
      asymmetry = 0,
      serrations = 0,
      serrationDepth = 0,
      fold = 0,
      midrib = 0,
      curve = 0,
      taper = 0.72,
    } = options;
    const half = width * 0.5;
    const segments = 22;

    const axisY = (t: number): number => curve * length * t * t;
    const marginOffset = (t: number, side: number): number => {
      // Sine profile rather than the old quadratics: zero at both ends by
      // construction, so a tip is a point and a base is a stalk without the
      // control points having to be talked into it.
      const profile = Math.sin(Math.PI * Math.pow(t, taper));
      const asymmetric = 1 + side * asymmetry;
      const teeth =
        serrations > 0
          ? 1 -
            serrationDepth *
              (0.5 +
                0.5 *
                  Math.cos(
                    Math.PI * 2 * serrations * t + (side > 0 ? 0 : Math.PI),
                  ))
          : 1;
      return side * half * profile * asymmetric * teeth;
    };

    const fillHalf = (side: number, halfShade: number): void => {
      const gradient = context.createLinearGradient(0, 0, length, 0);
      gradient.addColorStop(0, encode(progress * 0.35, halfShade * 0.78, 0));
      gradient.addColorStop(0.45, encode(progress * 0.72, halfShade, 0));
      gradient.addColorStop(
        1,
        encode(
          Math.min(1, progress + 0.18),
          Math.min(1, halfShade * 1.12),
          0,
        ),
      );
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(0, axisY(0));
      for (let step = 1; step <= segments; step += 1) {
        const t = step / segments;
        context.lineTo(length * t, axisY(t) + marginOffset(t, side));
      }
      for (let step = segments - 1; step >= 0; step -= 1) {
        const t = step / segments;
        context.lineTo(length * t, axisY(t));
      }
      context.closePath();
      context.fill();
    };

    fillHalf(1, Math.min(1, shade * (1 + fold)));
    fillHalf(-1, Math.max(0, shade * (1 - fold)));

    if (midrib > 0) {
      const ribHalf = Math.max(half * 0.06, length * 0.006);
      context.fillStyle = encode(progress * 0.6, shade * (1 - midrib), 0);
      context.beginPath();
      context.moveTo(0, axisY(0));
      for (let step = 1; step <= segments; step += 1) {
        const t = step / segments;
        const taperedRib = ribHalf * (1 - t);
        context.lineTo(length * t, axisY(t) + taperedRib);
      }
      for (let step = segments; step >= 0; step -= 1) {
        const t = step / segments;
        const taperedRib = ribHalf * (1 - t);
        context.lineTo(length * t, axisY(t) - taperedRib);
      }
      context.closePath();
      context.fill();
    }
  }

  /**
   * Trifoliate leaflets on short stems, spread across a card 2.1x as wide as it
   * is tall. Progress stays mid-range: clover is fresh growth, so it should
   * resolve near the blade palette's middle rather than at the dark root.
   */
  private drawCloverPatch(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    variant: number,
  ): void {
    const lush = variant % 2 === 1;
    const clusters = Math.round(lush ? random.range(7, 9) : random.range(5, 7));
    const halfWidth = 0.85;
    for (let index = 0; index < clusters; index += 1) {
      const along = clusters === 1 ? 0.5 : index / (clusters - 1);
      const centerX = (along * 2 - 1) * halfWidth + random.range(-0.07, 0.07);
      const stemTop = random.range(0.3, lush ? 0.68 : 0.55);
      const shade = random.range(0.3, 0.46);
      context.fillStyle = encode(0.22, shade * 0.8, 0);
      context.beginPath();
      context.moveTo(centerX - 0.012, 0);
      context.lineTo(centerX + 0.012, 0);
      context.lineTo(centerX + 0.006, stemTop);
      context.lineTo(centerX - 0.006, stemTop);
      context.closePath();
      context.fill();

      const leafletRadius = random.range(0.1, 0.13);
      const spin = random.range(0, Math.PI * 2);
      for (let leaflet = 0; leaflet < 3; leaflet += 1) {
        const angle = spin + (leaflet / 3) * Math.PI * 2;
        context.save();
        context.translate(
          centerX + Math.cos(angle) * leafletRadius * 0.72,
          stemTop + Math.sin(angle) * leafletRadius * 0.5,
        );
        context.fillStyle = encode(
          random.range(0.52, 0.68),
          shade * random.range(0.95, 1.15),
          0,
        );
        context.beginPath();
        context.ellipse(
          0,
          0,
          leafletRadius,
          leafletRadius * 0.72,
          angle,
          0,
          Math.PI * 2,
        );
        context.fill();
        context.restore();
      }
    }
  }

  /**
   * A flat mat of fallen leaf fragments and moss. The widest, shortest card in
   * the catalogue, and the only one drawn almost entirely below its own
   * mid-height: it exists to close the gap between soil and the shortest blade.
   * Progress stays low so it resolves near the palette root, which is what
   * makes it read as ground rather than as foliage lying on ground.
   */
  private drawLeafLitter(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
    variant: number,
  ): void {
    const deep = variant % 2 === 1;
    const fragments = Math.round(deep ? random.range(16, 22) : random.range(11, 15));
    const halfWidth = 1.15;
    for (let index = 0; index < fragments; index += 1) {
      const centerX = random.range(-halfWidth, halfWidth);
      const centerY = random.range(0.02, deep ? 0.6 : 0.46);
      const length = random.range(0.12, 0.2);
      const shade = random.range(0.24, 0.44);
      context.save();
      context.translate(centerX, centerY);
      context.rotate(random.range(-0.5, 0.5));
      context.fillStyle = encode(
        random.range(0.08, 0.26),
        shade,
        0,
      );
      context.beginPath();
      context.ellipse(0, 0, length, length * random.range(0.3, 0.5), 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    const specks = deep ? 14 : 9;
    for (let index = 0; index < specks; index += 1) {
      context.fillStyle = encode(
        random.range(0.3, 0.45),
        random.range(0.34, 0.52),
        0,
      );
      context.beginPath();
      context.ellipse(
        random.range(-halfWidth, halfWidth),
        random.range(0.02, 0.3),
        random.range(0.03, 0.06),
        random.range(0.02, 0.04),
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }

  private drawSeedHead(
    context: CanvasRenderingContext2D,
    random: SeededRandom,
  ): void {
    const height = random.range(0.72, 0.82);
    const lean = random.range(-0.1, 0.1);
    const shade = random.range(0.4, 0.55);
    const halfWidth = 0.014;
    context.fillStyle = encode(0.3, shade, 0);
    context.beginPath();
    context.moveTo(-halfWidth, 0);
    context.lineTo(halfWidth, 0);
    context.quadraticCurveTo(lean * 0.4, height * 0.6, lean, height);
    context.closePath();
    context.fill();

    const seeds = 14;
    for (let index = 0; index < seeds; index += 1) {
      const along = index / (seeds - 1);
      const seedY = height * (0.6 + along * 0.4);
      const seedX =
        lean * (0.6 + along * 0.4) +
        (index % 2 === 0 ? -1 : 1) * 0.022 +
        random.range(-0.008, 0.008);
      context.save();
      context.translate(seedX, seedY);
      context.rotate((index % 2 === 0 ? -1 : 1) * random.range(0.3, 0.7));
      context.fillStyle = encode(0.95, 0.78, 1);
      context.beginPath();
      context.ellipse(0, 0, 0.038, 0.016, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }
}
