/**
 * wordlists — the Milestone-3 demo (PLAN.md §5.5, M3.4): the three
 * Milestone-1 groups colored BY LEFT COSET of the parabolic ⟨R₁,R₂⟩ (tiles
 * and Cayley nodes together), the dihedral word list's base-point hull, exact
 * chamber areas (Gauss–Bonnet), and an interactive word-entry box — type
 * words in the abstract group, the matching tiles/nodes light up ELEMENTWISE
 * (any spelling of an element hits its one tile).
 */

import type { Geometry, GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { mat3, matMul } from '@/math/mat';
import { solvePolygon } from '@/coxeter/solve';
import type { RealizationSpec } from '@/coxeter/spec';
import { groupFromPolygon, wordId, type CoxeterGroup } from '@/group/CoxeterGroup';
import { matrixKey, type OrbitElement } from '@/group/orbit';
import { cosetIndex, hullOfWords } from '@/group/wordlists';
import { transformPolytope } from '@/polytope/transform';
import { polygonArea } from '@/polytope/measure';
import type { Camera, ItemId, PathList, Scene, SceneItem, StyleOverride, StyleOverrides } from '@/render2d/types';
import { buildPathList } from '@/render2d/scene';
import { paint } from '@/render2d/canvas';
import { toSvg } from '@/render2d/svg';
import { attachInteraction, hitTest, modelUnprojector } from '@/render2d/interact';

// ── Style ───────────────────────────────────────────────────────────────────

/** Categorical palette, cycled over coset ordinals. */
const COSET_COLORS = [
  '#f4d6a0', '#bfe3c0', '#bcd6f0', '#f0c4c4', '#ddc9ec', '#f2e2b8',
  '#c8e6e0', '#e6cdb8', '#ccd9f2', '#e0e4bb', '#e8c7dd', '#c9e0f4',
];
const ENTRY_COLOR = '#e84a5f';
const HOVER_COLOR = '#ffb454';
const HULL_COLOR = '#2f6fb7';

/** The dihedral parabolic ⟨R₁,R₂⟩ as words, per group's m₁₂. */
function dihedralWords(m: number): number[][] {
  const words: number[][] = [[]];
  for (let k = 1; k <= 2 * m - 1; k++) {
    // Alternating words 1,2,1,… and their length-k prefixes cover the group.
    words.push(Array.from({ length: k }, (_, i) => (i % 2 === 0 ? 1 : 2)));
    words.push(Array.from({ length: k }, (_, i) => (i % 2 === 0 ? 2 : 1)));
  }
  return words;
}

// ── Group data ──────────────────────────────────────────────────────────────

interface GroupData {
  group: CoxeterGroup<Point2, Isometry2>;
  ball: OrbitElement<Isometry2>[];
  coset: Map<string, number>; // element key → coset ordinal
  idsOf: Map<string, { tile: ItemId; node: ItemId }>; // element key → scene ids
  scene: Scene;
  r0: number;
  chamberArea: number;
  ballArea: number;
}

function generate(kind: GeometryKind, orders: [number, number, number], maxWord: number): GroupData {
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
  const realized = solvePolygon(spec);
  const group = groupFromPolygon(realized);
  const geom = group.geom;
  const r0 = realized.inradius;
  const ball = group.orbit(maxWord, 20000);
  const graph = group.cayleyGraph(maxWord, 20000);

  const H = group.subgroup([group.reflections[1], group.reflections[2]]);
  const coset = cosetIndex(group, H, ball);

  const chamberArea = polygonArea(geom, realized.chamber.vertices);
  let ballArea = 0;

  const idsOf = new Map<string, { tile: ItemId; node: ItemId }>();
  const items: SceneItem[] = [
    {
      id: 'domain',
      kind: 'domain',
      style: { fill: { color: '#fbf9f3' }, rim: { color: '#bbbbbb', widthPx: 1.25 } },
    },
  ];

  // Tiles, colored by coset.
  for (const e of ball) {
    const key = matrixKey(e.element);
    const tileId = `tile:${wordId(e.word)}`;
    const poly = transformPolytope(realized.chamber, geom, e.element);
    ballArea += chamberArea; // isometric copies — exact by Gauss–Bonnet
    items.push({
      id: tileId,
      kind: 'polygon',
      vertices: poly.vertices,
      style: {
        fill: { color: COSET_COLORS[(coset.get(key) ?? 0) % COSET_COLORS.length], opacity: 0.9 },
        edge: { color: '#7a6a4a', width: 0.02 * r0, opacity: 0.4 },
      },
    });
    idsOf.set(key, { tile: tileId, node: `cay:${wordId(e.word)}` });
  }

  // The dihedral word list's base-point hull.
  const m12 = orders[1];
  const hull = hullOfWords(group, dihedralWords(m12));
  items.push({
    id: 'hull',
    kind: 'polygon',
    vertices: hull.vertices,
    style: {
      fill: { color: HULL_COLOR, opacity: 0.12 },
      edge: { color: HULL_COLOR, width: 0.09 * r0, opacity: 0.9 },
    },
  });

  // Cayley graph: thin gray edges, coset-colored nodes.
  const points = graph.nodes.map((n) => geom.apply(n.element, group.basePoint));
  for (const e of graph.edges) {
    items.push({
      id: `cayedge:${wordId(graph.nodes[e.a].word)}:${e.generator}`,
      kind: 'geodesic',
      source: { type: 'segment', a: points[e.a], b: points[e.b] },
      style: { color: '#666666', width: 0.035 * r0, opacity: 0.6 },
    });
  }
  graph.nodes.forEach((n, k) => {
    items.push({
      id: `cay:${wordId(n.word)}`,
      kind: 'point',
      at: points[k],
      style: {
        color: COSET_COLORS[(coset.get(matrixKey(n.element)) ?? 0) % COSET_COLORS.length],
        radius: 0.14 * r0,
      },
    });
  });

  return { group, ball, coset, idsOf, scene: items, r0, chamberArea, ballArea };
}

const h237 = generate('hyperbolic', [2, 3, 7], 14);
const e244 = generate('euclidean', [2, 4, 4], 12);
const s235 = generate('spherical', [2, 3, 5], 20);

// ── Word entry (ruling 3): abstract words → elements → highlighted ids ──────

function parseWords(text: string): { words: number[][]; bad: string[] } {
  const words: number[][] = [];
  const bad: string[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    if (tok === 'e') {
      words.push([]);
    } else if (/^\d+(\.\d+)*$/.test(tok)) {
      const w = tok.split('.').map(Number);
      if (w.every((i) => i <= 2)) words.push(w);
      else bad.push(tok);
    } else {
      bad.push(tok);
    }
  }
  return { words, bad };
}

/** The per-panel overrides a typed word list induces — elementwise. */
function entryOverrides(data: GroupData, words: number[][]): Map<ItemId, StyleOverride> {
  const out = new Map<ItemId, StyleOverride>();
  for (const key of data.group.elements(words).keys()) {
    const ids = data.idsOf.get(key);
    if (!ids) continue; // outside the generated ball
    out.set(ids.tile, { fill: { color: ENTRY_COLOR, opacity: 0.95 } });
    out.set(ids.node, { color: ENTRY_COLOR, radius: 0.2 * data.r0 });
  }
  return out;
}

// ── Panels ──────────────────────────────────────────────────────────────────

interface Panel {
  title: string;
  stats: string;
  data: GroupData;
  model: Model<Point2>;
  initialCamera(sizePx: number): Camera;
}

const identityView: Isometry2 = mat3([
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]);
const sphereTip = matMul(
  mat3([
    [Math.cos(0.55), -Math.sin(0.55), 0],
    [Math.sin(0.55), Math.cos(0.55), 0],
    [0, 0, 1],
  ]),
  mat3([
    [Math.cos(0.35), 0, -Math.sin(0.35)],
    [0, 1, 0],
    [Math.sin(0.35), 0, Math.cos(0.35)],
  ]),
);

function fmt(x: number): string {
  return x.toPrecision(5);
}

const panels: Panel[] = [
  {
    title: '(2,3,7) H² — Poincaré, cosets of ⟨R₁,R₂⟩ (order 6)',
    stats: `chamber area = ${fmt(h237.chamberArea)} = π/42 exactly · ball: ${h237.ball.length} tiles, area ${fmt(h237.ballArea)}`,
    data: h237,
    model: new Poincare2(),
    initialCamera: (s) => ({ view: identityView, scalePx: s / 2 / 1.08, centerPx: [s / 2, s / 2] }),
  },
  {
    title: '(2,4,4) E² — Cartesian, cosets of ⟨R₁,R₂⟩ (order 8)',
    stats: `chamber area = ${fmt(e244.chamberArea)} (scale modulus: inradius 1) · ball: ${e244.ball.length} tiles, area ${fmt(e244.ballArea)}`,
    data: e244,
    model: new Cartesian2(),
    initialCamera: (s) => ({ view: identityView, scalePx: s / 2 / 14, centerPx: [s / 2, s / 2] }),
  },
  {
    title: '(2,3,5) S² — stereographic, cosets of ⟨R₁,R₂⟩ (order 6)',
    stats: `chamber area = ${fmt(s235.chamberArea)} = 4π/120 exactly · all ${s235.ball.length} tiles, total ${fmt(s235.ballArea)} = 4π`,
    data: s235,
    model: new Stereographic2(),
    initialCamera: (s) => ({ view: sphereTip, scalePx: s / 2 / 3.2, centerPx: [s / 2, s / 2] }),
  },
];

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
const GAP = 16;
const HEAD_H = 24;
const STATS_H = 18;

document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'wordlists / Milestone 3 — coset coloring, hulls, exact areas · drag / shift-drag / wheel · hover a tile';
heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 8px';
document.body.appendChild(heading);

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:10px;align-items:baseline;margin-bottom:10px';
const entry = document.createElement('input');
entry.placeholder = 'words, e.g.  e, 0, 0.1, 1.2.1.0  (generators 0–2, dot-separated; any spelling of an element hits its tile)';
entry.style.cssText =
  'flex:1;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff';
const feedback = document.createElement('span');
feedback.style.cssText = 'font-size:12px;color:#777;white-space:nowrap';
controls.append(entry, feedback);
document.body.appendChild(controls);

const grid = document.createElement('div');
document.body.appendChild(grid);

let typedWords: number[][] = [];
const repaints: (() => void)[] = [];

entry.addEventListener('input', () => {
  const { words, bad } = parseWords(entry.value);
  typedWords = words;
  feedback.textContent =
    (words.length ? `${words.length} word${words.length === 1 ? '' : 's'}` : '') +
    (bad.length ? `  ·  ignored: ${bad.slice(0, 4).join(' ')}` : '');
  for (const r of repaints) r();
});

const savedViews: (Isometry2 | null)[] = panels.map(() => null);

function panelSize(): number {
  const headH = heading.offsetHeight + controls.offsetHeight + 24;
  const wFit = Math.floor((window.innerWidth - 2 * PAD - 2 * GAP) / 3);
  const hFit = Math.floor(window.innerHeight - 2 * PAD - headH - HEAD_H - STATS_H - 10);
  return Math.max(240, Math.min(520, wFit, hFit));
}

function renderAll(): void {
  const size = panelSize();
  grid.style.cssText = `display:grid;grid-template-columns:repeat(3,${size}px);gap:${GAP}px`;
  grid.replaceChildren();
  repaints.length = 0;
  const dpr = window.devicePixelRatio || 1;

  panels.forEach((panel, i) => {
    const cell = document.createElement('div');
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;align-items:baseline;gap:8px;height:${HEAD_H - 6}px;margin-bottom:4px`;
    const title = document.createElement('div');
    title.textContent = panel.title;
    title.style.cssText = 'font-size:12px;color:#555;white-space:nowrap;overflow:hidden;flex:1';
    const save = document.createElement('button');
    save.textContent = 'SVG';
    save.style.cssText =
      'font-size:10px;padding:1px 7px;color:#666;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer';
    bar.append(title, save);
    const canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.cssText = `width:${size}px;height:${size}px;background:#fff;border-radius:4px`;
    const stats = document.createElement('div');
    stats.textContent = panel.stats;
    stats.style.cssText = `font-size:11px;color:#777;height:${STATS_H}px;margin-top:4px;white-space:nowrap;overflow:hidden`;
    cell.append(bar, canvas, stats);
    grid.appendChild(cell);

    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    let camera = panel.initialCamera(size);
    const saved = savedViews[i];
    if (saved) camera = { ...camera, view: saved };
    const geom: Geometry<Point2, Isometry2> = panel.data.group.geom;
    let hovered: ItemId | null = null;

    const ctx = (overrides?: StyleOverrides) => ({
      geom,
      model: panel.model,
      camera,
      size: { widthPx: size, heightPx: size },
      overrides,
    });
    const overrides = (): StyleOverrides => {
      const map = entryOverrides(panel.data, typedWords);
      if (hovered && !map.has(hovered)) map.set(hovered, { fill: { color: HOVER_COLOR, opacity: 0.95 } });
      return map;
    };
    const build = (): PathList => buildPathList(panel.data.scene, ctx(overrides()));
    const draw = (): void => {
      g.clearRect(0, 0, size, size);
      paint(g, build(), camera);
    };
    let pending = false;
    const schedule = (): void => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        draw();
      });
    };
    repaints.push(schedule);

    draw();
    save.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([toSvg(build(), camera, { widthPx: size, heightPx: size })], { type: 'image/svg+xml' }));
      a.download = `${panel.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.svg`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    attachInteraction(canvas, {
      geom,
      unproject: modelUnprojector(panel.model),
      camera,
      onCamera: (c) => {
        camera = c;
        savedViews[i] = c.view;
        schedule();
      },
      onPointer: (px) => {
        const id = px ? hitTest(panel.data.scene, ctx(), px) : null;
        const tile = id?.startsWith('tile:') ? id : null;
        if (tile !== hovered) {
          hovered = tile;
          schedule();
        }
      },
    });
  });
}

renderAll();
window.addEventListener('resize', renderAll);
