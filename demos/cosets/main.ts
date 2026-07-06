/**
 * cosets — §5.7 C1 + §5.8 D1: PARABOLIC COSET COLORING. Choose a generator
 * subset S; tiles are colored by their LEFT coset g·W_S — for a vertex
 * dihedral W_{ij}, the flowers around that vertex's images. When a
 * W_S-fixed anchor exists (S = ∅ / one wall / an adjacent pair), the GPU
 * FIELD PROGRAM colors per pixel at arbitrary depth, live and in PNG, with
 * hues from the SHARED hashHue convention — so the CPU ball (SVG + the
 * verify overlay) matches the field exactly. Otherwise (finite exotic W_S)
 * the CPU ball colors by cosetIndex in golden-angle hues; infinite W_S
 * (> 400) is refused with a note. The walls of S draw emphasized.
 */

import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { identity } from '@/math/mat';
import { classifyPolygon, type RealizationSpec } from '@/coxeter/spec';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import { groupFromPolygon, wordId, type CoxeterGroup } from '@/group/CoxeterGroup';
import { cosetIndex } from '@/group/wordlists';
import { matrixKey } from '@/group/orbit';
import type { Camera, Scene, SceneItem, ViewSize } from '@/viz2d/render/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { toSvg } from '@/viz2d/render/svg';
import { attachInteraction, modelUnprojector } from '@/viz2d/render/interact';
import { renderPng, sceneLayer, type RasterLayer } from '@/viz2d/render/png';
import { TilingShader } from '@/viz2d/shader/TilingShader';
import { tilingLayer } from '@/viz2d/shader/layer';
import { coverageRadius, mergeFieldPaths } from '@/viz2d/shader/vector';
import { footOnWall, hashHue } from '@/viz2d/shader/uniforms';
import type { TilingStyle } from '@/viz2d/shader/types';

const WALL_COLORS = ['#c0392b', '#27ae60', '#2f6fb7', '#8e44ad', '#d68910', '#16a085'];
const LIVE_EPSILON_PX = 3;
const EXPORT_EPSILON_PX = 1.5;
const MAX_TILES = 20000;
/** A parabolic that outgrows this is treated as INFINITE (cosets undrawable). */
const PARABOLIC_CAP = 400;

/** Golden-angle pastel (fallback when no fixed anchor exists). */
const cosetColor = (i: number) => `hsl(${((i * 137.508) % 360).toFixed(1)}, 55%, 78%)`;
/** The SHARED hue convention (§5.8): CPU tiles match the GPU field exactly. */
const hueColor = (h: number) => `hsl(${(h * 360).toFixed(2)}, 55%, 78%)`;

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

interface State {
  kind: GeometryKind;
  group: CoxeterGroup<Point2, Isometry2>;
  poly: RealizedPolygon;
  model: Model<Point2>;
  r0: number;
  /** W_S, completely enumerated — or null when it hit the cap (infinite). */
  ws: Map<string, Isometry2> | null;
  /** The W_S-fixed anchor (§5.8): enables the GPU coset field + shared hues. */
  anchor: Point2 | null;
}

function realize(orders: number[], S: number[]): State {
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
  const sub = group.subgroup(S.map((i) => group.reflections[i]), PARABOLIC_CAP + 1);
  const ws = sub.size > PARABOLIC_CAP ? null : sub;
  // The W_S-fixed anchor: x₀ (trivial), the wall foot (one), the vertex (pair).
  let anchor: Point2 | null = null;
  if (S.length === 0) anchor = group.basePoint;
  else if (S.length === 1) anchor = footOnWall(group.geom, group.basePoint, group.walls[S[0]]);
  else if (S.length === 2) {
    anchor =
      poly.chamber.vertices.find((q) =>
        S.every((i) => Math.abs(poly.walls[i].side(q)) < 1e-7),
      ) ?? null;
  }
  return { kind, group, poly, model, r0: poly.inradius, ws, anchor };
}

/**
 * The coset-colored ball + the walls (S emphasized) as a Scene. With an
 * anchor, tiles take the SHARED §5.8 hue (hashHue of the anchor image) so
 * they match the GPU field pixel for pixel; otherwise the golden-angle
 * fallback via cosetIndex. `withTiles` false = walls/rim only (the GPU
 * field carries the coloring live).
 */
function cosetScene(state: State, radius: number, withTiles: boolean): { scene: Scene; nCosets: number } {
  const items: SceneItem[] = [
    { id: 'domain', kind: 'domain', style: { rim: { color: '#bbbbbb', widthPx: 1.25 } } },
  ];
  let nCosets = 0;
  if (state.ws && withTiles) {
    const tiles = state.group.tessellateBall(radius, MAX_TILES);
    const index = state.anchor ? null : cosetIndex(state.group, state.ws, tiles);
    const hues = new Set<number>();
    for (const t of tiles) {
      let color: string;
      if (state.anchor) {
        const h = hashHue(state.group.geom.apply(t.element, state.anchor));
        hues.add(Math.round(h * 65536));
        color = hueColor(h);
      } else {
        const coset = index!.get(matrixKey(t.element)) ?? 0;
        nCosets = Math.max(nCosets, coset + 1);
        color = cosetColor(coset);
      }
      items.push({
        id: `field:tile:${wordId(t.word)}`,
        kind: 'polygon',
        vertices: t.polytope.vertices,
        style: {
          fill: { color, opacity: 1 },
          edge: { color: '#9a8d75', width: 0.012 * state.r0, opacity: 0.35 },
        },
      });
    }
    if (state.anchor) nCosets = hues.size;
  }
  items.push(
    ...state.poly.walls.map((wall, i) => ({
      id: `wall:${i}`,
      kind: 'geodesic' as const,
      source: { type: 'line' as const, wall },
      style: {
        color: WALL_COLORS[i % WALL_COLORS.length],
        width: (SBoxes[i]?.checked ? 0.07 : 0.035) * state.r0,
        opacity: SBoxes[i]?.checked ? 0.95 : 0.55,
      },
    })),
  );
  return { scene: items, nCosets };
}

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'cosets / C1 — color the tiling by LEFT cosets of the parabolic W_S · pick S below · a vertex dihedral colors its flowers';
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
ordersInput.value = '2, 3, 7';
ordersInput.style.cssText =
  'width:130px;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff';
