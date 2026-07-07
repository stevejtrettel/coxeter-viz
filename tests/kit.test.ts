import { describe, expect, it } from 'vitest';
import { matMul } from '@/math/mat';
import { matrixKey } from '@/group/orbit';
import { realizePolygon, defaultModel, polygonSpec } from '@/viz2d/kit/realize';
import {
  cayEdgeId,
  cayId,
  cayleyScene,
  domainItem,
  fieldTileId,
  highlightElements,
  hueColor,
  parityColor,
  tileId,
  tilesToScene,
  wallId,
  wallItems,
} from '@/viz2d/kit/scene';
import { fitToDomain, fitToPoints, planeRotation, tippedView } from '@/viz2d/kit/camera';
import { blankStyle, cosetField, fieldStyle, rgba, starBands } from '@/viz2d/kit/field';
import { GREY, TILE, WALL_COLORS } from '@/viz2d/kit/palette';

/**
 * R4-kit — the picturing toolkit. Pins the id scheme, the realize preamble,
 * the color maps, the framing math, and — the migration safety net — that the
 * item builders emit shapes identical to the demos' hand-built ones.
 */

describe('kit/realize', () => {
  it.each([
    [[2, 3, 7], 'hyperbolic', 'poincare-disk'],
    [[2, 4, 4], 'euclidean', 'cartesian'],
    [[2, 3, 5], 'spherical', 'stereographic'],
  ] as [number[], string, string][])('(%j) infers %s and its default chart', (orders, kind, chart) => {
    const rg = realizePolygon(orders);
    expect(rg.kind).toBe(kind);
    expect(rg.model.name).toBe(chart);
    expect(rg.r0).toBe(rg.poly.inradius);
    expect(defaultModel(rg.kind).name).toBe(chart);
  });

  it('polygonSpec: cyclic orders → decorations on {k, k+1}', () => {
    const spec = polygonSpec([2, 3, 7], 'hyperbolic');
    expect(spec.combinatorics).toEqual({ kind: 'polygon', cyclicOrder: [0, 1, 2] });
    expect(spec.decorations).toEqual([
      { walls: [0, 1], order: 2 },
      { walls: [1, 2], order: 3 },
      { walls: [2, 0], order: 7 },
    ]);
  });
});

describe('kit/scene ids', () => {
  it('round-trip the scheme (empty word → "e")', () => {
    expect(tileId([])).toBe('tile:e');
    expect(tileId([0, 1])).toBe('tile:0.1');
    expect(cayId([1, 2])).toBe('cay:1.2');
    expect(cayEdgeId([1], 2)).toBe('cayedge:1:2');
    expect(wallId(3)).toBe('wall:3');
    expect(fieldTileId([])).toBe('field:tile:e');
  });
});

describe('kit/scene color maps', () => {
  it('parityColor = the sign character (identity / even / odd)', () => {
    expect(parityColor([], TILE)).toBe(TILE.identity);
    expect(parityColor([0], TILE)).toBe(TILE.odd);
    expect(parityColor([0, 1], TILE)).toBe(TILE.even);
    expect(parityColor([0, 1, 2], TILE)).toBe(TILE.odd);
  });
  it('hueColor formats a hashHue value as hsl', () => {
    expect(hueColor(0)).toBe('hsl(0.00, 55%, 78%)');
    expect(hueColor(0.5)).toBe('hsl(180.00, 55%, 78%)');
  });
});

describe('kit/camera', () => {
  it('fitToDomain: disk frames the radius, plane fits by geometry', () => {
    const h = realizePolygon([2, 3, 7]); // Poincaré disk, radius 1
    expect(fitToDomain(h.model, h.kind, h.r0, 800)).toBeCloseTo(800 / 2 / (1 * 1.08), 12);
    const e = realizePolygon([2, 4, 4]); // Cartesian plane
    expect(fitToDomain(e.model, e.kind, e.r0, 800)).toBeCloseTo(800 / (16 * e.r0), 12);
    const s = realizePolygon([2, 3, 5]); // stereographic plane
    expect(fitToDomain(s.model, s.kind, s.r0, 800)).toBeCloseTo(800 / 2 / 3.2, 12);
  });

  it('fitToPoints: the farthest projected point lands inside the frame', () => {
    const rg = realizePolygon([2, 3, 7]);
    const pts = rg.group.orbit(4).map((e) => rg.group.geom.apply(e.element, rg.group.basePoint));
    const scalePx = fitToPoints(rg.group.geom, rg.model, pts, 800);
    let maxR = 0;
    for (const p of pts) {
      const u = rg.model.project(p);
      maxR = Math.max(maxR, Math.hypot(u[0], u[1]) * scalePx);
    }
    expect(maxR).toBeLessThanOrEqual(400 + 1e-9); // ≤ sizePx/2
  });

  it('tippedView = the composed plane rotations (the demos’ sphereTip)', () => {
    expect(Array.from(tippedView(0.55, 0.35))).toEqual(
      Array.from(matMul(planeRotation(0, 1, 0.55), planeRotation(0, 2, 0.35))),
    );
  });
});

