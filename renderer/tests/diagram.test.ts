import { describe, expect, it } from 'vitest';
import { checkFigure } from '@/schema/validate';
import { polygonToMatrix } from '@/coxeter/matrix';
import { layoutDiagram, diagramSvg, isDiagramFigure, matrixOf } from '@/diagram';
import { bounds, edgeLabelAt } from '@/diagram/layout';

/** Pentagon: adjacent walls perpendicular, non-adjacent ∞ (the plan's showcase). */
const PENTAGON = polygonToMatrix([2, 2, 2, 2, 2]);
const T237 = polygonToMatrix([2, 3, 7]);
/** Rank 4, every order finite — `not-2d` to the realization layer. */
const B4 = [
  [1, 4, 2, 2],
  [4, 1, 3, 2],
  [2, 3, 1, 3],
  [2, 2, 3, 1],
];

const key = (e: { a: number; b: number }): string => `${e.a}-${e.b}`;

describe('the two conventions', () => {
  it('coxeter omits m=2, leaves m=3 unlabeled, labels m>=4, dashes infinity', () => {
    const M = [
      [1, 2, 3, 7, -1],
      [2, 1, 2, 2, 2],
      [3, 2, 1, 2, 2],
      [7, 2, 2, 1, 2],
      [-1, 2, 2, 2, 1],
    ];
    const d = layoutDiagram(M, 'coxeter');
    const byPair = new Map(d.edges.map((e) => [key(e), e]));
    expect([...byPair.keys()].sort()).toEqual(['0-2', '0-3', '0-4']); // every m=2 pair omitted
    expect(byPair.get('0-2')).toMatchObject({ label: null, dashed: false }); // m=3
    expect(byPair.get('0-3')).toMatchObject({ label: '7', dashed: false }); // m=7
    expect(byPair.get('0-4')).toMatchObject({ label: null, dashed: true }); // ∞
  });

  it('artin labels every finite order and omits infinity', () => {
    const d = layoutDiagram(PENTAGON, 'artin');
    expect(d.edges).toHaveLength(5);
    expect(d.edges.every((e) => e.label === '2' && !e.dashed)).toBe(true);
  });

  it('are complementary on the right-angled pentagon: pentagon vs pentagram', () => {
    const artin = layoutDiagram(PENTAGON, 'artin').edges.map(key).sort();
    const coxeter = layoutDiagram(PENTAGON, 'coxeter').edges.map(key).sort();
    // artin = the cyclically ADJACENT pairs (the pentagon)
    expect(artin).toEqual(['0-1', '0-4', '1-2', '2-3', '3-4']);
    // coxeter = the NON-adjacent pairs (the pentagram), all dashed
    expect(coxeter).toEqual(['0-2', '0-3', '1-3', '1-4', '2-4']);
    expect(artin.filter((e) => coxeter.includes(e))).toEqual([]);
    expect(layoutDiagram(PENTAGON, 'coxeter').edges.every((e) => e.dashed)).toBe(true);
  });
});

describe('the ring layout', () => {
  it('places n nodes on a circle with adjacent spacing 1 (the diagram unit)', () => {
    for (const n of [3, 4, 5, 7]) {
      const d = layoutDiagram(
        Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 2))),
        'artin',
      );
      expect(d.nodes).toHaveLength(n);
      const gap = Math.hypot(d.nodes[1].x - d.nodes[0].x, d.nodes[1].y - d.nodes[0].y);
      expect(gap).toBeCloseTo(1, 10);
    }
  });

  it('separates the labels of the diameters at even rank (they share a midpoint)', () => {
    // For even n the edges (k, k + n/2) all pass through the center, so a label
    // AT the midpoint would pile up. Pin that they land apart.
    const d = layoutDiagram(B4, 'artin');
    const diameters = d.edges.filter((e) => e.b - e.a === 2);
    expect(diameters).toHaveLength(2);
    const [p, q] = diameters.map((e) => edgeLabelAt(d, e));
    expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThan(0.4);
  });

  it('bounds include the labels, which sit outside the ring', () => {
    const d = layoutDiagram(T237, 'artin');
    const b = bounds(d);
    for (const e of d.edges) {
      const [x, y] = edgeLabelAt(d, e);
      expect(x).toBeGreaterThan(b.x0);
      expect(x).toBeLessThan(b.x1);
      expect(y).toBeGreaterThan(b.y0);
      expect(y).toBeLessThan(b.y1);
    }
  });
});

