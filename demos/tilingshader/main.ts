/**
 * tilingshader — T2 (PLAN §5.6): the standalone GPU tiling field. Orders
 * (p,q,r) with the geometry INFERRED (classifyPolygon), every flat 2D chart,
 * tiles/edges/vertices as shader layers with live style controls, and the
 * SUCCESS CRITERION as an instrument: a render2d overlay of the same
 * tessellation through the SAME camera — its strokes must sit exactly on the
 * shader's edge bands in every geometry × chart cell, under drag/pan/zoom.
 * One camera, two painters, one picture.
 */

import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Klein2 } from '@/models/klein';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { Gnomonic2 } from '@/models/gnomonic';
import { identity } from '@/math/mat';
import { classifyPolygon, type RealizationSpec } from '@/coxeter/spec';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import { groupFromPolygon, wordId } from '@/group/CoxeterGroup';
import type { Camera, Scene } from '@/viz2d/render/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { attachInteraction, modelUnprojector } from '@/viz2d/render/interact';
import { renderPng, sceneLayer, type RasterLayer } from '@/viz2d/render/png';
import { TilingShader } from '@/viz2d/shader/TilingShader';
import { tilingLayer } from '@/viz2d/shader/layer';
import type { TilingStyle } from '@/viz2d/shader/types';

// The reference shader's palette, kept: blue tiles, cream edges, ember vertices.
const EVEN: [number, number, number, number] = [0.55, 0.7, 0.85, 1];
const ODD: [number, number, number, number] = [0.2, 0.3, 0.45, 1];
const EDGE: [number, number, number, number] = [0.92, 0.88, 0.82, 1];
const VERTEX: [number, number, number, number] = [0.9, 0.35, 0.25, 1];
const OFF: [number, number, number, number] = [0, 0, 0, 0];
/** The overlay stroke: magenta so any misregistration fringes visibly. */
const OVERLAY_COLOR = '#d81b60';

const CHARTS: Record<GeometryKind, Model<Point2>[]> = {
  hyperbolic: [new Poincare2(), new Klein2()],
  euclidean: [new Cartesian2()],
  spherical: [new Stereographic2(), new Gnomonic2()],
};
const OVERLAY_DEPTH: Record<GeometryKind, number> = { hyperbolic: 10, euclidean: 12, spherical: 20 };

interface State {
  kind: GeometryKind;
  poly: RealizedPolygon;
  /** The render2d verify-overlay: the same tessellation, edges only. */
  overlay: Scene;
  r0: number;
}

function realize(orders: [number, number, number]): State {
  const kind = classifyPolygon(orders);
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
  const poly = solvePolygon(spec);
  const r0 = poly.inradius;
  const overlay: Scene = groupFromPolygon(poly)
    .tessellate(OVERLAY_DEPTH[kind], 20000)
    .map((t) => ({
      id: `tile:${wordId(t.word)}`,
      kind: 'polygon' as const,
      vertices: t.polytope.vertices,
      style: { edge: { color: OVERLAY_COLOR, width: 0.05 * r0, opacity: 0.55 } },
    }));
  return { kind, poly, overlay, r0 };
}

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'tilingshader / T2 — the GPU tiling field · orders (p,q,r) infer the geometry · overlay = the CPU painter on the same camera';
heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 8px';
document.body.appendChild(heading);

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
const ordersInput = document.createElement('input');
ordersInput.value = '2, 3, 7';
ordersInput.style.cssText =
  'width:90px;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff';
const chartSelect = document.createElement('select');
chartSelect.style.cssText = 'font-size:12px;padding:4px;border:1px solid #ccc;border-radius:4px;background:#fff';
const toggle = (label: string, checked: boolean): HTMLInputElement => {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'font-size:12px;color:#555;display:inline-flex;gap:4px;align-items:center';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  wrap.append(box, document.createTextNode(label));
  controls.appendChild(wrap);
  return box;
};
const slider = (label: string, value: number): HTMLInputElement => {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'font-size:12px;color:#555;display:inline-flex;gap:4px;align-items:center';
  const s = document.createElement('input');
  s.type = 'range';
  s.min = '0';
  s.max = '100';
  s.value = String(value);
  s.style.width = '80px';
  wrap.append(document.createTextNode(label), s);
  controls.appendChild(wrap);
  return s;
};
controls.append(ordersInput, chartSelect);
const edgesBox = toggle('edges', true);
const edgeSlider = slider('width', 25);
const vertsBox = toggle('vertices', true);
const vertSlider = slider('radius', 30);
const overlayBox = toggle('CPU overlay (verify)', false);
const pngBtn = document.createElement('button');
pngBtn.textContent = 'PNG';
pngBtn.style.cssText =
  'font-size:11px;padding:2px 9px;color:#666;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer';
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
controls.append(pngBtn, kSelect, pxLabel);
const status = document.createElement('span');
status.style.cssText = 'font-size:12px;color:#777';
controls.appendChild(status);
document.body.appendChild(controls);