describe('kit/field', () => {
  it('rgba parses a hex to [0,1]⁴', () => {
    expect(rgba('#ffffff', 1)).toEqual([1, 1, 1, 1]);
    expect(rgba('#000000', 0.5)).toEqual([0, 0, 0, 0.5]);
  });
  it('fieldStyle edge half-width scales with r0; cosetField adds the program', () => {
    const base = fieldStyle(2);
    expect(base.edgeHalfWidth).toBeCloseTo(0.0075 * 2, 12);
    const anchor = Float64Array.of(1, 0, 0);
    expect(cosetField(base, anchor).coset).toEqual({ anchor });
    expect(blankStyle().even).toEqual([0, 0, 0, 0]);
  });
  it('starBands: one band per wall, colored by index', () => {
    const bands = starBands([0, 0, 0], (i) => rgba(WALL_COLORS[i], 0.85));
    expect(bands).toEqual([
      { wall: 0, color: rgba(WALL_COLORS[0], 0.85) },
      { wall: 1, color: rgba(WALL_COLORS[1], 0.85) },
      { wall: 2, color: rgba(WALL_COLORS[2], 0.85) },
    ]);
  });
});

// ── The migration safety net: kit builders === the demos' hand-built shapes ──

describe('kit/scene builders reproduce the Milestone-1 shapes', () => {
  const rg = realizePolygon([2, 3, 5]); // spherical, the fully-enumerated case
  const r0 = rg.r0;

  it('tilesToScene: id, kind, vertices, style match the inline construction', () => {
    const tiles = rg.group.tessellate(3);
    const built = tilesToScene(tiles, (t) => ({
      fill: { color: parityColor(t.word, TILE), opacity: 0.9 },
      edge: { color: GREY.tileEdge, width: 0.025 * r0, opacity: 0.5 },
    }));
    const inline = tiles.map((t) => ({
      id: `tile:${t.word.length === 0 ? 'e' : t.word.join('.')}`,
      kind: 'polygon' as const,
      vertices: t.polytope.vertices,
      style: {
        fill: { color: parityColor(t.word, TILE), opacity: 0.9 },
        edge: { color: '#7a6a4a', width: 0.025 * r0, opacity: 0.5 },
      },
    }));
    expect(built).toEqual(inline);
  });

  it('wallItems: line items per generator', () => {
    const built = wallItems(rg.poly.walls, (i) => ({ color: WALL_COLORS[i], width: 0.05 * r0, opacity: 0.8 }));
    expect(built.map((w) => w.id)).toEqual(rg.poly.walls.map((_, i) => `wall:${i}`));
    expect(built[0].source).toEqual({ type: 'line', wall: rg.poly.walls[0] });
  });

  it('cayleyScene: node points at element·basePoint, generator-labelled edges', () => {
    const graph = rg.group.cayleyGraph(20);
    const built = cayleyScene(rg.group, graph, {
      edge: (g) => ({ color: WALL_COLORS[g], width: 0.06 * r0, opacity: 0.85 }),
      node: () => ({ color: '#1a1a1a', radius: 0.11 * r0 }),
    });
    const nodes = built.filter((i) => i.kind === 'point');
    const edges = built.filter((i) => i.kind === 'geodesic');
    expect(nodes).toHaveLength(120);
    expect(edges).toHaveLength(180);
    // A node's point is exactly element·basePoint.
    const first = graph.nodes[0];
    const p = rg.group.geom.apply(first.element, rg.group.basePoint);
    const item = built.find((i) => i.id === `cay:${first.word.length === 0 ? 'e' : first.word.join('.')}`);
    expect(item?.kind).toBe('point');
    if (item?.kind === 'point') expect(Array.from(item.at)).toEqual(Array.from(p));
  });

  it('domainItem: filled vs rim-only', () => {
    expect(domainItem(true).style).toEqual({ fill: { color: GREY.domain }, rim: { color: GREY.rim, widthPx: 1.25 } });
    expect(domainItem(false).style).toEqual({ rim: { color: GREY.rim, widthPx: 1.25 } });
  });

  it('highlightElements: elementwise overrides via the id map', () => {
    const idsOf = new Map<string, { tile: string; node: string }>();
    for (const e of rg.group.orbit(3)) {
      idsOf.set(matrixKey(e.element), { tile: tileId(e.word), node: cayId(e.word) });
    }
    // [0,0] = R₀² = identity, [0] = R₀: two distinct elements ⇒ 2 tiles + 2 nodes.
    const ov = highlightElements(rg.group, [[0], [0, 0]], idsOf, {
      tile: { fill: { color: '#e84a5f' } },
      node: { color: '#e84a5f' },
    });
    expect(ov.size).toBe(4);
    // A word outside the ball contributes nothing.
    const empty = highlightElements(rg.group, [[0]], new Map(), { tile: {}, node: {} });
    expect(empty.size).toBe(0);
  });
});
