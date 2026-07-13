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
import { groupFromPolygon } from '@/group/CoxeterGroup';
import type { PathList, RenderPath, SceneItem } from '@/viz2d/render/types';
import {
  chartId,
  edgeThreshold,
  foldPoint,
  footOnWall,
  geodesicThrough,
  hashHue,
  kappaOf,
  packVec3s,
  regionSignRows,
  vertexThreshold,
} from '@/viz2d/shader/uniforms';
import { wythoffPoint } from '@/group/wythoff';
import { identity } from '@/math/mat';
import { matrixKey } from '@/group/orbit';
import { coverageRadius, fieldScene, mergeFieldPaths } from '@/viz2d/shader/vector';
import type { TilingStyle } from '@/viz2d/shader/types';

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

describe('the vector twin (fieldScene, §5.6 T5)', () => {
  const STYLE: TilingStyle = {
    even: [1, 1, 1, 1],
    odd: [0.9, 0.9, 0.8, 1],
    edge: [0.6, 0.55, 0.46, 0.45],
    edgeHalfWidth: 0.01,
    vertex: [0.9, 0.35, 0.25, 1],
    vertexRadius: 0.05,
  };
  const icosahedral = () =>
    groupFromPolygon(solvePolygon(polygonSpec('spherical', [2, 3, 5])));
  /** A tile carries the `even` fill iff its word has even length (the sign character). */
  const whiteFill = (t: SceneItem) =>
    t.kind === 'polygon' && t.style.fill?.color === 'rgb(255,255,255)';

  it('(2,3,5) exhausts exactly: 120 parity tiles, 15 mirrors, 62 vertices', () => {
    const items = fieldScene(icosahedral(), STYLE, { maxWord: 20 });
    const tiles = items.filter((i) => i.kind === 'polygon');
    const walls = items.filter((i) => i.kind === 'geodesic');
    const verts = items.filter((i) => i.kind === 'circle');
    expect(tiles).toHaveLength(120); // |H₃|
    expect(walls).toHaveLength(15); // the icosahedral mirror planes, ±covector = one wall
    expect(verts).toHaveLength(62); // vertex orbits 30 + 20 + 12
    // The sign character splits the group in half: the alternating subgroup.
    const even = tiles.filter((t) => t.id.startsWith('field:tile:') && whiteFill(t));
    expect(even).toHaveLength(60);
  });

  it('composites in GPU order: underlay, tiles, edges, vertices', () => {
    const items = fieldScene(icosahedral(), STYLE, { maxWord: 20 });
    const order = ['domain', 'polygon', 'geodesic', 'circle'];
    let stage = 0;
    for (const item of items) {
      const k = order.indexOf(item.kind);
      expect(k).toBeGreaterThanOrEqual(stage);
      stage = k;
    }
    expect(items[0].kind).toBe('domain');
  });

  it('edge strokes are 2× the half-width (the band |⟨p,c⟩| < sin_κ(w))', () => {
    const items = fieldScene(icosahedral(), STYLE, { maxWord: 20 });
    for (const item of items) {
      if (item.kind === 'geodesic') expect(item.style.width).toBeCloseTo(0.02, 15);
    }
  });

  it('alpha 0 / zero sizes hide layers, exactly as in the shader', () => {
    const hidden: TilingStyle = { ...STYLE, edge: [0, 0, 0, 0], vertexRadius: 0 };
    const items = fieldScene(icosahedral(), hidden, { maxWord: 20 });
    expect(items.some((i) => i.kind === 'geodesic')).toBe(false);
    expect(items.some((i) => i.kind === 'circle')).toBe(false);
    expect(items.filter((i) => i.kind === 'polygon')).toHaveLength(120);
  });
});

