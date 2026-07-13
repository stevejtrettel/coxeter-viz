import { cross, vec3, type Covec, type Vec } from '@/math/vec';
import type { Geometry, GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Hyperplane } from '@/geometry/Hyperplane';
import type { RealizedPolygon } from '@/coxeter/solve';
import type { Model } from '@/models/types';

/**
 * The pure CPU side of the shader contract (README, "uniforms contract"):
 * chart ids, κ, the precomputed κ-trig thresholds, uniform-array packing —
 * all float64, all testable without a GPU. `foldPoint` is the float64
 * reference implementation of the shader's fold loop, used by the tests to
 * pin the algorithm's algebra (chamber membership, parity) against the
 * group layer.
 */

/** Model.name → chart id, matching the dispatch in shader.ts. */
export const CHART_IDS: Readonly<Record<string, number>> = {
  'poincare-disk': 0,
  'klein-disk': 1,
  cartesian: 2,
  stereographic: 3,
  gnomonic: 4,
};

/** The chart id of a flat 2D model; throws on anything else (e.g. Globe2). */
export function chartId(model: Model<Point2>): number {
  const id = CHART_IDS[model.name];
  if (id === undefined || model.renderDim !== 2) {
    throw new Error(`tilingshader: no chart for model '${model.name}' (renderDim ${model.renderDim})`);
  }
  return id;
}

/** κ = +1 / 0 / −1; J = diag(κ, 1, 1). */
export function kappaOf(kind: GeometryKind): number {
  switch (kind) {
    case 'spherical':
      return 1;
    case 'euclidean':
      return 0;
    case 'hyperbolic':
      return -1;
  }
}

/**
 * Edge threshold sin_κ(w): a unit covector's side value at a normalized
 * point is the κ-sine of the distance to the wall (Hyperplane.distanceTo,
 * inverted), so the band |⟨p,c⟩| < sin_κ(w) has intrinsic half-width w.
 */
export function edgeThreshold(kappa: number, halfWidth: number): number {
  if (kappa > 0) return Math.sin(halfWidth);
  if (kappa < 0) return Math.sinh(halfWidth);
  return halfWidth;
}

/**
 * Vertex threshold Q_r: the κ-quadratic form of the difference of two
 * points at distance r — 2(1 − cos r) in S, r² in E, 2(cosh r − 1) in H —
 * monotone in r (on [0, π] in S), so Q(p − v) < Q_r is a metric disk.
 */
export function vertexThreshold(kappa: number, radius: number): number {
  if (kappa > 0) return 2 * (1 - Math.cos(radius));
  if (kappa < 0) return 2 * (Math.cosh(radius) - 1);
  return radius * radius;
}

/** Pack ambient vectors/covectors into a vec3[max] uniform buffer. */
export function packVec3s(vs: readonly Vec[], max: number): Float32Array {
  if (vs.length > max) {
    throw new Error(`tilingshader: ${vs.length} entries exceed the uniform capacity ${max}`);
  }
  const out = new Float32Array(3 * max);
  for (let i = 0; i < vs.length; i++) {
    out[3 * i] = vs[i][0];
    out[3 * i + 1] = vs[i][1];
    out[3 * i + 2] = vs[i][2];
  }
  return out;
}

/**
 * The perpendicular foot of p on the wall — the geometry primitive
 * `Hyperplane.foot` (moved to `src/geometry`); re-exported here because the
 * fold/region machinery below and the coset field use it.
 */
export function footOnWall(
  geom: Geometry<Point2, Isometry2>,
  p: Point2,
  wall: Hyperplane,
): Point2 {
  return wall.foot(geom, p);
}

/** The unit covector of the geodesic through two points (cross convention). */
export function geodesicThrough(
  geom: Geometry<Point2, Isometry2>,
  a: Point2,
  b: Point2,
): Covec {
  const raw = cross(a, b);
  const norm = Math.sqrt(geom.pairing(raw, geom.dual(raw)));
  return vec3(raw[0] / norm, raw[1] / norm, raw[2] / norm);
}

/**
 * The SHARED coset-hue convention (README, field programs), mirrored
 * bit-exactly by the GLSL: bounded coordinates (y,z)/(1+|x|) quantized at
 * 4096, Wang-mixed, 16 bits → hue ∈ [0,1). CPU tiles, SVG exports, and
 * the GPU field all color a coset through this one function.
 */
export function hashHue(v: Point2): number {
  const hx = v[1] / (1 + Math.abs(v[0]));
  const hy = v[2] / (1 + Math.abs(v[0]));
  const qx = Math.floor(hx * 4096) | 0;
  const qy = Math.floor(hy * 4096) | 0;
  let h = (Math.imul(qx, 0x27d4eb2d) ^ Math.imul(qy, 0x9e3779b9)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h & 0xffff) / 65536;
}