// The layer stack: WebGL field below, transparent Canvas2D overlay on top;
// interaction listens on the top canvas (PLAN §5.6, "layer stack").
const stack = document.createElement('div');
stack.style.cssText = 'position:relative';
const glCanvas = document.createElement('canvas');
const overlayCanvas = document.createElement('canvas');
glCanvas.style.cssText = 'position:absolute;inset:0;background:#fff;border-radius:4px';
overlayCanvas.style.cssText = 'position:absolute;inset:0';
stack.append(glCanvas, overlayCanvas);
document.body.appendChild(stack);

const shader = new TilingShader(glCanvas);

function tilingStyle(r0: number): TilingStyle {
  return {
    even: EVEN,
    odd: ODD,
    edge: edgesBox.checked ? EDGE : OFF,
    edgeHalfWidth: (Number(edgeSlider.value) / 100) * 0.1 * r0,
    vertex: vertsBox.checked ? VERTEX : OFF,
    vertexRadius: (Number(vertSlider.value) / 100) * 0.3 * r0,
  };
}

/** Starting scale per chart: disks frame the domain, planes a sensible patch. */
function frameScale(model: Model<Point2>, kind: GeometryKind, r0: number, size: number): number {
  if (model.domain.kind === 'disk') return size / 2 / (model.domain.radius * 1.08);
  if (kind === 'euclidean') return size / (16 * r0);
  return size / 2 / (model.name === 'gnomonic' ? 2.5 : 3.2);
}

let detach: (() => void) | null = null;
let currentSize = 0;

/** The k-selector's honest price tag: exact export dimensions + megapixels. */
function updatePxLabel(): void {
  const d = Math.round(currentSize * Number(kSelect.value));
  pxLabel.textContent = currentSize
    ? `${d} × ${d} px (${((d * d) / 1e6).toFixed(1)} MP)`
    : '';
}

function rebuild(): void {
  const nums = ordersInput.value.split(/[\s,;]+/).filter(Boolean).map(Number);
  let state: State;
  try {
    if (nums.length !== 3 || nums.some((n) => !Number.isInteger(n) || n < 2)) {
      throw new Error('orders must be three integers ≥ 2');
    }
    state = realize(nums as [number, number, number]);
  } catch (err) {
    status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
    return;
  }

  // The chart menu follows the geometry; keep the pick when it survives.
  const charts = CHARTS[state.kind];
  const prev = chartSelect.value;
  chartSelect.replaceChildren(
    ...charts.map((m) => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      return opt;
    }),
  );
  const model = charts.find((m) => m.name === prev) ?? charts[0];
  chartSelect.value = model.name;

  shader.setPolygon(state.poly);
  shader.setChart(model);
  status.textContent =
    `${state.kind} · inradius ${state.r0.toPrecision(4)} · overlay ${state.overlay.length} tiles`;

  const headH = heading.offsetHeight + controls.offsetHeight + 24;
  const size = Math.max(
    260,
    Math.min(760, window.innerWidth - 2 * PAD, window.innerHeight - 2 * PAD - headH),
  );
  const dpr = window.devicePixelRatio || 1;
  for (const c of [glCanvas, overlayCanvas]) {
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
  }
  stack.style.width = `${size}px`;
  stack.style.height = `${size}px`;
  const g = overlayCanvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // One camera, CSS px (the house convention); the GPU gets it in backing px.
  let camera: Camera = {
    view: identity(3) as Isometry2,
    scalePx: frameScale(model, state.kind, state.r0, size),
    centerPx: [size / 2, size / 2],
  };

  const draw = (): void => {
    shader.draw(
      { view: camera.view, scalePx: camera.scalePx * dpr, centerPx: [camera.centerPx[0] * dpr, camera.centerPx[1] * dpr] },
      tilingStyle(state.r0),
    );
    g.clearRect(0, 0, size, size);
    if (overlayBox.checked) {
      const paths = buildPathList(state.overlay, {
        geom: state.poly.geom,
        model,
        camera,
        size: { widthPx: size, heightPx: size },
      });
      paint(g, paths, camera);
    }
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
  redraw = schedule;
  currentSize = size;
  updatePxLabel();

  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [tilingLayer(state.poly, model, tilingStyle(state.r0))];
    if (overlayBox.checked) layers.push(sceneLayer(state.overlay, state.poly.geom, model));
    void renderPng(layers, camera, { widthPx: size, heightPx: size }, k)
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `tiling-${ordersInput.value.replace(/[^0-9]+/g, '-')}-${model.name}-${k}x.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err: unknown) => {
        status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
      });
  };

  detach?.();
  const handle = attachInteraction(overlayCanvas, {
    geom: state.poly.geom,
    unproject: modelUnprojector(model),
    camera,
    onCamera: (c) => {
      camera = c;
      schedule();
    },
  });
  detach = () => handle.dispose();
}

/** Style-only changes repaint through the live closure; structure rebuilds. */
let redraw: () => void = () => {};

ordersInput.addEventListener('change', rebuild);
chartSelect.addEventListener('change', rebuild);
window.addEventListener('resize', rebuild);
kSelect.addEventListener('change', updatePxLabel);
for (const el of [edgesBox, vertsBox, overlayBox]) el.addEventListener('change', () => redraw());
for (const el of [edgeSlider, vertSlider]) el.addEventListener('input', () => redraw());

rebuild();
