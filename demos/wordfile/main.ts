/**
 * wordfile — M3.5 (user-directed): read a WORD LIST FROM A FILE and draw the
 * tiling it denotes. The product shape in miniature (design doc §4): abstract
 * data in — triangle orders (p,q,r) with the geometry INFERRED by exact
 * classification, plus a file of words — and the engine draws the tiles each
 * word represents, elementwise. Formats: JSON `[[0,1],[1,2,1],…]` (or
 * `{ "words": [...] }`, the Python-friendly form), or plain text words
 * (`0.1, 1.2.1` — whitespace/comma separated, `e` for the identity).
 */

import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { identity } from '@/math/mat';
import { classifyPolygon, type RealizationSpec } from '@/coxeter/spec';
import { solvePolygon } from '@/coxeter/solve';
import { groupFromPolygon, wordId, type CoxeterGroup, type Tile } from '@/group/CoxeterGroup';
import { polygonArea } from '@/polytope/measure';
import type { Camera, ItemId, PathList, Scene, StyleOverrides } from '@/render2d/types';
import { buildPathList } from '@/render2d/scene';
import { paint } from '@/render2d/canvas';
import { toSvg } from '@/render2d/svg';
import { attachInteraction, hitTest, modelUnprojector } from '@/render2d/interact';
// The example ships with the demo and auto-loads through the SAME parser a
// picked file goes through.
import exampleRaw from './example-words.json?raw';

const TILE_IDENTITY = '#f6d9a0';
const TILE_EVEN = '#f2e3c4';
const TILE_ODD = '#ffffff';
const HOVER_COLOR = '#ffb454';
/** Ambient background tessellation depth per geometry. */
const BG_DEPTH: Record<GeometryKind, number> = { hyperbolic: 12, euclidean: 12, spherical: 20 };

// ── Parsing ─────────────────────────────────────────────────────────────────

/** Words from file text: JSON first (array or {words}), else the dot format. */
function parseFile(text: string): { words: number[][]; errors: string[] } {
  const errors: string[] = [];
  const isWord = (w: unknown): w is number[] =>
    Array.isArray(w) && w.every((i) => Number.isInteger(i) && i >= 0 && i <= 2);
  try {
    const json: unknown = JSON.parse(text);
    const list = Array.isArray(json) ? json : (json as { words?: unknown }).words;
    if (Array.isArray(list)) {
      const words = list.filter(isWord) as number[][];
      if (words.length < list.length) errors.push(`${list.length - words.length} malformed entries skipped`);
      return { words, errors };
    }
    errors.push('JSON has no word array');
    return { words: [], errors };
  } catch {
    // Plain text: whitespace/comma-separated dot words.
    const words: number[][] = [];
    for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
      if (tok === 'e') words.push([]);
      else if (/^[0-2](\.[0-2])*$/.test(tok)) words.push(tok.split('.').map(Number));
      else errors.push(tok);
    }
    return { words, errors: errors.length ? [`ignored: ${errors.slice(0, 5).join(' ')}`] : [] };
  }
}

// ── The realized state ──────────────────────────────────────────────────────

interface State {
  kind: GeometryKind;
  group: CoxeterGroup<Point2, Isometry2>;
  model: Model<Point2>;
  tiles: Tile<Point2, Isometry2>[];
  scene: Scene;
  chamberArea: number;
  r0: number;
}

function realize(orders: [number, number, number], words: number[][]): State {
  const kind = classifyPolygon(orders); // the geometry is INFERRED (model: auto)
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
  const r0 = realized.inradius;
  const model =
    kind === 'hyperbolic' ? new Poincare2() : kind === 'euclidean' ? new Cartesian2() : new Stereographic2();

  const tiles = group.tilesFor(words);
  const scene: Scene = [
    {
      id: 'domain',
      kind: 'domain',
      style: { fill: { color: '#fbf9f3' }, rim: { color: '#bbbbbb', widthPx: 1.25 } },
    },
    // The ambient tessellation, faint — the word list reads as a HIGHLIGHTED
    // PATCH within the tiling, not as tiles floating in space.
    ...group.tessellate(BG_DEPTH[kind], 20000).map((t) => ({
      id: `bg:${wordId(t.word)}`,
      kind: 'polygon' as const,
      vertices: t.polytope.vertices,
      style: {
        fill: { color: '#ffffff', opacity: 0.5 },
        edge: { color: '#9a8d75', width: 0.015 * r0, opacity: 0.35 },
      },
    })),
    ...tiles.map((t) => ({
      id: `tile:${wordId(t.word)}`,
      kind: 'polygon' as const,
      vertices: t.polytope.vertices,
      style: {
        fill: {
          // Word-length parity is elementwise (det = ±1), so any spelling agrees.
          color: t.word.length === 0 ? TILE_IDENTITY : t.word.length % 2 === 0 ? TILE_EVEN : TILE_ODD,
          opacity: 0.92,
        },
        edge: { color: '#7a6a4a', width: 0.03 * r0, opacity: 0.6 },
      },
    })),
    // The walls, for orientation (ids = generator indices, as everywhere).
    ...realized.walls.map((wall, i) => ({
      id: `wall:${i}`,
      kind: 'geodesic' as const,
      source: { type: 'line' as const, wall },
      style: { color: ['#c0392b', '#27ae60', '#2f6fb7'][i], width: 0.05 * r0, opacity: 0.8 },
    })),
  ];
  return { kind, group, model, tiles, scene, chamberArea: polygonArea(group.geom, realized.chamber.vertices), r0 };
}

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent = 'wordfile / M3.5 — a tiling from a word-list file · orders (p,q,r) infer the geometry';
heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 8px';
document.body.appendChild(heading);

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:10px;align-items:baseline;margin-bottom:10px;flex-wrap:wrap';
const ordersInput = document.createElement('input');
ordersInput.value = '2, 3, 7';
ordersInput.style.cssText =
  'width:90px;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff';
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.json,.txt,.jsonl,text/plain,application/json';
fileInput.style.cssText = 'font-size:12px';
const sampleBtn = document.createElement('button');
sampleBtn.textContent = 'sample list';
sampleBtn.style.cssText =
  'font-size:11px;padding:2px 9px;color:#666;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer';
