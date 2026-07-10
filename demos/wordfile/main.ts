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
import { identity } from '@/math/mat';
import type { RealizedPolygon } from '@/coxeter/solve';
import { wordId, type CoxeterGroup, type Tile } from '@/group/CoxeterGroup';
import { hullOfTiles, hullOfWords, parseWordFile } from '@/group/wordlists';
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
import { realizePolygon } from '@/viz2d/kit/realize';
import { domainItem, parityColor, polygonItem, tilesToScene, wallItems } from '@/viz2d/kit/scene';
import { fieldStyle } from '@/viz2d/kit/field';
import { GEN_COLORS, GREY, HOVER, HULL, HULL_TILES, TILE } from '@/viz2d/kit/palette';
import {
  PAD, button, checkbox, downloadBlob, downloadSvg, dpr, exportSizeLabel,
  kSelect as buildKSelect, layerStack, pageShell, rafScheduler, sizeStack, statusText, textInput,
} from '../shared';
// The example ships with the demo and auto-loads through the SAME parser a
// picked file goes through.
import exampleRaw from './example-words.json?raw';

/** CPU ambient background tessellation depth per geometry (GPU field off). */
const BG_DEPTH: Record<GeometryKind, number> = { hyperbolic: 12, euclidean: 12, spherical: 20 };
/**
 * SVG-twin coverage is ADAPTIVE (§5.6 T6): `coverageRadius` turns the
 * current camera + chart + this pixel threshold into an intrinsic radius,
 * and `tessellateBall` enumerates exactly that — the same visual
 * completeness for every (p,q,r), no per-group depth. ε = minimum tile
 * width in px to include; the size/reach dial (1.5 ≈ a few hundred KB for
 * (2,3,7) at the default view).
 */
const EXPORT_EPSILON_PX = 1.5;

// ── The realized state ──────────────────────────────────────────────────────

interface State {
  kind: GeometryKind;
  group: CoxeterGroup<Point2, Isometry2>;
  poly: RealizedPolygon;
  model: Model<Point2>;
  tiles: Tile<Point2, Isometry2>[];
  scene: Scene;
  chamberArea: number;
  r0: number;
  /** Hull-of-base-points stats line fragment ('' when no hull). */
  hullNote: string;
}

interface HullOptions {
  centers: boolean;
  tiles: boolean;
}

function realize(
  orders: [number, number, number],
  words: number[][],
  hulls: HullOptions,
  gpuField: boolean,
): State {
  const { kind, group, poly, model, r0 } = realizePolygon(orders); // geometry INFERRED (model: auto)
  const tiles = group.tilesFor(words);
  // The GPU field replaces the CPU domain FILL and the depth-capped ambient
  // tessellation (§5.6: identity is the knife — the anonymous group moves to
  // the shader, unlimited depth); the rim stays as chrome. With the field
  // off, the original CPU ambience is drawn as before.
  const scene: Scene = [
    domainItem(!gpuField),
    // The ambient tessellation, faint — the word list reads as a HIGHLIGHTED
    // PATCH within the tiling, not as tiles floating in space.
    ...tilesToScene(
      gpuField ? [] : group.tessellate(BG_DEPTH[kind], 20000),
      () => ({
        fill: { color: '#ffffff', opacity: 0.5 },
        edge: { color: GREY.ambientEdge, width: 0.015 * r0, opacity: 0.35 },
      }),
      (w) => `bg:${wordId(w)}`,
    ),
    // The word list, colored by word-length parity (elementwise: any spelling agrees).
    ...tilesToScene(tiles, (t) => ({
      fill: { color: parityColor(t.word, TILE), opacity: 0.92 },
      edge: { color: GREY.tileEdge, width: 0.03 * r0, opacity: 0.6 },
    })),
    // The walls, for orientation (ids = generator indices, as everywhere).
    ...wallItems(poly.walls, (i) => ({ color: GEN_COLORS[i], width: 0.05 * r0, opacity: 0.8 })),
  ];

  // The hulls, per the toggles: of the base-point CENTERS (M3.3) and/or of
  // the TILES themselves (hull of the union = hull of the tile vertices).
  // Degenerate lists and the spherical hemisphere refusal degrade to a note.
  let hullNote = '';
  const drawHull = (which: 'centers' | 'tiles', color: string): void => {
    if (tiles.length < 3) return;
    try {
      const hull = which === 'centers' ? hullOfWords(group, words) : hullOfTiles(group, words);
      (scene as SceneItem[]).push(
        polygonItem(
          hull,
          { fill: { color, opacity: 0.09 }, edge: { color, width: 0.07 * r0, opacity: 0.9 } },
          `hull:${which}`,
        ),
      );
      hullNote += ` · ${which} hull: area ${polygonArea(group.geom, hull.vertices).toPrecision(4)}`;
    } catch {
      hullNote += ` · ${which} hull: — (spans > a hemisphere)`;
    }
  };
  if (hulls.tiles) drawHull('tiles', HULL_TILES);
  if (hulls.centers) drawHull('centers', HULL);
  return {
    kind,
    group,
    poly,
    model,
    tiles,
    scene,
    chamberArea: polygonArea(group.geom, poly.chamber.vertices),
    r0,
    hullNote,
  };
}

