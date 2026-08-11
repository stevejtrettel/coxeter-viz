import type { CoxeterMatrix } from '@/coxeter/matrix';
import type { ViewSize } from '@/viz2d/render/types';

/**
 * Layout (README): a Coxeter matrix + a convention → a `DiagramDrawing`, plain
 * data that both emitters (SVG, canvas) consume through the same `fit`, so the
 * two agree by construction. No geometry, no realization — a diagram is a pure
 * function of the matrix.
 */

export type DiagramStyle = 'coxeter' | 'artin';

const INF = -1;

/** Diagram units: adjacent nodes are 1 apart (README). */
export const NODE_RADIUS = 0.13;
export const EDGE_WIDTH = 0.035;
export const LABEL_SIZE = 0.26;
/** How far beside its edge a label sits (along the outward normal). */
export const LABEL_GAP = 0.2;
/** How far a DIAMETER's label slides off the shared center, as a fraction of the edge. */
export const DIAMETER_SHIFT = 0.22;
/** The house accent, when a highlight names no color of its own. */
export const DEFAULT_HIGHLIGHT = '#e84a5f';
/** How much a highlighted node/edge grows. */
export const HIGHLIGHT_SCALE = 1.9;
/** The dash pattern for the Coxeter ∞ edge. */
export const DASH: readonly [number, number] = [0.11, 0.09];

export interface DiagramNode {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  /** In the highlighted selection S. */
  readonly highlighted: boolean;
}

export interface DiagramEdge {
  readonly a: number;
  readonly b: number;
  /** null = drawn unlabeled (the Coxeter m = 3 and the Coxeter ∞ edge). */
  readonly label: string | null;
  /** The Coxeter ∞ edge. */
  readonly dashed: boolean;
  /** Both endpoints in the highlighted selection S. */
  readonly highlighted: boolean;
}

export interface DiagramDrawing {
  readonly style: DiagramStyle;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  /** The selection's color, when the drawing carries a highlight. */
  readonly highlightColor: string | null;
}

/**
 * Does this pair get an edge, and how? The two conventions, verbatim from the
 * README table. Returns null when the pair is omitted.
 */
type BareEdge = Omit<DiagramEdge, 'highlighted'>;

function edgeFor(style: DiagramStyle, a: number, b: number, m: number): BareEdge | null {
  if (style === 'artin') {
    // every finite order drawn and labeled; ∞ left open (no edge).
    return m === INF ? null : { a, b, label: String(m), dashed: false };
  }
  // coxeter: 2 is omitted, 3 is an unlabeled edge, ≥4 is labeled, ∞ is dashed.
  if (m === INF) return { a, b, label: null, dashed: true };
  if (m === 2) return null;
  return { a, b, label: m === 3 ? null : String(m), dashed: false };
}

/**
 * The ring layout: node k at angle −π/2 + 2πk/n (index 0 at the top), on the
 * circle whose adjacent-node spacing is 1 (the diagram's unit).
 */
export function layoutDiagram(
  matrix: CoxeterMatrix,
  style: DiagramStyle,
  highlight?: { generators: readonly number[]; color?: string },
): DiagramDrawing {
  const n = matrix.length;
  // A selection is a subset S of generators (= nodes). An EDGE is highlighted
  // when both its endpoints are in S — so |S| = 1 lights a node, |S| = 2 lights
  // a node pair and the edge between them (a chamber vertex), and so on up.
  const S = new Set(highlight?.generators ?? []);
  const R = n < 2 ? 0 : 1 / (2 * Math.sin(Math.PI / n));
  const nodes: DiagramNode[] = [];
  for (let k = 0; k < n; k++) {
    const t = -Math.PI / 2 + (2 * Math.PI * k) / n;
    nodes.push({ index: k, x: R * Math.cos(t), y: R * Math.sin(t), highlighted: S.has(k) });
  }
  const edges: DiagramEdge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const e = edgeFor(style, i, j, matrix[i][j]);
      if (e !== null) edges.push({ ...e, highlighted: S.has(i) && S.has(j) });
    }
  }
  return {
    style,
    nodes,
    edges,
    highlightColor: highlight === undefined ? null : (highlight.color ?? DEFAULT_HIGHLIGHT),
  };
}