const saveBtn = document.createElement('button');
saveBtn.textContent = 'SVG';
saveBtn.style.cssText = sampleBtn.style.cssText;
const status = document.createElement('span');
status.style.cssText = 'font-size:12px;color:#777';
controls.append(ordersInput, fileInput, sampleBtn, saveBtn, status);
document.body.appendChild(controls);

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// The ball of (2,3,7) words to depth 6 — an alternative built-in list.
function sampleWords(): number[][] {
  const g = realize([2, 3, 7], []).group;
  return g.orbit(6).map((e) => e.word);
}

let currentWords: number[][] = [];
let detach: (() => void) | null = null;

function rebuild(): void {
  const nums = ordersInput.value.split(/[\s,;]+/).filter(Boolean).map(Number);
  let state: State;
  try {
    if (nums.length !== 3 || nums.some((n) => !Number.isInteger(n) || n < 2)) {
      throw new Error('orders must be three integers ≥ 2');
    }
    state = realize(nums as [number, number, number], currentWords);
  } catch (err) {
    status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
    return;
  }
  const distinct = state.tiles.length;
  status.textContent =
    `${state.kind} · ${currentWords.length} words → ${distinct} tiles · ` +
    `chamber area ${state.chamberArea.toPrecision(5)} · total ${(distinct * state.chamberArea).toPrecision(5)}`;

  const headH = heading.offsetHeight + controls.offsetHeight + 24;
  const size = Math.max(
    260,
    Math.min(760, window.innerWidth - 2 * PAD, window.innerHeight - 2 * PAD - headH),
  );
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.cssText = `width:${size}px;height:${size}px;background:#fff;border-radius:4px`;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Camera: disk charts frame the domain; plane charts fit the tiles.
  let scalePx: number;
  if (state.model.domain.kind === 'disk') {
    scalePx = size / 2 / (state.model.domain.radius * 1.08);
  } else {
    let extent = 1e-9;
    const fitSets = [state.group.chamber.vertices, ...state.tiles.map((t) => t.polytope.vertices)];
    for (const verts of fitSets) {
      for (const v of verts) {
        const u = state.model.project(v);
        extent = Math.max(extent, Math.hypot(u[0], u[1]));
      }
    }
    scalePx = size / 2 / (state.kind === 'spherical' ? 3.2 : extent * 1.15);
  }
  let camera: Camera = { view: identity(3) as Isometry2, scalePx, centerPx: [size / 2, size / 2] };
  let hovered: ItemId | null = null;

  const ctx = (overrides?: StyleOverrides) => ({
    geom: state.group.geom,
    model: state.model,
    camera,
    size: { widthPx: size, heightPx: size },
    overrides,
  });
  const build = (): PathList =>
    buildPathList(
      state.scene,
      ctx(hovered ? new Map([[hovered, { fill: { color: HOVER_COLOR, opacity: 0.95 } }]]) : undefined),
    );
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

  draw();
  saveBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([toSvg(build(), camera, { widthPx: size, heightPx: size })], { type: 'image/svg+xml' }),
    );
    a.download = `tiling-${ordersInput.value.replace(/[^0-9]+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  detach?.();
  const handle = attachInteraction(canvas, {
    geom: state.group.geom,
    unproject: modelUnprojector(state.model),
    camera,
    onCamera: (c) => {
      camera = c;
      schedule();
    },
    onPointer: (px) => {
      const id = px ? hitTest(state.scene, ctx(), px) : null;
      const tile = id?.startsWith('tile:') ? id : null;
      if (tile !== hovered) {
        hovered = tile;
        schedule();
      }
    },
  });
  detach = () => handle.dispose();
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    const { words, errors } = parseFile(text);
    currentWords = words;
    if (errors.length) status.textContent = `⚠ ${errors.join(' · ')}`;
    rebuild();
  });
});
sampleBtn.addEventListener('click', () => {
  currentWords = sampleWords();
  rebuild();
});
ordersInput.addEventListener('change', rebuild);
window.addEventListener('resize', rebuild);

// Auto-load the shipped example (the (2,3,7) alternating-subgroup patch).
currentWords = parseFile(exampleRaw).words;
rebuild();
