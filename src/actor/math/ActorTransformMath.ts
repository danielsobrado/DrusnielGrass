/**
 * Flat-array transform mathematics for the actor animation runtime.
 *
 * Poses are stored as packed `Float32Array` buffers rather than object graphs,
 * so every helper here reads and writes at an explicit element offset and
 * allocates nothing. Nothing in this module knows what a bone means.
 */

const EPSILON = 1e-8;

/** Writes an identity quaternion at `offset * 4`. */
export function setQuaternionIdentity(
  target: Float32Array,
  offset: number,
): void {
  const base = offset * 4;
  target[base] = 0;
  target[base + 1] = 0;
  target[base + 2] = 0;
  target[base + 3] = 1;
}

/** Writes an XYZ-ordered Euler rotation as a quaternion at `offset * 4`. */
export function setQuaternionFromEulerXyz(
  target: Float32Array,
  offset: number,
  x: number,
  y: number,
  z: number,
): void {
  const cosX = Math.cos(x * 0.5);
  const sinX = Math.sin(x * 0.5);
  const cosY = Math.cos(y * 0.5);
  const sinY = Math.sin(y * 0.5);
  const cosZ = Math.cos(z * 0.5);
  const sinZ = Math.sin(z * 0.5);
  const base = offset * 4;
  target[base] = sinX * cosY * cosZ + cosX * sinY * sinZ;
  target[base + 1] = cosX * sinY * cosZ - sinX * cosY * sinZ;
  target[base + 2] = cosX * cosY * sinZ + sinX * sinY * cosZ;
  target[base + 3] = cosX * cosY * cosZ - sinX * sinY * sinZ;
}

/**
 * Decomposes a quaternion into XYZ-ordered Euler angles.
 *
 * Only joint-limit clamping needs this, and it runs on a handful of joints per
 * frame rather than the whole skeleton.
 */
export function getEulerXyzFromQuaternion(
  source: Float32Array,
  offset: number,
  target: Float32Array,
): void {
  const base = offset * 4;
  const x = source[base];
  const y = source[base + 1];
  const z = source[base + 2];
  const w = source[base + 3];
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const ww = w * w;
  // Rotation-matrix element m13, clamped so a denormalized quaternion cannot
  // push asin() out of domain.
  const m13 = clamp(2 * (x * z + y * w) / (xx + yy + zz + ww || 1), -1, 1);
  target[1] = Math.asin(m13);
  if (Math.abs(m13) < 0.9999999) {
    target[0] = Math.atan2(-2 * (y * z - x * w), 1 - 2 * (xx + yy));
    target[2] = Math.atan2(-2 * (x * y - z * w), 1 - 2 * (yy + zz));
  } else {
    // Gimbal-locked: fold the lost degree of freedom into X.
    target[0] = Math.atan2(2 * (y * z + x * w), 1 - 2 * (xx + zz));
    target[2] = 0;
  }
}