/**
 * The content box in diagram units, padded by the node radius and a margin.
 * Labels sit OUTSIDE the ring, so they bound the picture too — measuring only
 * the nodes would crop them.
 */
export function bounds(d: DiagramDrawing): { x0: number; y0: number; x1: number; y1: number } {
  if (d.nodes.length === 0) return { x0: -1, y0: -1, x1: 1, y1: 1 };
  const pad = NODE_RADIUS + LABEL_SIZE * 0.6;
  const xs = d.nodes.map((p) => p.x);
  const ys = d.nodes.map((p) => p.y);
  for (const e of d.edges) {
    if (e.label === null) continue;
    const [lx, ly] = edgeLabelAt(d, e);
    xs.push(lx);
    ys.push(ly);
  }
  return {
    x0: Math.min(...xs) - pad,
    y0: Math.min(...ys) - pad,
    x1: Math.max(...xs) + pad,
    y1: Math.max(...ys) + pad,
  };
}

export interface Fit {
  /** Pixels per diagram unit. */
  readonly scale: number;
  /** Screen position (px) of the diagram-space origin. */
  readonly originPx: readonly [number, number];
}

/**
 * Fit the drawing into `size`, centered, preserving aspect. ONE function,
 * shared by both emitters — that shared use is what makes the SVG and the PNG
 * the same picture.
 */
export function fit(d: DiagramDrawing, size: ViewSize): Fit {
  const b = bounds(d);
  const w = Math.max(b.x1 - b.x0, 1e-9);
  const h = Math.max(b.y1 - b.y0, 1e-9);
  const scale = Math.min(size.widthPx / w, size.heightPx / h);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  return {
    scale,
    originPx: [size.widthPx / 2 - cx * scale, size.heightPx / 2 - cy * scale],
  };
}

/** Diagram coordinates → screen px, under a fit. */
export const project = (f: Fit, x: number, y: number): [number, number] => [
  f.originPx[0] + x * f.scale,
  f.originPx[1] + y * f.scale,
];

/** An edge's drawn span: the whole segment (labels sit BESIDE it, never in it). */
export function edgeSegment(
  d: DiagramDrawing,
  e: DiagramEdge,
): { readonly a: [number, number]; readonly b: [number, number] } {
  const p = d.nodes[e.a];
  const q = d.nodes[e.b];
  return { a: [p.x, p.y], b: [q.x, q.y] };
}

/**
 * Where an edge's label sits: beside the edge at its midpoint, offset along
 * the normal pointing AWAY from the ring's center — so labels land outside the
 * figure and never sit on the stroke.
 *
 * The offset is what makes even ranks legible: for even n the two "diameter"
 * edges (k, k + n/2) share the midpoint at the center exactly, so a label ON
 * the midpoint would collide. At the center the outward direction is
 * degenerate, so fall back to the edge's own left normal — which differs
 * between two crossing diameters and separates them.
 */
export function edgeLabelAt(d: DiagramDrawing, e: DiagramEdge): [number, number] {
  const p = d.nodes[e.a];
  const q = d.nodes[e.b];
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const r = Math.hypot(mx, my);
  if (r > 1e-6) return [mx + (mx / r) * LABEL_GAP, my + (my / r) * LABEL_GAP];

  // A DIAMETER (even rank): the midpoint is the center, shared with every
  // other diameter. Slide off the midpoint as well as off the line, so the
  // n/2 diameters' labels land at distinct points instead of piling up.
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const along = 0.5 - DIAMETER_SHIFT;
  return [
    p.x + dx * along - (dy / len) * LABEL_GAP,
    p.y + dy * along + (dx / len) * LABEL_GAP,
  ];
}
