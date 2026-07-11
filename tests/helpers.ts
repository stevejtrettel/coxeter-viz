/**
 * Shared test scaffolding: the six geometry cells in one table, a seeded rng,
 * random points/tangents built through exp — so every test sweeps all
 * geometries and both dimensions — and the figure-document fixtures.
 */

import { addScaled, scale, type Vec } from '@/math/vec';
import { matMul, matTranspose, type Mat } from '@/math/mat';
import type { Geometry } from '@/geometry/types';
import { Spherical2, Spherical3 } from '@/geometry/Spherical';
import { Euclidean2, Euclidean3 } from '@/geometry/Euclidean';
import { Hyperbolic2, Hyperbolic3 } from '@/geometry/Hyperbolic';

export interface Cell {
  name: string;
  geom: Geometry<Vec, Mat>;
  dim: 2 | 3;
  /** Build an ambient vector, coordinate 0 first. */
  vec: (...c: number[]) => Vec;
  comps: (p: Vec) => number[];
}

const vecN = (...c: number[]) => Float64Array.from(c);
const comps = (p: Vec) => Array.from(p);

export const cells: Cell[] = [
  { name: 'S2', geom: new Spherical2(), dim: 2, vec: vecN, comps },
  { name: 'E2', geom: new Euclidean2(), dim: 2, vec: vecN, comps },
  { name: 'H2', geom: new Hyperbolic2(), dim: 2, vec: vecN, comps },
  { name: 'S3', geom: new Spherical3(), dim: 3, vec: vecN, comps },
  { name: 'E3', geom: new Euclidean3(), dim: 3, vec: vecN, comps },
  { name: 'H3', geom: new Hyperbolic3(), dim: 3, vec: vecN, comps },
];

/** Deterministic rng (mulberry32) so failures reproduce. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random tangent at p: random ambient vector with zero 0-coordinate, made ⟨·,p⟩-orthogonal (exact already for E). */
export function randomTangent(cell: Cell, p: Vec, rand: () => number, len = 1): Vec {
  const c = Array.from({ length: cell.dim + 1 }, (_, i) => (i === 0 ? 0 : 2 * rand() - 1));
  let v = cell.vec(...c);
  if (cell.geom.kind !== 'euclidean') {
    const pp = cell.geom.form(p, p); // ±1
    v = addScaled(v, p, -cell.geom.form(v, p) / pp);
  }
  const s = Math.sqrt(cell.geom.form(v, v));
  return scale(v, len / s);
}

/**
 * A random point at distance ≤ 1.2 from the origin — inside every chart's
 * comfort zone (gnomonic hemisphere needs < π/2, spherical log needs < π).
 */
export function randomPoint(cell: Cell, rand: () => number): Vec {
  const v = randomTangent(cell, cell.geom.origin(), rand, 1.2 * rand());
  return cell.geom.exp(cell.geom.origin(), v);
}

export function expectVecClose(comps: (p: Vec) => number[], a: Vec, b: Vec, tol = 1e-9): void {
  const ca = comps(a);
  const cb = comps(b);
  for (let i = 0; i < ca.length; i++) {
    if (Math.abs(ca[i] - cb[i]) > tol) {
      throw new Error(`vectors differ at component ${i}: [${ca}] vs [${cb}]`);
    }
  }
}

/** Max |entry| difference of two same-size matrices. */
export function matrixDiff(g: Mat, h: Mat): number {
  let m = 0;
  for (let i = 0; i < g.length; i++) m = Math.max(m, Math.abs(g[i] - h[i]));
  return m;
}

/**
 * How far g sits from the isometry group: max |gᵀJg − J| for S/H; for E,
 * the homogeneous checks (row 0 = e₀ᵀ, spatial block orthogonal).
 */
export function isometryResidual(geom: Geometry<Vec, Mat>, g: Mat): number {
  const n = Math.round(Math.sqrt(g.length));
  let res = 0;
  if (geom.kind === 'euclidean') {
    res = Math.abs(g[0] - 1);
    for (let c = 1; c < n; c++) res = Math.max(res, Math.abs(g[c]));
    for (let a = 1; a < n; a++) {
      for (let b = 1; b < n; b++) {
        let s = 0;
        for (let r = 1; r < n; r++) s += g[r * n + a] * g[r * n + b];
        res = Math.max(res, Math.abs(s - (a === b ? 1 : 0)));
      }
    }
    return res;
  }
  const kappa = geom.kind === 'spherical' ? 1 : -1;
  const J = new Float64Array(n * n);
  J[0] = kappa;
  for (let i = 1; i < n; i++) J[i * n + i] = 1;
  const gtJg = matMul(matTranspose(g), matMul(J, g));
  for (let i = 0; i < n * n; i++) res = Math.max(res, Math.abs(gtJg[i] - J[i]));
  return res;
}

// ── Figure-document fixtures (tests/fixtures/figures/*.json) ────────────────

const figureModules = import.meta.glob('./fixtures/figures/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

/** [filename, document] for every figure fixture on disk. */
export const figureFixtures: [string, unknown][] = Object.entries(figureModules).map(
  ([path, doc]) => [path.split('/').pop()!, doc],
);

/** One fixture document by filename, e.g. figureFixture('tessellation.json'). */
export function figureFixture(name: string): unknown {
  const hit = figureFixtures.find(([n]) => n === name);
  if (!hit) throw new Error(`no figure fixture ${name}`);
  return hit[1];
}
