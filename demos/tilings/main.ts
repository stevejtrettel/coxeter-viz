/**
 * tilings — §5.6 T7 (+§5.7 C2, §5.8 D2): the general-polygon EXPORT demo.
 * Any compact 2D Coxeter polygon — vertex orders in, geometry INFERRED
 * (classifyPolygon) — drawn as the GPU field. The fundamental domain is
 * ALWAYS marked orange; the word list paints tiles red OVER everything
 * (listing `e` included). The cayley checkbox draws the Cayley graph — GPU
 * star bands at arbitrary depth when the field is on, CPU items otherwise
 * and for the vector SVG. Exports: adaptive SVG (the vector twin at the
 * CURRENT camera's coverage radius) and k× PNG. No depth constants
 * anywhere: the live CPU-off ambience is the same twin at a coarser ε.
 */

import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { identity } from '@/math/mat';
import { classifyPolygon, type RealizationSpec } from '@/coxeter/spec';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import { groupFromPolygon, wordId, type CoxeterGroup, type Tile } from '@/group/CoxeterGroup';
import { matrixKey } from '@/group/orbit';
import { polygonArea } from '@/polytope/measure';
import type { Camera, ItemId, PathList, Scene, SceneItem, StyleOverrides } from '@/viz2d/render/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { toSvg } from '@/viz2d/render/svg';
import { attachInteraction, hitTest, modelUnprojector } from '@/viz2d/render/interact';
import { renderPng, sceneLayer, type RasterLayer } from '@/viz2d/render/png';
import { TilingShader } from '@/viz2d/shader/TilingShader';
import { tilingLayer } from '@/viz2d/shader/layer';
import { coverageRadius, fieldScene, mergeFieldPaths } from '@/viz2d/shader/vector';
import type { Rgba, TilingStyle } from '@/viz2d/shader/types';

/** The fundamental domain: ALWAYS highlighted, whatever the word list says. */
const FD_COLOR = '#f6d9a0';
/** Word-list tiles: drawn OVER everything, the identity included. */
const LIST_COLOR = '#d15954';
const HOVER_COLOR = '#ffb454';
/** Generator wall colors, cycled for high rank. */
const WALL_COLORS = ['#c0392b', '#27ae60', '#2f6fb7', '#8e44ad', '#d68910', '#16a085'];
/** '#rrggbb' → Rgba for shader uniforms. */
const rgba = (hex: string, a: number): Rgba => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
  a,
];
/** ε = min tile width in px: the export dial, and a coarser one for live CPU ambience. */
const EXPORT_EPSILON_PX = 1.5;
const LIVE_EPSILON_PX = 3;
/** Cayley nodes are only legible where tiles are ≳ this wide. */
const CAYLEY_EPSILON_PX = 12;
const MAX_TILES = 20000;

