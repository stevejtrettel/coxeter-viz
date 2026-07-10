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
import { identity } from '@/math/mat';
import type { RealizedPolygon } from '@/coxeter/solve';
import type { CoxeterGroup } from '@/group/CoxeterGroup';
import { uniformCells, wythoffPoint } from '@/group/wythoff';
import type { Camera, Scene, ViewSize } from '@/viz2d/render/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { toSvg } from '@/viz2d/render/svg';
import { attachInteraction, modelUnprojector } from '@/viz2d/render/interact';
import { renderPng, sceneLayer, type RasterLayer } from '@/viz2d/render/png';
import { coverageRadius, mergeFieldPaths } from '@/viz2d/shader/vector';
import { TilingShader } from '@/viz2d/shader/TilingShader';
import { tilingLayer } from '@/viz2d/shader/layer';
import type { TilingStyle } from '@/viz2d/shader/types';
import { realizePolygon } from '@/viz2d/kit/realize';
import { domainItem, polygonItem } from '@/viz2d/kit/scene';
import { blankStyle, regionsField, rgba, starBands, starField } from '@/viz2d/kit/field';
import { TYPE_COLORS } from '@/viz2d/kit/palette';
import {
  PAD, button, checkbox, downloadBlob, downloadSvg, dpr, exportSizeLabel,
  kSelect as buildKSelect, layerStack, pageShell, rafScheduler, sizeStack, statusText, textInput,
} from '../shared';

/** §5.8 D3: the uniform tiling as a FIELD PROGRAM — regions + seed star. */
function uniformGpuStyle(state: State, rings: boolean[]): TilingStyle {
  const seed = wythoffPoint(state.poly, rings);
  return regionsField(
    starField(blankStyle(), {
      anchor: seed,
      halfWidth: 0.01 * state.r0,
      bands: starBands(state.poly.walls, () => rgba('#5a4f3f', 0.75)),
    }),
    seed,
    TYPE_COLORS.map((c) => rgba(c, 1)),
  );
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
  const { kind, group, poly, model, r0 } = realizePolygon(orders); // geometry INFERRED
  return { kind, group, poly, model, r0 };
}

/** The uniform tiling out to `radius` as a Scene (faces by type + rim). */
function uniformScene(state: State, rings: boolean[], radius: number): { scene: Scene; count: number } {
  const cells = uniformCells(state.group, state.poly, rings, radius, MAX_TILES);
  const scene: Scene = [
    domainItem(false),
    ...cells.map((c, k) =>
      polygonItem(
        c.polytope,
        {
          fill: { color: TYPE_COLORS[c.type % TYPE_COLORS.length], opacity: 1 },
          edge: { color: '#5a4f3f', width: 0.02 * state.r0, opacity: 0.75 },
        },
        `field:tile:${c.type}:${k}`,
      ),
    ),
  ];
  return { scene, count: cells.length };
}

// ── Page ────────────────────────────────────────────────────────────────────

const heading = pageShell(
  'uniform / C3 — Wythoff uniform tilings · (p,q,r) infers the geometry · rings pick the seed · faces colored by type',
);

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
const ordersInput = textInput('2, 3, 7', 110);
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
const { label: gpuWrap, input: gpuBox } = checkbox('GPU', true);
controls.appendChild(gpuWrap);
const svgBtn = button('SVG');
const pngBtn = button('PNG');
const kSelect = buildKSelect();
const pxLabel = document.createElement('span');
pxLabel.style.cssText = 'font-size:11px;color:#999';
const status = statusText();
controls.prepend(ordersInput);
controls.append(svgBtn, pngBtn, kSelect, pxLabel, status);
document.body.appendChild(controls);

// The layer stack (§5.8): GPU field under the transparent named canvas.
const { stack, glCanvas, canvas } = layerStack();
document.body.appendChild(stack);
const shader = new TilingShader(glCanvas);

let currentSize = 0;
function updatePxLabel(): void {
  pxLabel.textContent = exportSizeLabel(currentSize, Number(kSelect.value));
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
  const d = dpr();
  const g = sizeStack({ stack, glCanvas, canvas }, size, d, gpuBox.checked);
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
        { view: camera.view, scalePx: camera.scalePx * d, centerPx: [camera.centerPx[0] * d, camera.centerPx[1] * d] },
        gpuStyle,
      );
    }
    g.clearRect(0, 0, size, size);
    paint(g, buildPathList(scene, ctx()), camera);
  };
  const schedule = rafScheduler(draw);
  draw();

  const stem = () => `uniform-${ordersInput.value.replace(/[^0-9]+/g, '-')}-${rings.map((r) => +r).join('')}`;
  svgBtn.onclick = () => {
    const radius = coverageRadius(state.group, state.model, camera, frame, EXPORT_EPSILON_PX);
    const paths = mergeFieldPaths(buildPathList(uniformScene(state, rings, radius).scene, ctx()));
    downloadSvg(toSvg(paths, camera, frame), `${stem()}.svg`);
  };
  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [];
    if (gpuStyle) layers.push(tilingLayer(state.poly, state.model, gpuStyle));
    layers.push(sceneLayer(scene, state.group.geom, state.model));
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
  });
  detach = () => handle.dispose();
}

ordersInput.addEventListener('change', rebuild);
gpuBox.addEventListener('change', rebuild);
for (const b of ringBoxes) b.addEventListener('change', rebuild);
kSelect.addEventListener('change', updatePxLabel);
window.addEventListener('resize', rebuild);

rebuild();