describe('the document', () => {
  const doc = (group: unknown, style?: string): unknown => ({
    version: '0.1',
    group,
    layers: [style === undefined ? { type: 'diagram' } : { type: 'diagram', style }],
  });

  it('draws groups the realization layer REFUSES (the point of diagrams)', () => {
    // rank 4 all-finite is `not-2d`; a free product is `free-product`.
    for (const M of [B4, [[1, -1], [-1, 1]]]) {
      const geometric = checkFigure({ version: '0.1', group: { coxeterMatrix: M }, layers: [{ type: 'walls' }] });
      expect(geometric.ok).toBe(false);
      const asDiagram = checkFigure(doc({ coxeterMatrix: M }));
      expect(asDiagram.ok).toBe(true);
    }
  });

  it('still refuses a STRUCTURALLY invalid matrix', () => {
    const r = checkFigure(doc({ coxeterMatrix: [[1, 3], [4, 1]] })); // asymmetric
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0].problem).toContain('invalid-matrix');
  });

  it('refuses mixing a diagram with the realized ops, and refuses views', () => {
    const mixed = checkFigure({
      version: '0.1',
      group: { polygon: [2, 3, 7] },
      layers: [{ type: 'diagram' }, { type: 'tessellation' }],
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.problems.some((p) => p.path === 'layers')).toBe(true);

    const withViews = checkFigure({
      version: '0.2',
      group: { polygon: [2, 3, 7] },
      layers: [{ type: 'diagram' }],
      views: [{ name: 'a', layers: [] }],
    });
    expect(withViews.ok).toBe(false);
  });

  it('refuses an unknown style', () => {
    expect(checkFigure(doc({ polygon: [2, 3, 7] }, 'dynkin')).ok).toBe(false);
    expect(checkFigure(doc({ polygon: [2, 3, 7] }, 'artin')).ok).toBe(true);
  });

  it('reads either presentation, and only a diagram document is a diagram', () => {
    const viaPolygon = checkFigure(doc({ polygon: [2, 3, 7] }));
    const viaMatrix = checkFigure(doc({ coxeterMatrix: T237 }));
    expect(viaPolygon.ok && viaMatrix.ok).toBe(true);
    if (viaPolygon.ok && viaMatrix.ok) {
      expect(matrixOf(viaPolygon.figure.group)).toEqual(matrixOf(viaMatrix.figure.group));
      expect(isDiagramFigure(viaPolygon.figure)).toBe(true);
    }
    const ordinary = checkFigure({ version: '0.1', group: { polygon: [2, 3, 7] }, layers: [{ type: 'walls' }] });
    if (ordinary.ok) expect(isDiagramFigure(ordinary.figure)).toBe(false);
  });
});

describe('the SVG emitter', () => {
  const size = { widthPx: 400, heightPx: 400 };

  it('emits one line per edge, one circle per node, one text per label', () => {
    const d = layoutDiagram(T237, 'artin');
    const svg = diagramSvg(d, size);
    expect(svg.match(/<line /g)).toHaveLength(3);
    expect(svg.match(/<circle /g)).toHaveLength(3);
    expect(svg.match(/<text /g)).toHaveLength(3);
    for (const m of ['2', '3', '7']) expect(svg).toContain(`>${m}</text>`);
  });

  it('dashes exactly the infinite edges, and never labels them', () => {
    const svg = diagramSvg(layoutDiagram(PENTAGON, 'coxeter'), size);
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(5);
    expect(svg).not.toContain('<text ');
  });

  it('colors node i by the generator (wall) color, the shared indexing law', () => {
    const svg = diagramSvg(layoutDiagram(T237, 'coxeter'), size);
    for (const c of ['#c0392b', '#27ae60', '#2f6fb7']) expect(svg).toContain(`fill="${c}"`);
  });

  it('fits inside the frame it is given', () => {
    const svg = diagramSvg(layoutDiagram(PENTAGON, 'artin'), size);
    expect(svg).toContain('viewBox="0 0 400 400"');
    for (const [, v] of svg.matchAll(/c[xy]="([-\d.]+)"/g)) {
      expect(Number(v)).toBeGreaterThanOrEqual(0);
      expect(Number(v)).toBeLessThanOrEqual(400);
    }
  });
});

describe('highlighting a selection', () => {
  it('lights the nodes of S, and the edges WITHIN S', () => {
    // |S| = 1 lights a node only; |S| = 2 lights the pair and their edge.
    const one = layoutDiagram(T237, 'artin', { generators: [1] });
    expect(one.nodes.filter((n) => n.highlighted).map((n) => n.index)).toEqual([1]);
    expect(one.edges.filter((e) => e.highlighted)).toHaveLength(0);

    const two = layoutDiagram(T237, 'artin', { generators: [1, 2] });
    expect(two.nodes.filter((n) => n.highlighted).map((n) => n.index)).toEqual([1, 2]);
    expect(two.edges.filter((e) => e.highlighted).map(key)).toEqual(['1-2']);
  });

  it('carries the selection color, defaulting to the house accent', () => {
    expect(layoutDiagram(T237, 'artin').highlightColor).toBeNull();
    expect(layoutDiagram(T237, 'artin', { generators: [0] }).highlightColor).toBe('#e84a5f');
    expect(layoutDiagram(T237, 'artin', { generators: [0], color: '#123456' }).highlightColor).toBe('#123456');
  });

  it('highlights a pair the ARTIN convention does not draw, without inventing an edge', () => {
    // In the pentagon, {0,2} is an ∞ pair: artin draws no edge for it, so only
    // the two nodes light up. (The tiling refuses this selection outright.)
    const d = layoutDiagram(PENTAGON, 'artin', { generators: [0, 2] });
    expect(d.nodes.filter((n) => n.highlighted).map((n) => n.index)).toEqual([0, 2]);
    expect(d.edges.some((e) => key(e) === '0-2')).toBe(false);
  });

  it('renders the selection color into the SVG', () => {
    const svg = diagramSvg(layoutDiagram(T237, 'artin', { generators: [1, 2], color: '#123456' }), {
      widthPx: 400,
      heightPx: 400,
    });
    expect(svg).toContain('stroke="#123456"'); // the edge, and the two node rings
    expect(svg.match(/#123456/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('validates a highlight and refuses a bad one', () => {
    const doc = (h: unknown): unknown => ({
      version: '0.1',
      group: { polygon: [2, 3, 7] },
      layers: [{ type: 'diagram', highlight: h }],
    });
    expect(checkFigure(doc({ generators: [0, 1] })).ok).toBe(true);
    expect(checkFigure(doc({ generators: [0, 1], color: '#fff' })).ok).toBe(true);
    expect(checkFigure(doc({ generators: [0, 9] })).ok).toBe(false); // out of range
    expect(checkFigure(doc({ generators: [0, 0] })).ok).toBe(false); // not distinct
    expect(checkFigure(doc({ generators: [0], size: 3 })).ok).toBe(false); // unknown field
    expect(checkFigure(doc([0, 1])).ok).toBe(false); // not a highlight object
  });
});