describe('mergeFieldPaths', () => {
  const path = (id: string, color: string, opacity: number, n: number): RenderPath => ({
    id,
    color,
    opacity,
    contours: Array.from({ length: n }, (_, k) => Float64Array.from([k, k, k + 1, k, k, k + 1])),
  });

  it('merges disjoint field tiles by style, leaves walls/underlay/named alone', () => {
    const paths: PathList = [
      path('field:bg', 'rgb(255,255,255)', 1, 1),
      path('field:tile:e', 'rgb(255,255,255)', 1, 1),
      path('field:tile:0', 'rgb(250,244,231)', 1, 1),
      path('field:tile:0.1', 'rgb(255,255,255)', 1, 2),
      path('field:wall:0', 'rgb(154,141,117)', 0.45, 1),
      path('tile:e', '#f6d9a0', 0.92, 1),
    ];
    const merged = mergeFieldPaths(paths);
    expect(merged.map((p) => p.id)).toEqual([
      'field:bg', // the underlay CONTAINS the tiles — merging it would punch holes
      'field:tiles:0',
      'field:tiles:1',
      'field:wall:0', // walls cross — even-odd would cancel at crossings
      'tile:e',
    ]);
    // Same-style tiles pooled all their contours; nothing was lost.
    expect(merged[1].contours).toHaveLength(3); // e (1) + 0.1 (2), both white
    expect(merged[2].contours).toHaveLength(1);
    const before = paths.reduce((s, p) => s + p.contours.length, 0);
    expect(merged.reduce((s, p) => s + p.contours.length, 0)).toBe(before);
  });

  it('is the identity on a field-free path list', () => {
    const paths: PathList = [path('domain', '#fbf9f3', 1, 1), path('wall:2', '#2f6fb7', 0.8, 1)];
    expect(mergeFieldPaths(paths)).toEqual(paths);
  });
});

describe('adaptive coverage (§5.6 T6)', () => {
  const group = (geometry: GeometryKind, orders: number[]) =>
    groupFromPolygon(solvePolygon(polygonSpec(geometry, orders)));
  const dist = (g: ReturnType<typeof group>, t: { element: Isometry2 }) =>
    g.geom.distance(g.geom.apply(t.element, g.basePoint), g.basePoint);

  it('tessellateBall = the metric ball: complete inside, margin-bounded outside', () => {
    for (const [geometry, orders] of MILESTONE_1) {
      const g = group(geometry, orders);
      const R = geometry === 'spherical' ? 1.2 : 2.0;
      const ball = g.tessellateBall(R);
      const keys = new Set(ball.map((t) => matrixKey(t.element)));
      // Complete: every deep-enumerated tile within R is present.
      for (const t of g.tessellate(16, 20000)) {
        if (dist(g, t) <= R) expect(keys.has(matrixKey(t.element))).toBe(true);
      }
      // Exact: nothing beyond R — the traversal margin never leaks out.
      for (const t of ball) expect(dist(g, t)).toBeLessThanOrEqual(R + 1e-9);
    }
  });

  it('the right-angled pentagon reaches a radius in far fewer letters than (2,3,7)', () => {
    const R = 2.5;
    const maxWord = (tiles: { word: number[] }[]) =>
      tiles.reduce((m, t) => Math.max(m, t.word.length), 0);
    const pentagon = group('hyperbolic', [2, 2, 2, 2, 2]).tessellateBall(R, 20000);
    const triangle = group('hyperbolic', [2, 3, 7]).tessellateBall(R, 20000);
    expect(maxWord(pentagon)).toBeLessThan(maxWord(triangle) / 2);
    expect(pentagon.length).toBeLessThan(triangle.length); // fat tiles: fewer fill the ball
  });

  it('a radius past π exhausts the sphere: the exact (2,3,5) pins hold', () => {
    const items = fieldScene(group('spherical', [2, 3, 5]), {
      even: [1, 1, 1, 1], odd: [0.9, 0.9, 0.8, 1],
      edge: [0.6, 0.55, 0.46, 0.45], edgeHalfWidth: 0.01,
      vertex: [0.9, 0.35, 0.25, 1], vertexRadius: 0.05,
    }, { radius: Math.PI });
    expect(items.filter((i) => i.kind === 'polygon')).toHaveLength(120);
    expect(items.filter((i) => i.kind === 'geodesic')).toHaveLength(15);
    expect(items.filter((i) => i.kind === 'circle')).toHaveLength(62);
  });

  it('coverageRadius: Euclidean is the frame-corner distance; H matches the log law', () => {
    const size = { widthPx: 760, heightPx: 760 };
    const camera = { view: identity(3) as Isometry2, scalePx: 100, centerPx: [380, 380] as const };
    // E: tiles never shrink (scaleAt ≡ 1), so the frame alone bounds the radius.
    const e = group('euclidean', [2, 4, 4]);
    const rE = coverageRadius(e, new Cartesian2(), camera, size);
    expect(rE).toBeGreaterThan(4.9); // corner ≈ √2·380/100 ≈ 5.37, grid-sampled just inside
    expect(rE).toBeLessThanOrEqual(Math.hypot(3.8, 3.8));
    // H (Poincaré): R* ≈ ln(2·width·scalePx/ε), loose band.
    const h = group('hyperbolic', [2, 3, 7]);
    const camH = { view: identity(3) as Isometry2, scalePx: 352, centerPx: [380, 380] as const };
    const width = 2 * Math.min(...h.walls.map((w) => w.distanceTo(h.geom, h.basePoint)));
    const rH = coverageRadius(h, new Poincare2(), camH, size, 1.5);
    const law = Math.log((2 * width * camH.scalePx) / 1.5);
    expect(Math.abs(rH - law)).toBeLessThan(0.5);
    // Zooming IN at the center shows LESS of the disk: the ball shrinks to
    // the frame bound 2·atanh(|u| at the corner) — adaptive in both directions.
    const rH2 = coverageRadius(h, new Poincare2(), { ...camH, scalePx: 2 * camH.scalePx }, size, 1.5);
    expect(rH2).toBeLessThan(rH);
    expect(rH2).toBeGreaterThan(1.8);
    expect(rH2).toBeLessThanOrEqual(2 * Math.atanh(Math.hypot(380, 380) / (2 * camH.scalePx)));
  });
});

