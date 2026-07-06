import { describe, expect, it } from 'vitest';
import type { GeometryKind, Point2 } from '@/geometry/types';
import { Spherical2 } from '@/geometry/Spherical';
import { Euclidean2 } from '@/geometry/Euclidean';
import { Hyperbolic2 } from '@/geometry/Hyperbolic';
import { circleArea, circleCircumference, polygonArea, polygonPerimeter } from '@/polytope/measure';
import { transformPolytope } from '@/polytope/transform';
import type { RealizationSpec } from '@/coxeter/spec';
import { solvePolygon } from '@/coxeter/solve';
import { groupFromPolygon } from '@/group/CoxeterGroup';
import { tangentFrame } from '@/render2d/sample';

const S2 = new Spherical2();
const E2 = new Euclidean2();
const H2 = new Hyperbolic2();

function triangle(kind: GeometryKind, orders: [number, number, number]) {
  const spec: RealizationSpec = {
    geometry: kind,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: [0, 1, 2] },
    decorations: [
      { walls: [0, 1], order: orders[0] },
      { walls: [1, 2], order: orders[1] },
      { walls: [2, 0], order: orders[2] },
    ],
  };
  return solvePolygon(spec);
}

describe('polytope/measure: polygon area (M3.1)', () => {
  it('the (2,3,7) chamber has area exactly π/42 (Gauss–Bonnet defect)', () => {
    const r = triangle('hyperbolic', [2, 3, 7]);
    const expected = Math.PI - Math.PI * (1 / 2 + 1 / 3 + 1 / 7);
    expect(expected).toBeCloseTo(Math.PI / 42, 14); // the famous 1/42
    expect(polygonArea(H2, r.chamber.vertices)).toBeCloseTo(expected, 10);
  });

  it('the (2,3,5) chamber has area 4π/120 (excess), and 120 tiles sum to 4π', () => {
    const r = triangle('spherical', [2, 3, 5]);
    const one = polygonArea(S2, r.chamber.vertices);
    expect(one).toBeCloseTo((4 * Math.PI) / 120, 10);

    // Gauss–Bonnet audits the group order: every tile is isometric, and the
    // tessellation covers the sphere exactly once.
    const group = groupFromPolygon(r);
    const tiles = group.tessellate(20);
    expect(tiles).toHaveLength(120);
    let total = 0;
    for (const t of tiles) {
      const a = polygonArea(S2, t.polytope.vertices);
      expect(a).toBeCloseTo(one, 9); // isometry invariance through transport
      total += a;
    }
    expect(total).toBeCloseTo(4 * Math.PI, 7);
  });

  it('hyperbolic tile areas are isometry-invariant deep into the ball', () => {
    const r = triangle('hyperbolic', [2, 3, 7]);
    const group = groupFromPolygon(r);
    const one = polygonArea(H2, r.chamber.vertices);
    for (const t of group.tessellate(8)) {
      expect(polygonArea(H2, t.polytope.vertices)).toBeCloseTo(one, 8);
    }
  });

  it('Euclidean: the unit square by shoelace, area 1, perimeter 4; transport preserves both', () => {
    const P = (x: number, y: number): Point2 => Float64Array.of(1, x, y);
    const square = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
    expect(polygonArea(E2, square)).toBeCloseTo(1, 14);
    expect(polygonPerimeter(E2, square)).toBeCloseTo(4, 14);

    const r = triangle('euclidean', [2, 4, 4]);
    const group = groupFromPolygon(r);
    const one = polygonArea(E2, r.chamber.vertices);
    expect(one).toBeGreaterThan(0);
    const moved = transformPolytope(r.chamber, E2, group.word([0, 1, 0, 2]));
    expect(polygonArea(E2, moved.vertices)).toBeCloseTo(one, 10);
  });

  it('degenerate loops measure zero', () => {
    const P = (x: number, y: number): Point2 => Float64Array.of(1, x, y);
    expect(polygonArea(E2, [P(0, 0), P(1, 1)])).toBe(0);
  });
});

describe('polytope/measure: circle measures (M3.1)', () => {
  it('circumference matches a chord-summed sampled circle in all three geometries', () => {
    for (const geom of [S2, E2, H2]) {
      const r = 0.7;
      const [e1, e2] = tangentFrame(geom, geom.origin());
      const n = 4096;
      let sum = 0;
      let prev: Point2 | null = null;
      let first: Point2 | null = null;
      for (let k = 0; k < n; k++) {
        const t = (2 * Math.PI * k) / n;
        const v = Float64Array.of(
          Math.cos(t) * e1[0] + Math.sin(t) * e2[0],
          Math.cos(t) * e1[1] + Math.sin(t) * e2[1],
          Math.cos(t) * e1[2] + Math.sin(t) * e2[2],
        );
        const p = geom.exp(geom.origin(), v, r);
        if (prev) sum += geom.distance(prev, p);
        else first = p;
        prev = p;
      }
      sum += geom.distance(prev!, first!);
      // Chords underestimate arcs by O(1/n²): ~7e-7 at n = 4096.
      expect(sum).toBeCloseTo(circleCircumference(geom, r), 5);
    }
  });

  it('S/H disk areas agree with the Euclidean πr² to fourth order in r', () => {
    const r = 1e-3;
    const flat = circleArea(E2, r);
    expect(Math.abs(circleArea(S2, r) - flat)).toBeLessThan(r ** 4);
    expect(Math.abs(circleArea(H2, r) - flat)).toBeLessThan(r ** 4);
    // And at finite radius they bracket it: S smaller, H larger.
    expect(circleArea(S2, 1)).toBeLessThan(circleArea(E2, 1));
    expect(circleArea(H2, 1)).toBeGreaterThan(circleArea(E2, 1));
  });
});
