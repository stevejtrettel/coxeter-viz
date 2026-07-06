import { describe, expect, it } from 'vitest';
import { vec3, type Vec } from '@/math/vec';
import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { RealizationSpec } from '@/coxeter/spec';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import { Poincare2, Poincare3 } from '@/models/poincare';
import { Klein2 } from '@/models/klein';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { Gnomonic2 } from '@/models/gnomonic';
import { Globe2 } from '@/models/globe';
import {
  chartId,
  edgeThreshold,
  foldPoint,
  kappaOf,
  packVec3s,
  vertexThreshold,
} from '@/tilingshader/uniforms';

/**
 * T1 — the pure CPU side of the GPU tiling field. The GLSL itself is
 * verified visually against the pixel-coincidence criterion (T2); here we
 * pin everything float64: the chart-id table, the κ-trig thresholds against
 * the geometry layer's own distances, and the reference fold loop — chamber
 * membership and fold parity (= the sign character) against elements built
 * from words by the engine's reflections.
 */

function polygonSpec(geometry: GeometryKind, orders: number[]): RealizationSpec {
  const n = orders.length;
  return {
    geometry,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: Array.from({ length: n }, (_, k) => k) },
    decorations: orders.map((m, k) => ({ walls: [k, (k + 1) % n] as [number, number], order: m })),
  };
}

const MILESTONE_1: [GeometryKind, number[]][] = [
  ['hyperbolic', [2, 3, 7]],
  ['euclidean', [2, 4, 4]],
  ['spherical', [2, 3, 5]],
];

/** Deterministic sample points: exp from the origin at angle a, radius r. */
function samplePoints(poly: RealizedPolygon, radii: number[]): Point2[] {
  const angles = [0.3, 1.1, 2.0, 2.9, 4.2, 5.5];
  const pts: Point2[] = [];
  for (const r of radii) {
    for (const a of angles) {
      pts.push(poly.geom.exp(poly.geom.origin(), vec3(0, Math.cos(a), Math.sin(a)), r));
    }
  }
  return pts;
}

/** The element of a word [i₀,…,i_k] = R_{i_k}···R_{i₀} (left-to-right convention). */
function elementOf(poly: RealizedPolygon, word: number[]): Isometry2 {
  let g = poly.geom.identity();
  for (const i of word) g = poly.geom.compose(poly.geom.reflection(poly.walls[i]), g);
  return g;
}

const qOf = (kappa: number, v: Vec) => kappa * v[0] * v[0] + v[1] * v[1] + v[2] * v[2];

describe('chart ids', () => {
  it('maps every flat 2D model to its shader dispatch id', () => {
    expect(chartId(new Poincare2())).toBe(0);
    expect(chartId(new Klein2())).toBe(1);
    expect(chartId(new Cartesian2())).toBe(2);
    expect(chartId(new Stereographic2())).toBe(3);
    expect(chartId(new Gnomonic2())).toBe(4);
  });

  it('rejects renderDim-3 models (the globe belongs to sphereview)', () => {
    expect(() => chartId(new Globe2())).toThrow(/no chart/);
    expect(() => chartId(new Poincare3() as never)).toThrow(/no chart/);
  });
});

describe('κ-trig thresholds against the geometry layer', () => {
  it('edgeThreshold is the κ-sine row', () => {
    expect(edgeThreshold(1, 0.3)).toBeCloseTo(Math.sin(0.3), 15);
    expect(edgeThreshold(0, 0.3)).toBe(0.3);
    expect(edgeThreshold(-1, 0.3)).toBeCloseTo(Math.sinh(0.3), 15);
  });

  it('a unit covector side value is sin_κ of Hyperplane.distanceTo', () => {
    for (const [geometry, orders] of MILESTONE_1) {
      const poly = solvePolygon(polygonSpec(geometry, orders));
      const kappa = kappaOf(geometry);
      for (const p of samplePoints(poly, [0.4, 1.0])) {
        for (const wall of poly.walls) {
          const d = wall.distanceTo(poly.geom, p);
          expect(Math.abs(wall.side(p))).toBeCloseTo(edgeThreshold(kappa, d), 9);
        }
      }
    }
  });

  it('Q(p − q) is vertexThreshold at geom.distance(p, q), all geometries', () => {
    for (const [geometry, orders] of MILESTONE_1) {
      const poly = solvePolygon(polygonSpec(geometry, orders));
      const kappa = kappaOf(geometry);
      const pts = samplePoints(poly, [0.3, 0.9]);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = poly.geom.distance(pts[i], pts[j]);
          const diff = vec3(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
          expect(qOf(kappa, diff)).toBeCloseTo(vertexThreshold(kappa, d), 9);
        }
      }
    }
  });
});

describe('the reference fold', () => {
  const covectors = (poly: RealizedPolygon) => poly.walls.map((w) => w.covector);

  it('leaves the incenter alone', () => {
    for (const [geometry, orders] of MILESTONE_1) {
      const poly = solvePolygon(polygonSpec(geometry, orders));
      const { folds, converged } = foldPoint(poly.geom.origin(), covectors(poly), kappaOf(geometry));
      expect(converged).toBe(true);
      expect(folds).toBe(0);
    }
  });

  it('folds arbitrary points into the chamber, deep included', () => {
    const radii: Record<GeometryKind, number[]> = {
      hyperbolic: [0.5, 2.0, 6.0],
      euclidean: [0.5, 4.0, 25.0],
      spherical: [0.5, 1.5, 3.0],
    };
    for (const [geometry, orders] of MILESTONE_1) {
      const poly = solvePolygon(polygonSpec(geometry, orders));
      for (const p of samplePoints(poly, radii[geometry])) {
        const { p: q, converged } = foldPoint(p, covectors(poly), kappaOf(geometry));
        expect(converged).toBe(true);
        for (const wall of poly.walls) expect(wall.side(q)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('fold parity is the sign character: word images fold back to the incenter', () => {
    const words = [[0], [1], [2], [0, 1], [0, 1, 0], [2, 1, 0, 1], [0, 1, 2, 0, 1], [2, 2]];
    for (const [geometry, orders] of MILESTONE_1) {
      const poly = solvePolygon(polygonSpec(geometry, orders));
      for (const word of words) {
        const q = poly.geom.apply(elementOf(poly, word), poly.geom.origin());
        const { p, folds, converged } = foldPoint(q, covectors(poly), kappaOf(geometry));
        expect(converged).toBe(true);
        expect(folds % 2).toBe(word.length % 2);
        expect(poly.geom.distance(p, poly.geom.origin())).toBeLessThan(1e-9);
      }
    }
  });
});

describe('uniform packing', () => {
  it('packs vec3s densely and zero-fills the tail', () => {
    const packed = packVec3s([vec3(1, 2, 3), vec3(4, 5, 6)], 4);
    expect(Array.from(packed)).toEqual([1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 0, 0]);
  });

  it('throws past capacity', () => {
    expect(() => packVec3s([vec3(0, 0, 0), vec3(0, 0, 0)], 1)).toThrow(/capacity/);
  });
});
