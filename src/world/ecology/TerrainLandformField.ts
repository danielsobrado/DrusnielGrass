/**
 * Landform shape on a lattice: how convex the ground is, how steeply it falls,
 * and which way it faces — all measured at the scale of a hillside rather than
 * of a bump.
 *
 * Ecology reads this instead of the shading normal, and the distinction is not
 * cosmetic. The height field carries metre-scale micro-noise for the renderer's
 * benefit, so a normal taken across 1.5 m is noisy by design. Feeding that into
 * a threshold like "steep ground sheds its soil" turns the noise into
 * salt-and-pepper rock across the whole world — visible immediately once stone
 * exposure is driven from it, and exactly the random scatter that routing
 * everything through a shared field is meant to eliminate.
 *
 * A ring of samples at landform radius answers all three questions at once:
 * its mean against the centre gives curvature, its opposing pairs give the
 * gradient. Curvature is a second derivative and so amplifies high frequencies
 * hardest, which is why the ring is averaged rather than sampled as a four-point
 * cross.
 *
 * Values are evaluated on a lattice and interpolated because a field measured
 * across tens of metres holds no detail at the one-metre spacing of a terrain
 * vertex. Measured, evaluating it per vertex made ground colour thirty-nine
 * times more expensive and put a single chunk at 35 ms, which the streaming
 * budget cannot pay.
 *
 * The memo changes speed, never results: every value is a pure function of
 * world position and the seed, so eviction cannot alter what is drawn and two
 * machines with different cache pressure still agree.
 */

/** Lattice spacing in metres. */
export const LANDFORM_LATTICE_STEP = 8;
/**
 * Bounded so a long traverse cannot grow the memo without limit. Sized to hold
 * comfortably more than the lattice of one terrain streaming ring, which keeps
 * the hit rate high while chunks are built in spatial order.
 */
const MEMO_LIMIT = 16384;

/** Unit offsets of the sampling ring, at 45° spacing. */
const RING_COUNT = 8;
const RING_OFFSETS = (() => {
  const offsets = new Float64Array(RING_COUNT * 2);
  for (let index = 0; index < RING_COUNT; index += 1) {
    const angle = (index / RING_COUNT) * Math.PI * 2;
    offsets[index * 2] = Math.cos(angle);
    offsets[index * 2 + 1] = Math.sin(angle);
  }
  return offsets;
})();

export interface TerrainLandform {
  /** Positive on spurs and ridges, negative in hollows and drainage lines. */
  convexity: number;
  /** Fall of the land as `1 - normal.y` would express it, at landform scale. */
  slope: number;
  /**
   * Height gradient toward increasing elevation, in metres of rise per metre
   * travelled. Downhill is the negated, normalized pair.
   */
  gradientX: number;
  gradientZ: number;
}

export function createTerrainLandform(): TerrainLandform {
  return { convexity: 0, slope: 0, gradientX: 0, gradientZ: 0 };
}

export type HeightSampler = (x: number, z: number) => number;

interface LatticeEntry {
  readonly convexity: number;
  readonly gradientX: number;
  readonly gradientZ: number;
}

export class TerrainLandformField {
  private readonly memo = new Map<number, LatticeEntry>();

  constructor(
    private readonly sampleHeight: HeightSampler,
    private readonly measureStep: number,
    private readonly curvatureRange: number,
  ) {}

  sample(x: number, z: number, target: TerrainLandform): TerrainLandform {
    const cellX = Math.floor(x / LANDFORM_LATTICE_STEP);
    const cellZ = Math.floor(z / LANDFORM_LATTICE_STEP);
    const fractionX = x / LANDFORM_LATTICE_STEP - cellX;
    const fractionZ = z / LANDFORM_LATTICE_STEP - cellZ;

    const a = this.latticeValue(cellX, cellZ);
    const b = this.latticeValue(cellX + 1, cellZ);
    const c = this.latticeValue(cellX, cellZ + 1);
    const d = this.latticeValue(cellX + 1, cellZ + 1);

    target.convexity = bilinear(
      a.convexity,
      b.convexity,
      c.convexity,
      d.convexity,
      fractionX,
      fractionZ,
    );
    target.gradientX = bilinear(
      a.gradientX,
      b.gradientX,
      c.gradientX,
      d.gradientX,
      fractionX,
      fractionZ,
    );
    target.gradientZ = bilinear(
      a.gradientZ,
      b.gradientZ,
      c.gradientZ,
      d.gradientZ,
      fractionX,
      fractionZ,
    );
    // Expressed the way `1 - normal.y` is, so callers tuned against surface
    // normals keep their intuition for what a given number means.
    const gradient = Math.hypot(target.gradientX, target.gradientZ);
    target.slope = 1 - 1 / Math.sqrt(1 + gradient * gradient);
    return target;
  }

  clear(): void {
    this.memo.clear();
  }

  private latticeValue(cellX: number, cellZ: number): LatticeEntry {
    // Lattice coordinates are small signed integers for any plausible world;
    // packing them into one number keys the memo without allocating a string.
    const key = (cellX & 0xffff) * 0x10000 + (cellZ & 0xffff);
    const cached = this.memo.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const x = cellX * LANDFORM_LATTICE_STEP;
    const z = cellZ * LANDFORM_LATTICE_STEP;
    const step = this.measureStep;
    const centre = this.sampleHeight(x, z);

    let ring = 0;
    let gradientX = 0;
    let gradientZ = 0;
    for (let index = 0; index < RING_COUNT; index += 1) {
      const offsetX = RING_OFFSETS[index * 2];
      const offsetZ = RING_OFFSETS[index * 2 + 1];
      const height = this.sampleHeight(x + offsetX * step, z + offsetZ * step);
      ring += height;
      // Project each sample onto the axes. Summed around a full ring this is a
      // least-squares plane fit through the eight points, which rejects the
      // noise a single opposing pair would pass straight through.
      gradientX += height * offsetX;
      gradientZ += height * offsetZ;
    }

    const meanRise = ring / RING_COUNT - centre;
    // Neighbours above the centre mean a hollow, so the sign is inverted to
    // make "convex" the positive direction.
    //
    // Saturated softly rather than clamped. The distribution is heavy-tailed,
    // so a hard clamp at a mid percentile pins most of the world to ±1 and any
    // wobble between neighbours then reads as a full-scale flip — which is what
    // salt-and-pepper rock looked like when this clipped. tanh keeps the full
    // slope through the common band and lets the tails approach the limit
    // instead of hitting it.
    const entry: LatticeEntry = {
      convexity: Math.tanh(-meanRise / (step * step) / this.curvatureRange),
      // Sum of cos² around the ring is RING_COUNT / 2, which normalizes the
      // projection back to a gradient in metres per metre.
      gradientX: gradientX / ((RING_COUNT / 2) * step),
      gradientZ: gradientZ / ((RING_COUNT / 2) * step),
    };

    if (this.memo.size >= MEMO_LIMIT) {
      const oldest = this.memo.keys().next().value;
      if (oldest !== undefined) {
        this.memo.delete(oldest);
      }
    }
    this.memo.set(key, entry);
    return entry;
  }
}

function bilinear(
  a: number,
  b: number,
  c: number,
  d: number,
  fractionX: number,
  fractionZ: number,
): number {
  const top = a + (b - a) * fractionX;
  const bottom = c + (d - c) * fractionX;
  return top + (bottom - top) * fractionZ;
}
