/**
 * uniform — §5.7 C3 + §5.8 D3: UNIFORM TILINGS by the Wythoff construction
 * (group README, "Uniform tilings"). A triangle (p,q,r) — geometry
 * inferred — and three ring toggles s0 s1 s2 pick the seed; faces are
 * colored by TYPE (which vertex dihedral built them). All rings = the
 * omnitruncation; (1,0,0) on (2,3,5) is the dodecahedron. Live + PNG use
 * the GPU regions/star FIELD PROGRAM at arbitrary depth (toggle for the
 * CPU cells); the vector SVG is the CPU construction at the adaptive
 * coverage radius, faces merged per type.
 */

import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { identity } from '@/math/mat';
import { classifyPolygon, type RealizationSpec } from '@/coxeter/spec';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import { groupFromPolygon, type CoxeterGroup } from '@/group/CoxeterGroup';
import { uniformCells } from '@/group/wythoff';
import type { Camera, Scene, SceneItem, ViewSize } from '@/viz2d/render/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { toSvg } from '@/viz2d/render/svg';
import { attachInteraction, modelUnprojector } from '@/viz2d/render/interact';
import { renderPng, sceneLayer, type RasterLayer } from '@/viz2d/render/png';
import { coverageRadius, mergeFieldPaths } from '@/viz2d/shader/vector';
import { TilingShader } from '@/viz2d/shader/TilingShader';
import { tilingLayer } from '@/viz2d/shader/layer';
import { wythoffPoint } from '@/group/wythoff';
import type { Rgba, TilingStyle } from '@/viz2d/shader/types';

/** One soft color per face type (= per vertex dihedral). */
const TYPE_COLORS = ['#f2e3c4', '#cfe0ee', '#d5e8d0'];
const rgba = (hex: string, a: number): Rgba => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
  a,
];
const OFF: Rgba = [0, 0, 0, 0];

/** §5.8 D3: the uniform tiling as a FIELD PROGRAM — regions + seed star. */
function uniformGpuStyle(state: State, rings: boolean[]): TilingStyle {
  const seed = wythoffPoint(state.poly, rings);
  return {
    even: OFF,
    odd: OFF,
    edge: OFF,
    edgeHalfWidth: 0,
    vertex: OFF,
    vertexRadius: 0,
    regions: { seed, colors: TYPE_COLORS.map((c) => rgba(c, 1)) },
    star: {
      anchor: seed,
      halfWidth: 0.01 * state.r0,
      bands: state.poly.walls.map((_, i) => ({ wall: i, color: rgba('#5a4f3f', 0.75) })),
    },
  };
}
const LIVE_EPSILON_PX = 3;
const EXPORT_EPSILON_PX = 1.5;
const MAX_TILES = 20000;

interface State {
  kind: GeometryKind;
  group: CoxeterGroup<Point2, Isometry2>;
  poly: RealizedPolygon;
  model: Model<Point2>;
  r0: number;
}

function realize(orders: [number, number, number]): State {
  const kind = classifyPolygon(orders);
  const spec: RealizationSpec = {
    geometry: kind,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: [0, 1, 2] },
    decorations: orders.map((m, k) => ({ walls: [k, (k + 1) % 3] as [number, number], order: m })),
  };
  const poly = solvePolygon(spec);
  const group = groupFromPolygon(poly);
  const model =
    kind === 'hyperbolic' ? new Poincare2() : kind === 'euclidean' ? new Cartesian2() : new Stereographic2();
  return { kind, group, poly, model, r0: poly.inradius };
}

/** The uniform tiling out to `radius` as a Scene (faces by type + rim). */
function uniformScene(state: State, rings: boolean[], radius: number): { scene: Scene; count: number } {
  const cells = uniformCells(state.group, state.poly, rings, radius, MAX_TILES);
  const items: SceneItem[] = [
    { id: 'domain', kind: 'domain', style: { rim: { color: '#bbbbbb', widthPx: 1.25 } } },
    ...cells.map((c, k) => ({
      id: `field:tile:${c.type}:${k}`,
      kind: 'polygon' as const,
      vertices: c.polytope.vertices,
      style: {
        fill: { color: TYPE_COLORS[c.type % TYPE_COLORS.length], opacity: 1 },
        edge: { color: '#5a4f3f', width: 0.02 * state.r0, opacity: 0.75 },
      },
    })),
  ];
  return { scene: items, count: cells.length };
}

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'uniform / C3 — Wythoff uniform tilings · (p,q,r) infers the geometry · rings pick the seed · faces colored by type';
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
  'width:110px;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff';