/** Spherical interpolation from `a` toward `b`, written into `target`. */
export function slerpQuaternion(
  target: Float32Array,
  targetOffset: number,
  a: Float32Array,
  aOffset: number,
  b: Float32Array,
  bOffset: number,
  t: number,
): void {
  const targetBase = targetOffset * 4;
  const aBase = aOffset * 4;
  const bBase = bOffset * 4;
  const ax = a[aBase];
  const ay = a[aBase + 1];
  const az = a[aBase + 2];
  const aw = a[aBase + 3];
  let bx = b[bBase];
  let by = b[bBase + 1];
  let bz = b[bBase + 2];
  let bw = b[bBase + 3];

  if (t <= 0) {
    target[targetBase] = ax;
    target[targetBase + 1] = ay;
    target[targetBase + 2] = az;
    target[targetBase + 3] = aw;
    return;
  }

  let cosine = ax * bx + ay * by + az * bz + aw * bw;
  if (cosine < 0) {
    cosine = -cosine;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  let scaleA = 1 - t;
  let scaleB = t;
  if (cosine < 0.9995) {
    const angle = Math.acos(clamp(cosine, -1, 1));
    const sine = Math.sin(angle);
    if (sine > EPSILON) {
      scaleA = Math.sin((1 - t) * angle) / sine;
      scaleB = Math.sin(t * angle) / sine;
    }
  }

  let x = ax * scaleA + bx * scaleB;
  let y = ay * scaleA + by * scaleB;
  let z = az * scaleA + bz * scaleB;
  let w = aw * scaleA + bw * scaleB;
  const length = Math.hypot(x, y, z, w);
  if (length > EPSILON) {
    const inverse = 1 / length;
    x *= inverse;
    y *= inverse;
    z *= inverse;
    w *= inverse;
  } else {
    x = 0;
    y = 0;
    z = 0;
    w = 1;
  }
  target[targetBase] = x;
  target[targetBase + 1] = y;
  target[targetBase + 2] = z;
  target[targetBase + 3] = w;
}

/** Writes `a * b` (apply `b` first, then `a`) into `target`. */
export function multiplyQuaternions(
  target: Float32Array,
  targetOffset: number,
  a: Float32Array,
  aOffset: number,
  b: Float32Array,
  bOffset: number,
): void {
  const aBase = aOffset * 4;
  const bBase = bOffset * 4;
  const ax = a[aBase];
  const ay = a[aBase + 1];
  const az = a[aBase + 2];
  const aw = a[aBase + 3];
  const bx = b[bBase];
  const by = b[bBase + 1];
  const bz = b[bBase + 2];
  const bw = b[bBase + 3];
  const targetBase = targetOffset * 4;
  target[targetBase] = aw * bx + ax * bw + ay * bz - az * by;
  target[targetBase + 1] = aw * by - ax * bz + ay * bw + az * bx;
  target[targetBase + 2] = aw * bz + ax * by - ay * bx + az * bw;
  target[targetBase + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Writes `a * conjugate(b)` into `target`. */
export function multiplyQuaternionConjugate(
  target: Float32Array,
  targetOffset: number,
  a: Float32Array,
  aOffset: number,
  b: Float32Array,
  bOffset: number,
): void {
  const aBase = aOffset * 4;
  const bBase = bOffset * 4;
  const ax = a[aBase];
  const ay = a[aBase + 1];
  const az = a[aBase + 2];
  const aw = a[aBase + 3];
  const bx = -b[bBase];
  const by = -b[bBase + 1];
  const bz = -b[bBase + 2];
  const bw = b[bBase + 3];
  const targetBase = targetOffset * 4;
  target[targetBase] = aw * bx + ax * bw + ay * bz - az * by;
  target[targetBase + 1] = aw * by - ax * bz + ay * bw + az * bx;
  target[targetBase + 2] = aw * bz + ax * by - ay * bx + az * bw;
  target[targetBase + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/**
 * Writes `conjugate(a) * b` into `target`.
 *
 * With `a` as a bind rotation and `b` as an authored pose rotation, this is the
 * local-space delta that can be post-multiplied onto another local pose.
 */
export function multiplyConjugateQuaternion(
  target: Float32Array,
  targetOffset: number,
  a: Float32Array,
  aOffset: number,
  b: Float32Array,
  bOffset: number,
): void {
  const aBase = aOffset * 4;
  const bBase = bOffset * 4;
  const ax = -a[aBase];
  const ay = -a[aBase + 1];
  const az = -a[aBase + 2];
  const aw = a[aBase + 3];
  const bx = b[bBase];
  const by = b[bBase + 1];
  const bz = b[bBase + 2];
  const bw = b[bBase + 3];
  const targetBase = targetOffset * 4;
  target[targetBase] = aw * bx + ax * bw + ay * bz - az * by;
  target[targetBase + 1] = aw * by - ax * bz + ay * bw + az * bx;
  target[targetBase + 2] = aw * bz + ax * by - ay * bx + az * bw;
  target[targetBase + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** True when the quaternion at `offset` is finite and unit length. */
export function isNormalizedQuaternion(
  source: Float32Array,
  offset: number,
  tolerance = 1e-3,
): boolean {
  const base = offset * 4;
  const x = source[base];
  const y = source[base + 1];
  const z = source[base + 2];
  const w = source[base + 3];
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(w)
  ) {
    return false;
  }
  return Math.abs(Math.hypot(x, y, z, w) - 1) <= tolerance;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}