/** The GPU field's ambience (as wordfile): quiet parity, faint intrinsic edges. */
function fieldStyle(r0: number): TilingStyle {
  return {
    even: [1, 1, 1, 1],
    odd: [0.98, 0.955, 0.905, 1],
    edge: [0.604, 0.553, 0.459, 0.45],
    edgeHalfWidth: 0.0075 * r0,
    vertex: [0, 0, 0, 0],
    vertexRadius: 0,
  };
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/** Dot-words over generators 0…n−1 (`e` = identity), whitespace/comma separated. */
function parseWords(text: string, n: number): { words: number[][]; bad: string[] } {
  const words: number[][] = [];
  const bad: string[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    if (tok === 'e') {
      words.push([]);
      continue;
    }
    const letters = /^[0-9]+(\.[0-9]+)*$/.test(tok) ? tok.split('.').map(Number) : null;
    if (letters && letters.every((i) => i < n)) words.push(letters);
    else bad.push(tok);
  }
  return { words, bad };
}

// ── The realized state ──────────────────────────────────────────────────────

interface State {
  kind: GeometryKind;
  group: CoxeterGroup<Point2, Isometry2>;
  poly: RealizedPolygon;
  model: Model<Point2>;
  r0: number;
  tiles: Tile<Point2, Isometry2>[];
  /** The NAMED layer only: patch tiles + walls (+ rim); ambience is separate. */
  scene: Scene;
}

function realize(orders: number[], words: number[][], gpuField: boolean): State {
  const kind = classifyPolygon(orders);
  const n = orders.length;
  const spec: RealizationSpec = {
    geometry: kind,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: Array.from({ length: n }, (_, k) => k) },
    decorations: orders.map((m, k) => ({ walls: [k, (k + 1) % n] as [number, number], order: m })),
  };
  const poly = solvePolygon(spec);
  const group = groupFromPolygon(poly);
  const model =
    kind === 'hyperbolic' ? new Poincare2() : kind === 'euclidean' ? new Cartesian2() : new Stereographic2();
  const tiles = group.tilesFor(words);
  const scene: Scene = [
    {
      id: 'domain',
      kind: 'domain',
      style: gpuField
        ? { rim: { color: '#bbbbbb', widthPx: 1.25 } }
        : { fill: { color: '#fbf9f3' }, rim: { color: '#bbbbbb', widthPx: 1.25 } },
    },
    // The fundamental domain, always marked (list or no list).
    {
      id: 'fd',
      kind: 'polygon' as const,
      vertices: poly.chamber.vertices,
      style: {
        fill: { color: FD_COLOR, opacity: 0.92 },
        edge: { color: '#7a6a4a', width: 0.03 * poly.inradius, opacity: 0.6 },
      },
    },
    // The word list, in red, OVER the fd (listing `e` paints it red too).
    ...tiles.map((t) => ({
      id: `tile:${wordId(t.word)}`,
      kind: 'polygon' as const,
      vertices: t.polytope.vertices,
      style: {
        fill: { color: LIST_COLOR, opacity: 0.9 },
        edge: { color: '#7a4a44', width: 0.03 * poly.inradius, opacity: 0.6 },
      },
    })),
    ...poly.walls.map((wall, i) => ({
      id: `wall:${i}`,
      kind: 'geodesic' as const,
      source: { type: 'line' as const, wall },
      style: { color: WALL_COLORS[i % WALL_COLORS.length], width: 0.05 * poly.inradius, opacity: 0.8 },
    })),
  ];
  return { kind, group, poly, model, r0: poly.inradius, tiles, scene };
}

/**
 * The Cayley graph over the adaptive ball (§5.7 C2): nodes at g·basePoint,
 * an edge g — g·R_i per generator found by MATRIX-KEY LOOKUP among the
 * ball's elements (the cayley.ts recipe at metric-ball scope; edges whose
 * far end left the ball are absent, the induced subgraph). ε picks the
 * legible depth automatically.
 */
function cayleyItems(state: State, camera: Camera, frame: { widthPx: number; heightPx: number }): SceneItem[] {
  const geom = state.group.geom;
  const radius = coverageRadius(state.group, state.model, camera, frame, CAYLEY_EPSILON_PX);
  const ball = state.group.tessellateBall(radius, 4000);
  const index = new Map(ball.map((t, k) => [matrixKey(t.element), k]));
  const pts = ball.map((t) => geom.apply(t.element, state.group.basePoint));
  const items: SceneItem[] = [];
  ball.forEach((t, a) => {
    for (let i = 0; i < state.group.rank; i++) {
      const b = index.get(matrixKey(geom.compose(t.element, state.group.reflections[i])));
      if (b === undefined || b <= a) continue; // absent far end / each edge once
      items.push({
        id: `cayedge:${wordId(t.word)}:${i}`,
        kind: 'geodesic',
        source: { type: 'segment', a: pts[a], b: pts[b] },
        style: { color: WALL_COLORS[i % WALL_COLORS.length], width: 0.06 * state.r0, opacity: 0.85 },
      });
    }
  });
  ball.forEach((t, k) => {
    items.push({
      id: `cay:${wordId(t.word)}`,
      kind: 'point',
      at: pts[k],
      style: { color: '#1a1a1a', radius: 0.11 * state.r0 },
    });
  });
  return items;
}

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'tilings / T7 — any Coxeter polygon · vertex orders infer the geometry · color a word-list patch · adaptive SVG + k× PNG';
heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 8px';
document.body.appendChild(heading);

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
const smallBtn = (label: string): HTMLButtonElement => {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'font-size:11px;padding:2px 9px;color:#666;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer';
  return b;
};
const ordersInput = document.createElement('input');
ordersInput.value = '2, 2, 2, 2, 2';
ordersInput.style.cssText =
  'width:130px;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff';
const wordsInput = document.createElement('input');
wordsInput.placeholder = 'words: e 0 1 0.1 …';
wordsInput.style.cssText =
  'width:260px;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff';