const ringBoxes = [0, 1, 2].map((i) => {
  const lab = document.createElement('label');
  lab.style.cssText = 'font-size:12px;color:#555;display:inline-flex;gap:2px;align-items:center';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = true;
  lab.append(box, document.createTextNode(`s${i}`));
  controls.appendChild(lab);
  return box;
});
const gpuWrap = document.createElement('label');
gpuWrap.style.cssText = 'font-size:12px;color:#555;display:inline-flex;gap:4px;align-items:center';
const gpuBox = document.createElement('input');
gpuBox.type = 'checkbox';
gpuBox.checked = true;
gpuWrap.append(gpuBox, document.createTextNode('GPU'));
controls.appendChild(gpuWrap);
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
const status = document.createElement('span');
status.style.cssText = 'font-size:12px;color:#777';
controls.prepend(ordersInput);
controls.append(svgBtn, pngBtn, kSelect, pxLabel, status);
document.body.appendChild(controls);

// The layer stack (§5.8): GPU field under the transparent named canvas.
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
  const rings = ringBoxes.map((b) => b.checked);
  let state: State;
  try {
    if (nums.length !== 3 || nums.some((m) => !Number.isInteger(m) || m < 2)) {
      throw new Error('orders: three integers ≥ 2');
    }
    if (!rings.some(Boolean)) throw new Error('ring at least one node');
    state = realize(nums as [number, number, number]);
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
  glCanvas.style.display = gpuBox.checked ? 'block' : 'none';
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  // §5.8 D3: the GPU draws regions + seed-star edges live at arbitrary
  // depth; the CPU cells serve the GPU-off view and the vector SVG.
  let scene: Scene;
  let gpuStyle: TilingStyle | null = null;
  try {
    if (gpuBox.checked) {
      gpuStyle = uniformGpuStyle(state, rings);
      shader.setPolygon(state.poly);
      shader.setChart(state.model);
      scene = [{ id: 'domain', kind: 'domain', style: { rim: { color: '#bbbbbb', widthPx: 1.25 } } }];
      status.textContent = `${state.kind} · GPU uniform field (arbitrary depth)`;
    } else {
      const radius = coverageRadius(state.group, state.model, camera, frame, LIVE_EPSILON_PX);
      const built = uniformScene(state, rings, radius);
      scene = built.scene;
      status.textContent = `${state.kind} · ${built.count} faces in view (CPU)`;
    }
  } catch (err) {
    status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
    return;
  }

  const ctx = () => ({ geom: state.group.geom, model: state.model, camera, size: frame });
  const draw = (): void => {
    if (gpuStyle) {
      shader.draw(
        { view: camera.view, scalePx: camera.scalePx * dpr, centerPx: [camera.centerPx[0] * dpr, camera.centerPx[1] * dpr] },
        gpuStyle,
      );
    }
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
    a.download = `uniform-${ordersInput.value.replace(/[^0-9]+/g, '-')}-${rings.map((r) => +r).join('')}.${ext}`;
    a.click();
    URL.revokeObjectURL(href);
  };
  svgBtn.onclick = () => {
    const radius = coverageRadius(state.group, state.model, camera, frame, EXPORT_EPSILON_PX);
    const paths = mergeFieldPaths(buildPathList(uniformScene(state, rings, radius).scene, ctx()));
    download(
      URL.createObjectURL(new Blob([toSvg(paths, camera, frame)], { type: 'image/svg+xml' })),
      'svg',
    );
  };
  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [];
    if (gpuStyle) layers.push(tilingLayer(state.poly, state.model, gpuStyle));
    layers.push(sceneLayer(scene, state.group.geom, state.model));
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
gpuBox.addEventListener('change', rebuild);
for (const b of ringBoxes) b.addEventListener('change', rebuild);
kSelect.addEventListener('change', updatePxLabel);
window.addEventListener('resize', rebuild);

rebuild();
