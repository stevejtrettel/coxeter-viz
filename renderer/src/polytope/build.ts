import {
  add,
  cross,
  dot as vdot,
  norm,
  normSq,
  scale,
  sub,
  tripleCross,
  vec3,
  type Covec,
  type Vec,
  type Vec3,
} from '@/math/vec';
import { Hyperplane } from '@/geometry/Hyperplane';
import type { Geometry, Point2, Point3 } from '@/geometry/types';
import { Polytope, type PolytopeFace, type VertexKind } from './Polytope';

/**
 * The polytope builders (see README). The vertex incident to d walls is the
 * plain orthogonal complement of their covectors — cᵢ·v = 0 is J-free — so
 * ONE cross-product solve serves all three geometries (`cross` /
 * `tripleCross` from math/ — covector ∧ covector is a vector, the role
 * flip); only the "is this a finite point" test and the planar-ordering
 * chart are geometry-aware.
 */

const EPS = 1e-7;
/** Quantum for vertex/wall dedup keys on canonical ambient coordinates. */
const QUANT = 1e-6;

function arrDot(a: number[], b: number[]): number {
  return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

// ───────────────────────────── geometry-aware pieces ─────────────────────────────

/**
 * Interpret a raw vertex-solve vector as finite point(s) of the geometry, or
 * none (README: S gives an antipodal pair for the half-space test to
 * disambiguate; E rejects v₀ ≈ 0, the at-infinity meet of parallel walls;
 * H rejects non-timelike candidates — ideal/hyperideal, deferred).
 */
function pointCandidates<P extends Vec, I>(geom: Geometry<P, I>, raw: Vec): P[] {
  const len = norm(raw);
  if (len < 1e-9) return []; // dependent walls
  switch (geom.kind) {
    case 'spherical': {
      const v = geom.normalize(raw);
      return [v, geom.normalize(scale(v, -1))];
    }
    case 'euclidean':
      return Math.abs(raw[0]) < EPS * len ? [] : [geom.normalize(raw)];
    case 'hyperbolic':
      return geom.form(raw, raw) > -EPS * len * len ? [] : [geom.normalize(raw)];
  }
}

function hemisphereError(): Error {
  return new Error(
    'spherical polytope: the vertex set is not contained in an open hemisphere ' +
      '(e.g. a lune, or a hull spanning too much of the sphere) — refused rather ' +
      'than returning wrong combinatorics. See polytope/README.',
  );
}

/**
 * Planar chart coordinates used ONLY for cyclic ordering: spatial/p₀ for E
 * (the plane itself) and H (Klein); for S a gnomonic chart centered on the
 * vertex centroid (rotate-to-fit), throwing the hemisphere error if any
 * vertex is ≥ 90° from the centroid direction.
 */
function planarize<P extends Vec, I>(geom: Geometry<P, I>, verts: P[]): number[][] {
  const arrs = verts.map((v) => Array.from(v));
  if (geom.kind !== 'spherical') {
    return arrs.map((a) => a.slice(1).map((c) => c / a[0]));
  }
  const n = arrs[0].length;
  const m = new Array<number>(n).fill(0);
  for (const a of arrs) for (let i = 0; i < n; i++) m[i] += a[i];
  const mlen = Math.sqrt(arrDot(m, m));
  if (mlen < 1e-9) throw hemisphereError();
  const mhat = m.map((c) => c / mlen);

  // Orthonormal basis of mhat⊥: Gram–Schmidt the standard axes, dropping the
  // one most parallel to mhat.
  const drop = mhat.reduce((best, c, i, arr) => (Math.abs(c) > Math.abs(arr[best]) ? i : best), 0);
  const basis: number[][] = [];
  for (let a = 0; a < n; a++) {
    if (a === drop) continue;
    const e = Array.from({ length: n }, (_, i) => (i === a ? 1 : 0));
    for (const prev of [mhat, ...basis]) {
      const proj = arrDot(e, prev);
      for (let i = 0; i < n; i++) e[i] -= proj * prev[i];
    }
    const elen = Math.sqrt(arrDot(e, e));
    basis.push(e.map((c) => c / elen));
  }

  return arrs.map((a) => {
    const w = arrDot(a, mhat);
    if (w < EPS) throw hemisphereError();
    return basis.map((e) => arrDot(a, e) / w);
  });
}

// ───────────────────────────── combinatorics ─────────────────────────────

function pairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}
function triples(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) out.push([i, j, k]);
  return out;
}

