import { describe, expect, it } from 'vitest';
import { Vector3, Vector4 } from 'three';
import { Hyperplane } from '@/geometry/Hyperplane';
import type { Geometry, Vec } from '@/geometry/types';
import { Spherical2, Spherical3 } from '@/geometry/Spherical';
import { Euclidean2, Euclidean3 } from '@/geometry/Euclidean';
import { Hyperbolic2, Hyperbolic3 } from '@/geometry/Hyperbolic';
import { fromHalfspaces2, fromHalfspaces3, fromVertices2, fromVertices3 } from '@/polytope/build';
import { transformPolytope } from '@/polytope/transform';
import type { Polytope } from '@/polytope/Polytope';

/** Orient a raw covector so `interior` is on the inside (side ≤ 0). */
function wallToward<P extends Vec<P>, I>(geom: Geometry<P, I>, raw: P, interior: P): Hyperplane<P> {
  const w = Hyperplane.fromCovector(geom, raw);
  return w.side(interior) <= 0 ? w : Hyperplane.fromCovector(geom, raw.clone().multiplyScalar(-1));
}

/** Canonical sorted vertex fingerprint for set comparison. */
function vertexKeys(poly: Polytope<any>): string[] {
  return poly.vertices
    .map((v: { toArray(): number[] }) => v.toArray().map((c) => c.toFixed(5)).join(','))
    .sort();
}

describe('2D builders', () => {
  it('E²: the unit square from half-spaces', () => {
    const geom = new Euclidean2();
    const walls = [
      new Vector3(-1, 1, 0),
      new Vector3(-1, -1, 0),
      new Vector3(-1, 0, 1),
      new Vector3(-1, 0, -1),
    ].map((c) => Hyperplane.fromCovector(geom, c));
    const sq = fromHalfspaces2(geom, walls);
    expect(sq.vertices).toHaveLength(4);
    expect(sq.edges).toHaveLength(4);
    expect(sq.vertexKind.every((k) => k === 'finite')).toBe(true);
    expect(vertexKeys(sq)).toEqual(
      [
        [1, 1, 1],
        [1, 1, -1],
        [1, -1, 1],
        [1, -1, -1],
      ]
        .map((c) => c.map((x) => x.toFixed(5)).join(','))
        .sort(),
    );
    // consecutive vertices in the cyclic order differ in exactly one coordinate
    for (const [a, b] of sq.edges) {
      const u = sq.vertices[a];
      const v = sq.vertices[b];
      expect(Math.abs(u.y - v.y) + Math.abs(u.z - v.z)).toBeCloseTo(2, 9);
    }
  });

  it('E²: fromVertices hulls the square and drops an interior point', () => {
    const geom = new Euclidean2();
    const pts = [
      new Vector3(1, 1, 1),
      new Vector3(1, 1, -1),
      new Vector3(1, -1, 1),
      new Vector3(1, -1, -1),
      new Vector3(1, 0.2, 0.1), // interior — must not survive
    ];
    const sq = fromVertices2(geom, pts);
    expect(sq.vertices).toHaveLength(4);
    expect(sq.facets).toHaveLength(4);
  });

  it('S²: the octant chamber (right-angled spherical triangle)', () => {
    const geom = new Spherical2();
    const interior = geom.normalize(new Vector3(1, 1, 1));
    const walls = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((c) =>
      wallToward(geom, c, interior),
    );
    const tri = fromHalfspaces2(geom, walls);
    expect(tri.vertices).toHaveLength(3);
    expect(tri.edges).toHaveLength(3);
    expect(vertexKeys(tri)).toEqual(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
        .map((c) => c.map((x) => x.toFixed(5)).join(','))
        .sort(),
    );
  });

  it('S²: a lune (antipodal vertices) is refused by the hemisphere policy', () => {
    const geom = new Spherical2();
    const walls = [new Vector3(0, 0, 1), new Vector3(0, Math.sin(1), -Math.cos(1))].map((c) =>
      Hyperplane.fromCovector(geom, c),
    );
    expect(() => fromHalfspaces2(geom, walls)).toThrow(/hemisphere/);
  });

  it('H²: a compact triangle from two origin mirrors and a cap wall', () => {
    const geom = new Hyperbolic2();
    const dir = new Vector3(0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
    const interior = geom.exp(geom.origin(), dir, 0.3);
    const walls = [
      new Vector3(0, 0, 1), // the line y = 0
      new Vector3(0, Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3)), // at angle π/3 to it
      new Vector3(-Math.sinh(0.4), Math.cosh(0.4), 0), // J·pole of the wall at distance 0.4 (< arctanh(1/2), so the far corner stays timelike)
    ].map((c) => wallToward(geom, c, interior));
    const tri = fromHalfspaces2(geom, walls);
    expect(tri.vertices).toHaveLength(3);
    expect(tri.edges).toHaveLength(3);
    expect(tri.vertexKind.every((k) => k === 'finite')).toBe(true);
  });

  it('H²: ultraparallel walls meet in no vertex (skipped, not faked)', () => {
    const geom = new Hyperbolic2();
    const walls = [
      new Vector3(0, 1, 0),
      new Vector3(-Math.sinh(1), -Math.cosh(1), 0),
    ].map((c) => Hyperplane.fromCovector(geom, c));
    const poly = fromHalfspaces2(geom, walls);
    expect(poly.vertices).toHaveLength(0);
  });
});