// ── Page ────────────────────────────────────────────────────────────────────

const heading = pageShell('wordfile / M3.5 — a tiling from a word-list file · orders (p,q,r) infer the geometry');

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:10px;align-items:baseline;margin-bottom:10px;flex-wrap:wrap';
const ordersInput = textInput('2, 3, 7', 90);
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.json,.txt,.jsonl,text/plain,application/json';
fileInput.style.cssText = 'font-size:12px';
const sampleBtn = button('sample list');
const saveBtn = button('SVG');
const status = statusText();
/** A checkbox appended to the controls bar, returning its input. */
const toggle = (label: string, checked: boolean): HTMLInputElement => {
  const { label: el, input } = checkbox(label, checked);
  controls.appendChild(el);
  return input;
};
const pngBtn = button('PNG');
const kSelect = buildKSelect();
const pxLabel = document.createElement('span');
pxLabel.style.cssText = 'font-size:11px;color:#999';
controls.append(ordersInput, fileInput, sampleBtn, saveBtn, pngBtn, kSelect, pxLabel);
const hullCentersBox = toggle('hull of centers', true);
const hullTilesBox = toggle('hull of tiles', true);
const gpuBox = toggle('GPU field', true);
controls.appendChild(status);
document.body.appendChild(controls);

// The layer stack (§5.6 T4): the GPU field UNDER the transparent Canvas2D
// that carries every named element; one controller on the top canvas.
const { stack, glCanvas, canvas } = layerStack();
document.body.appendChild(stack);
const shader = new TilingShader(glCanvas);

let currentSize = 0;
/** The k-selector's price tag: exact export dimensions + megapixels. */
function updatePxLabel(): void {
  pxLabel.textContent = exportSizeLabel(currentSize, Number(kSelect.value));
}

// The ball of (2,3,7) words to depth 6 — an alternative built-in list.
function sampleWords(): number[][] {
  const g = realize([2, 3, 7], [], { centers: false, tiles: false }, true).group;
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
    state = realize(
      nums as [number, number, number],
      currentWords,
      { centers: hullCentersBox.checked, tiles: hullTilesBox.checked },
      gpuBox.checked,
    );
  } catch (err) {
    status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
    return;
  }
  const distinct = state.tiles.length;
  status.textContent =
    `${state.kind} · ${currentWords.length} words → ${distinct} tiles · ` +
    `chamber area ${state.chamberArea.toPrecision(5)} · total ${(distinct * state.chamberArea).toPrecision(5)}` +
    state.hullNote;

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
      ctx(hovered ? new Map([[hovered, { fill: { color: HOVER, opacity: 0.95 } }]]) : undefined),
    );
  const draw = (): void => {
    if (gpuBox.checked) {
      shader.draw(
        { view: camera.view, scalePx: camera.scalePx * d, centerPx: [camera.centerPx[0] * d, camera.centerPx[1] * d] },
        fieldStyle(state.r0),
      );
    }
    g.clearRect(0, 0, size, size);
    paint(g, build(), camera);
  };
  const schedule = rafScheduler(draw);

  draw();
  // SVG: with the field on, prepend its VECTOR TWIN (tilingshader/vector.ts)
  // so the export shows the tiling the shader shows — same TilingStyle,
  // conventions matched (exact for spherical; ball-truncated in E/H).
  saveBtn.onclick = () => {
    const frame = { widthPx: size, heightPx: size };
    const radius = coverageRadius(state.group, state.model, camera, frame, EXPORT_EPSILON_PX);
    const exportScene = gpuBox.checked
      ? [...fieldScene(state.group, fieldStyle(state.r0), { radius }, 20000), ...state.scene]
      : state.scene;
    const paths = mergeFieldPaths(buildPathList(exportScene, ctx()));
    downloadSvg(toSvg(paths, camera, frame), `tiling-${ordersInput.value.replace(/[^0-9]+/g, '-')}.svg`);
  };
  // PNG: the k× compositor (render2d/png.ts) — the GPU field re-evaluates
  // per pixel, the vector layer re-samples; SVG above stays vector-only.
  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [];
    if (gpuBox.checked) layers.push(tilingLayer(state.poly, state.model, fieldStyle(state.r0)));
    layers.push(sceneLayer(state.scene, state.group.geom, state.model));
    void renderPng(layers, camera, { widthPx: size, heightPx: size }, k, '#ffffff')
      .then((blob) => downloadBlob(blob, `tiling-${ordersInput.value.replace(/[^0-9]+/g, '-')}-${k}x.png`))
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

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    const { words, errors } = parseWordFile(text, 3);
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
hullCentersBox.addEventListener('change', rebuild);
hullTilesBox.addEventListener('change', rebuild);
gpuBox.addEventListener('change', rebuild);
kSelect.addEventListener('change', updatePxLabel);
window.addEventListener('resize', rebuild);

// Auto-load the shipped example (the (2,3,7) alternating-subgroup patch).
currentWords = parseWordFile(exampleRaw, 3).words;
rebuild();