const quantKey = (v: Vec) =>
  Array.from(v)
    .map((c) => Math.round(c / QUANT))
    .join(',');

/** Deduplicated vertex accumulator; merges the wall-incidence sets of hits. */
class VertexSet<P> {
  readonly verts: P[] = [];
  readonly active: Set<number>[] = [];
  private index = new Map<string, number>();

  add(v: P, key: string, onWalls: number[]): void {
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.verts.length;
      this.verts.push(v);
      this.active.push(new Set());
      this.index.set(key, i);
    }
    for (const w of onWalls) this.active[i].add(w);
  }
}

/** Edges from wall incidence: vertices sharing ≥ d−1 walls bound an edge (README caveat). */
function edgesFromIncidence(active: Set<number>[], dim: number): [number, number][] {
  const edges: [number, number][] = [];
  for (const [i, j] of pairs(active.length)) {
    let shared = 0;
    for (const f of active[i]) if (active[j].has(f)) shared++;
    if (shared >= dim - 1) edges.push([i, j]);
  }
  return edges;
}

/** Cyclic order of planar points by angle around their centroid. */
function cyclicOrder(planar: number[][]): number[] {
  const cx = planar.reduce((s, p) => s + p[0], 0) / planar.length;
  const cy = planar.reduce((s, p) => s + p[1], 0) / planar.length;
  return planar
    .map((p, i) => ({ i, a: Math.atan2(p[1] - cy, p[0] - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((u) => u.i);
}

/** Order one facet's vertex loop cyclically in its plane (Newell normal + in-plane angles). */
function orderFaceLoop(loop: number[], planar: number[][]): number[] {
  if (loop.length < 3) return loop;
  const pts: Vec3[] = loop.map((i) => vec3(planar[i][0], planar[i][1], planar[i][2]));
  const center = scale(
    pts.reduce((c, p) => add(c, p)),
    1 / pts.length,
  );
  const nrm = vec3(0, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nrm[0] += (a[1] - b[1]) * (a[2] + b[2]);
    nrm[1] += (a[2] - b[2]) * (a[0] + b[0]);
    nrm[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const normal = scale(nrm, 1 / norm(nrm));
  const d0 = sub(pts[0], center);
  const e1 = scale(d0, 1 / norm(d0));
  const e2 = cross(normal, e1);
  return loop
    .map((idx, k) => {
      const d = sub(pts[k], center);
      return { idx, a: Math.atan2(vdot(d, e2), vdot(d, e1)) };
    })
    .sort((u, v) => u.a - v.a)
    .map((u) => u.idx);
}

// ───────────────────────────── 2D builders ─────────────────────────────

/** Assemble a polygon from its bounding walls (oriented: interior = side ≤ 0). */
export function fromHalfspaces2<I>(geom: Geometry<Point2, I>, walls: Hyperplane[]): Polytope<Point2> {
  const set = new VertexSet<Point2>();
  for (const [i, j] of pairs(walls.length)) {
    const raw = cross(walls[i].covector, walls[j].covector); // covector ∧ covector → vector
    for (const v of pointCandidates(geom, raw)) {
      if (!walls.every((w) => w.side(v) <= EPS)) continue;
      const on = walls.map((_, k) => k).filter((k) => Math.abs(walls[k].side(v)) < EPS);
      set.add(v, quantKey(v), on);
    }
  }
  if (set.verts.length === 0) return new Polytope(2, [], [], [], [], walls);

  const order = cyclicOrder(planarize(geom, set.verts));
  const verts = order.map((i) => set.verts[i]);
  const kinds = verts.map((): VertexKind => 'finite');
  const edges: [number, number][] =
    verts.length >= 3
      ? verts.map((_, i) => [i, (i + 1) % verts.length] as [number, number])
      : verts.length === 2
        ? [[0, 1]]
        : [];
  return new Polytope(2, verts, kinds, edges, [], walls);
}

/** The geodesic convex hull of a 2D point set: supporting walls, then the half-space build. */
export function fromVertices2<I>(geom: Geometry<Point2, I>, points: Point2[]): Polytope<Point2> {
  if (geom.kind === 'spherical') planarize(geom, points); // conservative hemisphere pre-check (throws)
  const walls: Hyperplane[] = [];
  const seen = new Set<string>();
  for (const [i, j] of pairs(points.length)) {
    const raw = cross(points[i], points[j]); // wall through points i, j (point ∧ point → covector)
    orientSupporting(geom, raw, points, walls, seen);
  }
  return fromHalfspaces2(geom, walls);
}

// ───────────────────────────── 3D builders ─────────────────────────────

/** Assemble a 3-polytope from its bounding walls (oriented: interior = side ≤ 0). */
export function fromHalfspaces3<I>(geom: Geometry<Point3, I>, walls: Hyperplane[]): Polytope<Point3> {
  const set = new VertexSet<Point3>();
  for (const [i, j, k] of triples(walls.length)) {
    const raw = tripleCross(walls[i].covector, walls[j].covector, walls[k].covector);
    for (const v of pointCandidates(geom, raw)) {
      if (!walls.every((w) => w.side(v) <= EPS)) continue;
      const on = walls.map((_, m) => m).filter((m) => Math.abs(walls[m].side(v)) < EPS);
      set.add(v, quantKey(v), on);
    }
  }
  if (set.verts.length === 0) return new Polytope(3, [], [], [], [], walls);

  const planar = planarize(geom, set.verts);
  const edges = edgesFromIncidence(set.active, 3);
  const faces: PolytopeFace[] = [];
  for (let f = 0; f < walls.length; f++) {
    const loop = set.verts.map((_, i) => i).filter((i) => set.active[i].has(f));
    if (loop.length >= 3) faces.push({ loop: orderFaceLoop(loop, planar), facet: f });
  }
  const kinds = set.verts.map((): VertexKind => 'finite');
  return new Polytope(3, set.verts, kinds, edges, faces, walls);
}

/** The geodesic convex hull of a 3D point set. */
export function fromVertices3<I>(geom: Geometry<Point3, I>, points: Point3[]): Polytope<Point3> {
  if (geom.kind === 'spherical') planarize(geom, points); // conservative hemisphere pre-check (throws)
  const walls: Hyperplane[] = [];
  const seen = new Set<string>();
  for (const [i, j, k] of triples(points.length)) {
    const raw = tripleCross(points[i], points[j], points[k]);
    orientSupporting(geom, raw, points, walls, seen);
  }
  return fromHalfspaces3(geom, walls);
}

/**
 * Shared supporting-wall pass of the hull builders: a candidate covector
 * survives iff all points lie weakly on one side; it is then oriented outward
 * (all sides ≤ 0) and deduped by its quantized unit covector.
 */
function orientSupporting<P extends Vec, I>(
  geom: Geometry<P, I>,
  raw: Covec,
  points: P[],
  walls: Hyperplane[],
  seen: Set<string>,
): void {
  const norm2 = geom.pairing(raw, geom.dual(raw)); // cᵀJc
  if (norm2 < EPS * normSq(raw)) return; // not a wall (H: non-spacelike pole)
  let wall = Hyperplane.fromCovector(geom, raw);
  const sides = points.map((p) => wall.side(p));
  if (sides.every((s) => s <= EPS)) {
    // already outward
  } else if (sides.every((s) => s >= -EPS)) {
    wall = Hyperplane.fromCovector(geom, scale(raw, -1));
  } else {
    return; // cuts through the point set ⇒ not supporting
  }
  const key = quantKey(wall.covector);
  if (!seen.has(key)) {
    seen.add(key);
    walls.push(wall);
  }
}