const PRESETS: [string, string][] = [
  ['triangle', '2, 3, 7'],
  ['quad', '2, 2, 2, 2'],
  ['pentagon', '2, 2, 2, 2, 2'],
  ['hexagon', '2, 2, 2, 2, 2, 2'],
];
const presetBtns = PRESETS.map(([label, orders]) => {
  const b = smallBtn(label);
  b.addEventListener('click', () => {
    ordersInput.value = orders;
    wordsInput.value = ''; // a fresh tiling starts unmarked (fd always shows)
    rebuild();
  });
  return b;
});
const svgBtn = smallBtn('SVG');
const pngBtn = smallBtn('PNG');
const kSelect = document.createElement('select');
kSelect.style.cssText = 'font-size:12px;padding:2px;border:1px solid #ccc;border-radius:3px;background:#fff';
for (const k of [1, 2, 4, 8]) {
  const opt = document.createElement('option');
  opt.value = String(k);
  opt.textContent = `${k}×`;
  kSelect.appendChild(opt);
}
kSelect.value = '2';
const pxLabel = document.createElement('span');
pxLabel.style.cssText = 'font-size:11px;color:#999';
const gpuWrap = document.createElement('label');
gpuWrap.style.cssText = 'font-size:12px;color:#555;display:inline-flex;gap:4px;align-items:center';
const gpuBox = document.createElement('input');
gpuBox.type = 'checkbox';
gpuBox.checked = true;
gpuWrap.append(gpuBox, document.createTextNode('tiling'));
const cayWrap = document.createElement('label');
cayWrap.style.cssText = gpuWrap.style.cssText;
const cayBox = document.createElement('input');
cayBox.type = 'checkbox';
cayWrap.append(cayBox, document.createTextNode('cayley'));
const status = document.createElement('span');
status.style.cssText = 'font-size:12px;color:#777';
controls.append(ordersInput, ...presetBtns, wordsInput, gpuWrap, cayWrap, svgBtn, pngBtn, kSelect, pxLabel, status);
document.body.appendChild(controls);

// The layer stack: GPU field under the transparent named canvas (§5.6 T4).
const stack = document.createElement('div');
stack.style.cssText = 'position:relative;background:#fff;border-radius:4px';
const glCanvas = document.createElement('canvas');
glCanvas.style.cssText = 'position:absolute;inset:0';
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;inset:0';
stack.append(glCanvas, canvas);
document.body.appendChild(stack);
const shader = new TilingShader(glCanvas);

let currentSize = 0;
function updatePxLabel(): void {
  const d = Math.round(currentSize * Number(kSelect.value));
  pxLabel.textContent = currentSize ? `${d} × ${d} px (${((d * d) / 1e6).toFixed(1)} MP)` : '';
}

const parseOrders = (): number[] | null => {
  const nums = ordersInput.value.split(/[\s,;]+/).filter(Boolean).map(Number);
  return nums.length >= 3 && nums.every((m) => Number.isInteger(m) && m >= 2) ? nums : null;
};

let detach: (() => void) | null = null;