describe('3D builders', () => {
  it('E³: the cube — 8 vertices, 12 edges, 6 quadrilateral faces, Euler 2', () => {
    const geom = new Euclidean3();
    const walls: Hyperplane<Vector4>[] = [];
    for (const axis of [1, 2, 3]) {
      for (const sign of [1, -1]) {
        const c = [-1, 0, 0, 0];
        c[axis] = sign;
        walls.push(Hyperplane.fromCovector(geom, new Vector4(...(c as [number, number, number, number]))));
      }
    }
    const cube = fromHalfspaces3(geom, walls);
    expect(cube.vertices).toHaveLength(8);
    expect(cube.edges).toHaveLength(12);
    expect(cube.faces).toHaveLength(6);
    expect(cube.vertices.length - cube.edges.length + cube.faces.length).toBe(2);
    for (const f of cube.faces) expect(f.loop).toHaveLength(4);
  });

  it('E³: fromVertices round-trips the cube', () => {
    const geom = new Euclidean3();
    const pts: Vector4[] = [];
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) pts.push(new Vector4(1, sx, sy, sz));
    const cube = fromVertices3(geom, pts);
    expect(cube.vertices).toHaveLength(8);
    expect(cube.facets).toHaveLength(6);
    expect(cube.edges).toHaveLength(12);
  });

  it('S³: the corner simplex — 4 vertices, 6 edges, 4 triangles, Euler 2', () => {
    const geom = new Spherical3();
    const interior = geom.normalize(new Vector4(1, 1, 1, 1));
    const walls = [
      new Vector4(1, 0, 0, 0),
      new Vector4(0, 1, 0, 0),
      new Vector4(0, 0, 1, 0),
      new Vector4(0, 0, 0, 1),
    ].map((c) => wallToward(geom, c, interior));
    const simplex = fromHalfspaces3(geom, walls);
    expect(simplex.vertices).toHaveLength(4);
    expect(simplex.edges).toHaveLength(6);
    expect(simplex.faces).toHaveLength(4);
    for (const f of simplex.faces) expect(f.loop).toHaveLength(3);
  });

  it('H³: a compact orthoscheme-like tetrahedron', () => {
    const geom = new Hyperbolic3();
    const s = 1 / Math.sqrt(3);
    const dir = new Vector4(0, s, s, s);
    const interior = geom.exp(geom.origin(), dir, 0.2);
    const d = 0.5; // cap distance — small enough that the corner vertices stay timelike
    const walls = [
      new Vector4(0, 1, 0, 0),
      new Vector4(0, 0, 1, 0),
      new Vector4(0, 0, 0, 1),
      new Vector4(-Math.sinh(d), Math.cosh(d) * s, Math.cosh(d) * s, Math.cosh(d) * s),
    ].map((c) => wallToward(geom, c, interior));
    const tet = fromHalfspaces3(geom, walls);
    expect(tet.vertices).toHaveLength(4);
    expect(tet.edges).toHaveLength(6);
    expect(tet.faces).toHaveLength(4);
    expect(tet.vertexKind.every((k) => k === 'finite')).toBe(true);
  });
});

describe('isometry transport', () => {
  it('E²: a translation (product of two reflections) moves the square, walls equivariantly', () => {
    const geom = new Euclidean2();
    const walls = [
      new Vector3(-1, 1, 0),
      new Vector3(-1, -1, 0),
      new Vector3(-1, 0, 1),
      new Vector3(-1, 0, -1),
    ].map((c) => Hyperplane.fromCovector(geom, c));
    const sq = fromHalfspaces2(geom, walls);

    const R1 = geom.reflection(Hyperplane.fromCovector(geom, new Vector3(0, 1, 0))); // x = 0
    const R2 = geom.reflection(Hyperplane.fromCovector(geom, new Vector3(-1, 1, 0))); // x = 1
    const g = geom.compose(R2, R1); // translation by (2, 0)

    const img = transformPolytope(sq, geom, g);
    expect(img.vertices).toHaveLength(4);
    expect(img.edges).toHaveLength(4);
    // vertices moved to x ∈ {1, 3}
    for (const v of img.vertices) expect([1, 3]).toContainEqual(Math.round(v.y));
    // covector transport is equivariant: side values are preserved
    const p = new Vector3(1, 0.3, -0.2);
    const gp = geom.apply(g, p);
    sq.facets.forEach((w, i) => {
      expect(img.facets[i].side(gp)).toBeCloseTo(w.side(p), 9);
    });
  });

  it.each([
    ['S²', new Spherical2()],
    ['H²', new Hyperbolic2()],
  ] as const)('%s: rotating a chamber by two of its own reflections preserves everything', (_, geom) => {
    const interior = geom.normalize(
      geom.kind === 'spherical' ? new Vector3(1, 0.4, 0.3) : new Vector3(Math.cosh(0.5), Math.sinh(0.5) * 0.8, Math.sinh(0.5) * 0.6),
    );
    const raws =
      geom.kind === 'spherical'
        ? [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
        : [
            new Vector3(0, 0, 1),
            new Vector3(0, Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3)),
            new Vector3(-Math.sinh(0.4), Math.cosh(0.4), 0),
          ];
    const walls = raws.map((c) => wallToward(geom, c, interior));
    const tri = fromHalfspaces2(geom, walls);
    expect(tri.vertices).toHaveLength(3);

    const g = geom.compose(geom.reflection(walls[0]), geom.reflection(walls[1]));
    const img = transformPolytope(tri, geom, g);
    expect(img.vertices).toHaveLength(3);
    expect(img.edges).toHaveLength(3);
    // vertices stay exactly on the point locus
    img.vertices.forEach((v) => {
      const n = geom.normalize(v);
      expect(Math.abs(n.x - v.x) + Math.abs(n.y - v.y) + Math.abs(n.z - v.z)).toBeLessThan(1e-9);
    });
    // side equivariance
    const gp = geom.apply(g, interior);
    tri.facets.forEach((w, i) => {
      expect(img.facets[i].side(gp)).toBeCloseTo(w.side(interior), 9);
    });
  });
});
