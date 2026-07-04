/**
 * Shared test scaffolding: the six geometry cells in one table, a seeded rng,
 * and random points/tangents built through exp — so every test sweeps all
 * geometries and both dimensions.
 */

import { Vector3, Vector4 } from 'three';
import type { Geometry } from '@/geometry/types';
import { Spherical2, Spherical3 } from '@/geometry/Spherical';
import { Euclidean2, Euclidean3 } from '@/geometry/Euclidean';
import { Hyperbolic2, Hyperbolic3 } from '@/geometry/Hyperbolic';

export interface Cell {
  name: string;
  geom: Geometry<any, any>;
  dim: 2 | 3;
  /** Build an ambient vector, coordinate 0 first. */
  vec: (...c: number[]) => any;
  comps: (p: any) => number[];
}

const vec3 = (...c: number[]) => new Vector3(c[0], c[1], c[2]);
const vec4 = (...c: number[]) => new Vector4(c[0], c[1], c[2], c[3]);
const comps3 = (p: Vector3) => [p.x, p.y, p.z];
const comps4 = (p: Vector4) => [p.x, p.y, p.z, p.w];

export const cells: Cell[] = [
  { name: 'S2', geom: new Spherical2(), dim: 2, vec: vec3, comps: comps3 },
  { name: 'E2', geom: new Euclidean2(), dim: 2, vec: vec3, comps: comps3 },
  { name: 'H2', geom: new Hyperbolic2(), dim: 2, vec: vec3, comps: comps3 },
  { name: 'S3', geom: new Spherical3(), dim: 3, vec: vec4, comps: comps4 },
  { name: 'E3', geom: new Euclidean3(), dim: 3, vec: vec4, comps: comps4 },
  { name: 'H3', geom: new Hyperbolic3(), dim: 3, vec: vec4, comps: comps4 },
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
export function randomTangent(cell: Cell, p: any, rand: () => number, len = 1): any {
  const c = Array.from({ length: cell.dim + 1 }, (_, i) => (i === 0 ? 0 : 2 * rand() - 1));
  let v = cell.vec(...c);
  if (cell.geom.kind !== 'euclidean') {
    const pp = cell.geom.form(p, p); // ±1
    v = v.clone().addScaledVector(p, -cell.geom.form(v, p) / pp);
  }
  const s = Math.sqrt(cell.geom.form(v, v));
  return v.multiplyScalar(len / s);
}

/**
 * A random point at distance ≤ 1.2 from the origin — inside every chart's
 * comfort zone (gnomonic hemisphere needs < π/2, spherical log needs < π).
 */
export function randomPoint(cell: Cell, rand: () => number): any {
  const v = randomTangent(cell, cell.geom.origin(), rand, 1.2 * rand());
  return cell.geom.exp(cell.geom.origin(), v);
}

export function expectVecClose(comps: (p: any) => number[], a: any, b: any, tol = 1e-9): void {
  const ca = comps(a);
  const cb = comps(b);
  for (let i = 0; i < ca.length; i++) {
    if (Math.abs(ca[i] - cb[i]) > tol) {
      throw new Error(`vectors differ at component ${i}: [${ca}] vs [${cb}]`);
    }
  }
}

/** Max |entry| difference of two same-size matrices (Matrix3/Matrix4). */
export function matrixDiff(g: { elements: ArrayLike<number> }, h: { elements: ArrayLike<number> }): number {
  let m = 0;
  for (let i = 0; i < g.elements.length; i++) m = Math.max(m, Math.abs(g.elements[i] - h.elements[i]));
  return m;
}