function rebuild(): void {
  const orders = parseOrders();
  let state: State;
  let bad: string[] = [];
  try {
    if (!orders) throw new Error('orders: ≥ 3 integers ≥ 2, the cyclic vertex orders');
    const parsed = parseWords(wordsInput.value, orders.length);
    bad = parsed.bad;
    state = realize(orders, parsed.words, gpuBox.checked);
  } catch (err) {
    status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
    return;
  }
  status.textContent =
    `${state.kind} ${orders.length}-gon · ${state.tiles.length} colored tiles · ` +
    `chamber area ${polygonArea(state.group.geom, state.poly.chamber.vertices).toPrecision(4)}` +
    (bad.length ? ` · ignored: ${bad.slice(0, 4).join(' ')}` : '');

  const headH = heading.offsetHeight + controls.offsetHeight + 24;
  const size = Math.max(
    260,
    Math.min(760, window.innerWidth - 2 * PAD, window.innerHeight - 2 * PAD - headH),
  );
  const dpr = window.devicePixelRatio || 1;
  for (const c of [glCanvas, canvas]) {
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
  }
  stack.style.width = `${size}px`;
  stack.style.height = `${size}px`;
  glCanvas.style.display = gpuBox.checked ? 'block' : 'none';
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (gpuBox.checked) {
    shader.setPolygon(state.poly);
    shader.setChart(state.model);
  }
  currentSize = size;
  updatePxLabel();

  // Camera: disk charts frame the domain; E fits ~16 inradii; S a fixed span.
  const scalePx =
    state.model.domain.kind === 'disk'
      ? size / 2 / (state.model.domain.radius * 1.08)
      : state.kind === 'euclidean'
        ? size / (16 * state.r0)
        : size / 2 / 3.2;
  let camera: Camera = { view: identity(3) as Isometry2, scalePx, centerPx: [size / 2, size / 2] };
  let hovered: ItemId | null = null;
  const frame = { widthPx: size, heightPx: size };

  // The CPU-off ambience: the vector twin at a coarse ε — no depth constants.
  const liveTwin = gpuBox.checked
    ? []
    : fieldScene(
        state.group,
        fieldStyle(state.r0),
        { radius: coverageRadius(state.group, state.model, camera, frame, LIVE_EPSILON_PX) },
        MAX_TILES,
      );

  const ctx = (overrides?: StyleOverrides) => ({
    geom: state.group.geom,
    model: state.model,
    camera,
    size: frame,
    overrides,
  });
  // §5.8 D2: with the field on, the Cayley graph is GPU star bands —
  // arbitrary depth, free per frame. CPU items serve the GPU-off live view
  // and the vector SVG.
  const gpuStar = gpuBox.checked && cayBox.checked;
  const gpuStyle: TilingStyle = gpuStar
    ? {
        ...fieldStyle(state.r0),
        star: {
          anchor: state.group.basePoint,
          halfWidth: 0.03 * state.r0,
          bands: state.poly.walls.map((_, i) => ({
            wall: i,
            color: rgba(WALL_COLORS[i % WALL_COLORS.length], 0.85),
          })),
          node: { color: [0.1, 0.1, 0.1, 1], radius: 0.11 * state.r0 },
        },
      }
    : fieldStyle(state.r0);
  const cayleyLive = cayBox.checked && !gpuBox.checked ? cayleyItems(state, camera, frame) : [];
  const build = (): PathList =>
    buildPathList(
      [...liveTwin, ...state.scene, ...cayleyLive],
      ctx(hovered ? new Map([[hovered, { fill: { color: HOVER_COLOR, opacity: 0.95 } }]]) : undefined),
    );
  const draw = (): void => {
    if (gpuBox.checked) {
      shader.draw(
        { view: camera.view, scalePx: camera.scalePx * dpr, centerPx: [camera.centerPx[0] * dpr, camera.centerPx[1] * dpr] },
        gpuStyle,
      );
    }
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

  const download = (href: string, ext: string): void => {
    const a = document.createElement('a');
    a.href = href;
    a.download = `tiling-${ordersInput.value.replace(/[^0-9]+/g, '-')}.${ext}`;
    a.click();
    URL.revokeObjectURL(href);
  };
  // SVG: the twin at the coverage radius of the CURRENT camera (§5.6 T6).
  svgBtn.onclick = () => {
    const radius = coverageRadius(state.group, state.model, camera, frame, EXPORT_EPSILON_PX);
    const cayleySvg = cayBox.checked ? cayleyItems(state, camera, frame) : [];
    const exportScene = [
      ...fieldScene(state.group, fieldStyle(state.r0), { radius }, MAX_TILES),
      ...state.scene,
      ...cayleySvg,
    ];
    const paths = mergeFieldPaths(buildPathList(exportScene, ctx()));
    download(
      URL.createObjectURL(new Blob([toSvg(paths, camera, frame)], { type: 'image/svg+xml' })),
      'svg',
    );
  };
  // PNG: both painters re-rendered at k× (§5.6 T3).
  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [];
    if (gpuBox.checked) layers.push(tilingLayer(state.poly, state.model, gpuStyle));
    layers.push(sceneLayer([...liveTwin, ...state.scene, ...cayleyLive], state.group.geom, state.model));
    void renderPng(layers, camera, frame, k, '#ffffff')
      .then((blob) => download(URL.createObjectURL(blob), `${k}x.png`))
      .catch((err: unknown) => {
        status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
      });
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

ordersInput.addEventListener('change', rebuild);
wordsInput.addEventListener('change', rebuild);
gpuBox.addEventListener('change', rebuild);
cayBox.addEventListener('change', rebuild);
kSelect.addEventListener('change', updatePxLabel);
window.addEventListener('resize', rebuild);

rebuild();