export interface RegionRows {
  /** Splitter covectors per wall (zero vector when degenerate: seed ON the wall). */
  split: Covec[];
  /** One sign row per decoration; all-zero rows match everything, null rows nothing. */
  rows: (number[] | null)[];
}

/**
 * The Wythoff region classifier (README, field programs): splitters
 * cross(seed, foot_k); a face type's expected signs sampled at its own
 * chamber vertex. Degenerate faces (seed fixed by the pair's dihedral)
 * get null rows; splitter columns separating no two SURVIVING regions are
 * zeroed — so a lone surviving type matches the whole chamber.
 */
export function regionSignRows(poly: RealizedPolygon, seed: Point2): RegionRows {
  const geom = poly.geom;
  const tol = 1e-9;
  const onWall = poly.walls.map((w) => Math.abs(w.side(seed)) < tol);
  const split: Covec[] = poly.walls.map((w, k) =>
    onWall[k] ? vec3(0, 0, 0) : geodesicThrough(geom, seed, footOnWall(geom, seed, w)),
  );
  // The face of decoration (i,j) survives unless its dihedral orbit of the
  // seed collapses: on both walls, or on one wall of an order-2 pair.
  const decs = poly.spec.decorations;
  const survives = decs.map((d) => {
    const [i, j] = d.walls;
    const fixed = (onWall[i] ? 1 : 0) + (onWall[j] ? 1 : 0);
    return fixed === 0 || (fixed === 1 && d.order > 2);
  });
  // Each decoration's chamber vertex: the one on both of its walls.
  const vertexOf = decs.map((d) => {
    const [i, j] = d.walls;
    const v = poly.chamber.vertices.find(
      (q) => Math.abs(poly.walls[i].side(q)) < 1e-7 && Math.abs(poly.walls[j].side(q)) < 1e-7,
    );
    if (!v) throw new Error('regionSignRows: decoration vertex not found');
    return v;
  });
  const rawSign = (t: number, k: number) => {
    const s = geom.pairing(split[k], vertexOf[t]);
    return Math.abs(s) < tol ? 0 : Math.sign(s);
  };
  // A region is the sector between ITS OWN two splitter segments — the
  // third splitter's full geodesic re-enters the sector, so it must not
  // constrain. And a bounding splitter only constrains when the region
  // across it (the other decoration sharing that wall) survives — else
  // both sides carry this type (e.g. the dodecahedron's whole chamber).
  const rows = decs.map((dec, t) => {
    if (!survives[t]) return null;
    return poly.walls.map((_, k) => {
      if (!dec.walls.includes(k)) return 0; // not a bounding splitter
      const across = decs.findIndex((d, u) => u !== t && d.walls.includes(k));
      if (across < 0 || !survives[across]) return 0;
      return rawSign(t, k);
    });
  });
  return { split, rows };
}

export interface FoldResult {
  /** The folded point, in the chamber when converged. */
  p: Point2;
  /** Reflection count; its parity is the sign character of the carrying element. */
  folds: number;
  converged: boolean;
}

/**
 * The reference fold (float64, mirrors the GLSL loop exactly): sweep the
 * walls in generator order, reflecting p ← p − 2⟨p,c⟩·Jc across every wall
 * with ⟨p,c⟩ > 0, renormalizing each sweep, until a clean sweep or the cap.
 * Converges because every accepted reflection strictly decreases the
 * distance to the incenter (README).
 */
export function foldPoint(
  p: Point2,
  walls: readonly Covec[],
  kappa: number,
  maxSweeps = 200,
): FoldResult {
  const q = Float64Array.from(p);
  let folds = 0;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let moved = false;
    for (const c of walls) {
      const s = q[0] * c[0] + q[1] * c[1] + q[2] * c[2];
      if (s > 0) {
        q[0] -= 2 * s * kappa * c[0];
        q[1] -= 2 * s * c[1];
        q[2] -= 2 * s * c[2];
        folds++;
        moved = true;
      }
    }
    if (kappa === 0) {
      const f = 1 / q[0];
      q[0] = 1;
      q[1] *= f;
      q[2] *= f;
    } else {
      const f = 1 / Math.sqrt(Math.abs(kappa * q[0] * q[0] + q[1] * q[1] + q[2] * q[2]));
      q[0] *= f;
      q[1] *= f;
      q[2] *= f;
    }
    if (!moved) return { p: q, folds, converged: true };
  }
  return { p: q, folds, converged: false };
}