const sWrap = document.createElement('span');
sWrap.style.cssText = 'display:inline-flex;gap:6px;align-items:center;font-size:12px;color:#555';
let SBoxes: HTMLInputElement[] = [];
function rebuildSBoxes(n: number): void {
  if (SBoxes.length === n) return;
  const prev = SBoxes.map((b) => b.checked);
  sWrap.replaceChildren(document.createTextNode('S:'));
  SBoxes = Array.from({ length: n }, (_, i) => {
    const lab = document.createElement('label');
    lab.style.cssText = `display:inline-flex;gap:2px;align-items:center;color:${WALL_COLORS[i % WALL_COLORS.length]}`;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = prev[i] ?? i < 2; // default S = {0, 1}
    box.addEventListener('change', rebuild);
    lab.append(box, document.createTextNode(String(i)));
    sWrap.appendChild(lab);
    return box;
  });
}
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
const overlayWrap = document.createElement('label');
overlayWrap.style.cssText = 'font-size:12px;color:#555;display:inline-flex;gap:4px;align-items:center';
const overlayBox = document.createElement('input');
overlayBox.type = 'checkbox';
overlayWrap.append(overlayBox, document.createTextNode('CPU overlay (verify)'));
const status = document.createElement('span');
status.style.cssText = 'font-size:12px;color:#777';
controls.append(ordersInput, sWrap, overlayWrap, svgBtn, pngBtn, kSelect, pxLabel, status);
document.body.appendChild(controls);

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

let detach: (() => void) | null = null;

function rebuild(): void {
  const nums = ordersInput.value.split(/[\s,;]+/).filter(Boolean).map(Number);
  let state: State;
  try {
    if (nums.length < 3 || nums.some((m) => !Number.isInteger(m) || m < 2)) {
      throw new Error('orders: ≥ 3 integers ≥ 2, the cyclic vertex orders');
    }
    rebuildSBoxes(nums.length);
    const S = SBoxes.flatMap((b, i) => (b.checked ? [i] : []));
    state = realize(nums, S);
  } catch (err) {
    status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
    return;
  }

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
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  shader.setPolygon(state.poly);
  shader.setChart(state.model);
  currentSize = size;
  updatePxLabel();

  const scalePx =
    state.model.domain.kind === 'disk'
      ? size / 2 / (state.model.domain.radius * 1.08)
      : state.kind === 'euclidean'
        ? size / (16 * state.r0)
        : size / 2 / 3.2;
  let camera: Camera = { view: identity(3) as Isometry2, scalePx, centerPx: [size / 2, size / 2] };
  const frame: ViewSize = { widthPx: size, heightPx: size };

  // §5.8: with a W_S-fixed anchor the GPU colors cosets at ARBITRARY depth;
  // CPU tiles then serve only the SVG and the verify overlay.
  const gpuCoset = state.anchor !== null && state.ws !== null;
  const gpuStyle: TilingStyle = gpuCoset
    ? { ...fieldStyle(state.r0), coset: { anchor: state.anchor! } }
    : fieldStyle(state.r0);
  const liveRadius = coverageRadius(state.group, state.model, camera, frame, LIVE_EPSILON_PX);
  const { scene, nCosets } = cosetScene(state, liveRadius, !gpuCoset || overlayBox.checked);
  status.textContent = state.ws
    ? `${state.kind} · |W_S| = ${state.ws.size}` +
      (gpuCoset ? ' · GPU coset field (arbitrary depth)' : ` · ${nCosets} cosets in view (CPU)`)
    : `${state.kind} · W_S is infinite (> ${PARABOLIC_CAP}) — no coloring; pick a smaller S`;

  const ctx = () => ({ geom: state.group.geom, model: state.model, camera, size: frame });
  const draw = (): void => {
    shader.draw(
      { view: camera.view, scalePx: camera.scalePx * dpr, centerPx: [camera.centerPx[0] * dpr, camera.centerPx[1] * dpr] },
      gpuStyle,
    );
    g.clearRect(0, 0, size, size);
    paint(g, buildPathList(scene, ctx()), camera);
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
    a.download = `cosets-${ordersInput.value.replace(/[^0-9]+/g, '-')}.${ext}`;
    a.click();
    URL.revokeObjectURL(href);
  };
  svgBtn.onclick = () => {
    const radius = coverageRadius(state.group, state.model, camera, frame, EXPORT_EPSILON_PX);
    const paths = mergeFieldPaths(buildPathList(cosetScene(state, radius, true).scene, ctx()));
    download(
      URL.createObjectURL(new Blob([toSvg(paths, camera, frame)], { type: 'image/svg+xml' })),
      'svg',
    );
  };
  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [
      tilingLayer(state.poly, state.model, gpuStyle),
      sceneLayer(scene, state.group.geom, state.model),
    ];
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
  });
  detach = () => handle.dispose();
}

ordersInput.addEventListener('change', rebuild);
kSelect.addEventListener('change', updatePxLabel);
window.addEventListener('resize', rebuild);

rebuild();