describe('field programs — the pure side (§5.8)', () => {
  const solved = (geometry: GeometryKind, orders: number[]) =>
    solvePolygon(polygonSpec(geometry, orders));

  it('footOnWall lands on the wall, and the anchor→foot geodesic is ⊥ to it', () => {
    for (const [geometry, orders] of MILESTONE_1) {
      const poly = solved(geometry, orders);
      const anchor = poly.geom.origin();
      for (const wall of poly.walls) {
        const foot = footOnWall(poly.geom, anchor, wall);
        expect(Math.abs(wall.side(foot))).toBeLessThan(1e-9);
        const L = geodesicThrough(poly.geom, anchor, foot);
        // Both points lie on L, and L ⊥ wall: ⟨L, J c⟩ = 0.
        expect(Math.abs(poly.geom.pairing(L, anchor))).toBeLessThan(1e-9);
        expect(Math.abs(poly.geom.pairing(L, foot))).toBeLessThan(1e-9);
        expect(Math.abs(poly.geom.pairing(L, wall.pole))).toBeLessThan(1e-9);
      }
    }
  });

  it('hashHue is deterministic, in [0,1), and separates the (2,3,5) coset anchors', () => {
    const poly = solved('spherical', [2, 3, 5]);
    const group = groupFromPolygon(poly);
    const anchor = poly.chamber.vertices[0];
    const hues = new Set<number>();
    for (const t of group.tessellateBall(Math.PI)) {
      const h = hashHue(group.geom.apply(t.element, anchor));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(h).toBe(hashHue(group.geom.apply(t.element, anchor))); // deterministic
      hues.add(Math.round(h * 65536));
    }
    // Distinct fixed-point images get (almost surely) distinct hues.
    expect(hues.size).toBeGreaterThan(10);
  });

  it('regionSignRows classifies the omnitruncated chamber and collapses the dodecahedron', () => {
    const poly = solved('spherical', [2, 3, 5]);
    // All rings: three surviving rows, and each decoration's vertex matches ITS row only.
    const seedAll = wythoffPoint(poly, [true, true, true]);
    const all = regionSignRows(poly, seedAll);
    expect(all.rows.every((r) => r !== null)).toBe(true);
    const matches = (rows: (number[] | null)[], q: Point2) =>
      rows.flatMap((row, t) =>
        row &&
        row.every((s, k) => s === 0 || s * poly.geom.pairing(all.split[k], q) > -1e-9)
          ? [t]
          : [],
      );
    poly.spec.decorations.forEach((d, t) => {
      const [i, j] = d.walls;
      const v = poly.chamber.vertices.find(
        (q) => Math.abs(poly.walls[i].side(q)) < 1e-7 && Math.abs(poly.walls[j].side(q)) < 1e-7,
      )!;
      expect(matches(all.rows, v)).toContain(t);
    });
    // Rings (1,0,0): the lone surviving pentagon row matches EVERYTHING.
    const dodec = regionSignRows(poly, wythoffPoint(poly, [true, false, false]));
    expect(dodec.rows[0]).toBeNull();
    expect(dodec.rows[1]).toBeNull();
    expect(dodec.rows[2]).toEqual([0, 0, 0]);
  });
});
