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
import { identity } from '@/math/mat';
import type { RealizedPolygon } from '@/coxeter/solve';
import type { CoxeterGroup, Tile } from '@/group/CoxeterGroup';
import { parseWordList } from '@/group/wordlists';
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
import type { TilingStyle } from '@/viz2d/shader/types';
import { realizePolygon } from '@/viz2d/kit/realize';
import { cayleyScene, domainItem, polygonItem, tilesToScene, wallItems } from '@/viz2d/kit/scene';
import { fieldStyle, rgba, starBands, starField } from '@/viz2d/kit/field';
import { FD, GREY, HOVER, LIST, WALL_COLORS } from '@/viz2d/kit/palette';
import {
  PAD, button, checkbox, downloadBlob, downloadSvg, dpr, exportSizeLabel,
  kSelect as buildKSelect, layerStack, pageShell, rafScheduler, sizeStack, statusText, textInput,
} from '../shared';

/** ε = min tile width in px: the export dial, and a coarser one for live CPU ambience. */
const EXPORT_EPSILON_PX = 1.5;
const LIVE_EPSILON_PX = 3;
/** Cayley nodes are only legible where tiles are ≳ this wide. */
const CAYLEY_EPSILON_PX = 12;
const MAX_TILES = 20000;

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
  const { kind, group, poly, model, r0 } = realizePolygon(orders); // geometry INFERRED
  const tiles = group.tilesFor(words);
  const scene: Scene = [
    domainItem(!gpuField),
    // The fundamental domain, always marked (list or no list).
    polygonItem(
      poly.chamber,
      { fill: { color: FD, opacity: 0.92 }, edge: { color: GREY.tileEdge, width: 0.03 * r0, opacity: 0.6 } },
      'fd',
    ),
    // The word list, in red, OVER the fd (listing `e` paints it red too).
    ...tilesToScene(tiles, () => ({
      fill: { color: LIST, opacity: 0.9 },
      edge: { color: '#7a4a44', width: 0.03 * r0, opacity: 0.6 },
    })),
    ...wallItems(poly.walls, (i) => ({ color: WALL_COLORS[i % WALL_COLORS.length], width: 0.05 * r0, opacity: 0.8 })),
  ];
  return { kind, group, poly, model, r0, tiles, scene };
}

/**
 * The Cayley graph over the adaptive ball (§5.7 C2): the library's
 * `cayleyBall` (the induced graph on the metric ball), drawn by kit's
 * `cayleyScene`. ε picks the legible depth automatically.
 */
function cayleyItems(state: State, camera: Camera, frame: { widthPx: number; heightPx: number }): SceneItem[] {
  const radius = coverageRadius(state.group, state.model, camera, frame, CAYLEY_EPSILON_PX);
  return cayleyScene(state.group, state.group.cayleyBall(radius, 4000), {
    edge: (g) => ({ color: WALL_COLORS[g % WALL_COLORS.length], width: 0.06 * state.r0, opacity: 0.85 }),
    node: () => ({ color: '#1a1a1a', radius: 0.11 * state.r0 }),
  });
}

// ── Page ────────────────────────────────────────────────────────────────────

const heading = pageShell(
  'tilings / T7 — any Coxeter polygon · vertex orders infer the geometry · color a word-list patch · adaptive SVG + k× PNG',
);

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
const ordersInput = textInput('2, 2, 2, 2, 2', 130);
const wordsInput = textInput('', 260);
wordsInput.placeholder = 'words: e 0 1 0.1 …';
const PRESETS: [string, string][] = [
  ['triangle', '2, 3, 7'],
  ['quad', '2, 2, 2, 2'],
  ['pentagon', '2, 2, 2, 2, 2'],
  ['hexagon', '2, 2, 2, 2, 2, 2'],
];
const presetBtns = PRESETS.map(([label, orders]) => {
  const b = button(label);
  b.addEventListener('click', () => {
    ordersInput.value = orders;
    wordsInput.value = ''; // a fresh tiling starts unmarked (fd always shows)
    rebuild();
  });
  return b;
});
const svgBtn = button('SVG');
const pngBtn = button('PNG');
const kSelect = buildKSelect();
const pxLabel = document.createElement('span');
pxLabel.style.cssText = 'font-size:11px;color:#999';
const { label: gpuWrap, input: gpuBox } = checkbox('tiling', true);
const { label: cayWrap, input: cayBox } = checkbox('cayley', false);
const status = statusText();
controls.append(ordersInput, ...presetBtns, wordsInput, gpuWrap, cayWrap, svgBtn, pngBtn, kSelect, pxLabel, status);
document.body.appendChild(controls);

// The layer stack: GPU field under the transparent named canvas (§5.6 T4).
const { stack, glCanvas, canvas } = layerStack();
document.body.appendChild(stack);
const shader = new TilingShader(glCanvas);

let currentSize = 0;
function updatePxLabel(): void {
  pxLabel.textContent = exportSizeLabel(currentSize, Number(kSelect.value));
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
    const parsed = parseWordList(wordsInput.value, orders.length);
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
  const d = dpr();
  const g = sizeStack({ stack, glCanvas, canvas }, size, d, gpuBox.checked);
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
    ? starField(fieldStyle(state.r0), {
        anchor: state.group.basePoint,
        halfWidth: 0.03 * state.r0,
        bands: starBands(state.poly.walls, (i) => rgba(WALL_COLORS[i % WALL_COLORS.length], 0.85)),
        node: { color: [0.1, 0.1, 0.1, 1], radius: 0.11 * state.r0 },
      })
    : fieldStyle(state.r0);
  const cayleyLive = cayBox.checked && !gpuBox.checked ? cayleyItems(state, camera, frame) : [];
  const build = (): PathList =>
    buildPathList(
      [...liveTwin, ...state.scene, ...cayleyLive],
      ctx(hovered ? new Map([[hovered, { fill: { color: HOVER, opacity: 0.95 } }]]) : undefined),
    );
  const draw = (): void => {
    if (gpuBox.checked) {
      shader.draw(
        { view: camera.view, scalePx: camera.scalePx * d, centerPx: [camera.centerPx[0] * d, camera.centerPx[1] * d] },
        gpuStyle,
      );
    }
    g.clearRect(0, 0, size, size);
    paint(g, build(), camera);
  };
  const schedule = rafScheduler(draw);
  draw();

  const stem = () => `tiling-${ordersInput.value.replace(/[^0-9]+/g, '-')}`;
  // SVG: the twin at the coverage radius of the CURRENT camera (§5.6 T6).
  svgBtn.onclick = () => {
    const radius = coverageRadius(state.group, state.model, camera, frame, EXPORT_EPSILON_PX);
    const cayleySvg = cayBox.checked ? cayleyItems(state, camera, frame) : [];
    const exportScene = [
      ...fieldScene(state.group, fieldStyle(state.r0), { radius }, MAX_TILES),
      ...state.scene,
      ...cayleySvg,
    ];
    downloadSvg(toSvg(mergeFieldPaths(buildPathList(exportScene, ctx())), camera, frame), `${stem()}.svg`);
  };
  // PNG: both painters re-rendered at k× (§5.6 T3).
  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [];
    if (gpuBox.checked) layers.push(tilingLayer(state.poly, state.model, gpuStyle));
    layers.push(sceneLayer([...liveTwin, ...state.scene, ...cayleyLive], state.group.geom, state.model));
    void renderPng(layers, camera, frame, k, '#ffffff')
      .then((blob) => downloadBlob(blob, `${stem()}-${k}x.png`))
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
