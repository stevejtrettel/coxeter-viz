/**
 * Ambient vectors for R³ (2D geometries) and R⁴ (3D geometries): flat
 * `Float64Array`s, operated on by IMMUTABLE free functions — every operation
 * returns a fresh array, no in-place mutation, no method chains.
 *
 * The aliases below are documentation, not enforcement (TypeScript is
 * structural): they mark intent at signatures, and the function names do the
 * work. Coordinate 0 is the distinguished coordinate everywhere (time-first /
 * affine convention): `v[0]` is p₀.
 *
 * `dot` / `norm` / `normSq` are the plain Euclidean coordinate operations,
 * used for chart/render-space lengths and directions; the ambient J-forms
 * (Lorentzian etc.) live in `geometry/`, phrased through these.
 */

/** An ambient vector in R³. */
export type Vec3 = Float64Array;
/** An ambient vector in R⁴. */
export type Vec4 = Float64Array;
/** Either ambient vector; the dimension is the array length. */
export type Vec = Float64Array;

/**
 * A covector — an element of the dual space (R³)* / (R⁴)*. Vectors and
 * covectors are both LINEAR objects (V and V*) and live in this layer
 * together; the pairing c·v (`dot`) needs no geometry. Under the ambient
 * duality the cross product flips the role: the product of two covectors is
 * a vector (the polytope vertex solve) and the product of points-as-vectors
 * is a covector (the wall through them).
 *
 * What is deliberately NOT here: `Point`. A point is an element of a
 * geometry's nonlinear locus inside V — a geometric concept, not a
 * linear-algebraic one; its alias lives in `geometry/`, produced by
 * `normalize`.
 */
export type Covec3 = Float64Array;
export type Covec4 = Float64Array;
/** Either covector; the dimension is the array length. */
export type Covec = Float64Array;

export function vec3(a: number, b: number, c: number): Vec3 {
  return Float64Array.of(a, b, c);
}

export function vec4(a: number, b: number, c: number, d: number): Vec4 {
  return Float64Array.of(a, b, c, d);
}

export function clone(v: Vec): Vec {
  return Float64Array.from(v);
}

function sameLength(a: Vec, b: Vec): number {
  if (a.length !== b.length) {
    throw new Error(`vec: dimension mismatch (${a.length} vs ${b.length})`);
  }
  return a.length;
}

/** a + b. */
export function add(a: Vec, b: Vec): Vec {
  const n = sameLength(a, b);
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = a[i] + b[i];
  return r;
}

/** a − b. */
export function sub(a: Vec, b: Vec): Vec {
  const n = sameLength(a, b);
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = a[i] - b[i];
  return r;
}

/** s·v. */
export function scale(v: Vec, s: number): Vec {
  const r = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) r[i] = s * v[i];
  return r;
}

/** a + s·b. */
export function addScaled(a: Vec, b: Vec, s: number): Vec {
  const n = sameLength(a, b);
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = a[i] + s * b[i];
  return r;
}

/** The Euclidean coordinate dot product Σ aᵢbᵢ. */
export function dot(a: Vec, b: Vec): number {
  const n = sameLength(a, b);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Euclidean squared length Σ vᵢ². */
export function normSq(v: Vec): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return s;
}

/** Euclidean length. */
export function norm(v: Vec): number {
  return Math.sqrt(normSq(v));
}

/**
 * The R³ cross product a × b: the vector orthogonal (coordinate-wise) to
 * both, with dot(cross(a,b), x) = det[x; a; b].
 */
export function cross(a: Vec3, b: Vec3): Vec3 {
  if (a.length !== 3 || b.length !== 3) throw new Error('cross: expects R³ vectors');
  return Float64Array.of(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  );
}

/**
 * The R⁴ triple cross product: the vector orthogonal (coordinate-wise) to
 * a, b, c, normalized so that dot(tripleCross(a,b,c), x) = det[x; a; b; c]
 * (cofactor expansion of that determinant along its first row).
 */
export function tripleCross(a: Vec4, b: Vec4, c: Vec4): Vec4 {
  if (a.length !== 4 || b.length !== 4 || c.length !== 4) {
    throw new Error('tripleCross: expects R⁴ vectors');
  }
  // 2×2 minors of the rows (b, c), indexed by the column pair they keep.
  const m01 = b[0] * c[1] - b[1] * c[0];
  const m02 = b[0] * c[2] - b[2] * c[0];
  const m03 = b[0] * c[3] - b[3] * c[0];
  const m12 = b[1] * c[2] - b[2] * c[1];
  const m13 = b[1] * c[3] - b[3] * c[1];
  const m23 = b[2] * c[3] - b[3] * c[2];
  return Float64Array.of(
    a[1] * m23 - a[2] * m13 + a[3] * m12,
    -(a[0] * m23 - a[2] * m03 + a[3] * m02),
    a[0] * m13 - a[1] * m03 + a[3] * m01,
    -(a[0] * m12 - a[1] * m02 + a[2] * m01),
  );
}
