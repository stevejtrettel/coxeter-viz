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
import { identity } from '@/math/mat';
import type { RealizedPolygon } from '@/coxeter/solve';
import type { CoxeterGroup } from '@/group/CoxeterGroup';
import { cosetIndex, parabolicFixedPoint } from '@/group/wordlists';
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
import { hashHue } from '@/viz2d/shader/uniforms';
import type { TilingStyle } from '@/viz2d/shader/types';
import { realizePolygon } from '@/viz2d/kit/realize';
import { cosetColor, domainItem, fieldTileId, hueColor, tilesToScene, wallItems } from '@/viz2d/kit/scene';
import { cosetField, fieldStyle } from '@/viz2d/kit/field';
import { GREY, WALL_COLORS } from '@/viz2d/kit/palette';
import {
  PAD, button, checkbox, downloadBlob, downloadSvg, dpr, exportSizeLabel,
  kSelect as buildKSelect, layerStack, pageShell, rafScheduler, sizeStack, statusText, textInput,
} from '../shared';

const LIVE_EPSILON_PX = 3;
const EXPORT_EPSILON_PX = 1.5;
const MAX_TILES = 20000;
/** A parabolic that outgrows this is treated as INFINITE (cosets undrawable). */
const PARABOLIC_CAP = 400;

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
  const { kind, group, poly, model, r0 } = realizePolygon(orders); // geometry INFERRED
  const sub = group.subgroup(S.map((i) => group.reflections[i]), PARABOLIC_CAP + 1);
  const ws = sub.size > PARABOLIC_CAP ? null : sub;
  // The W_S-fixed anchor (§5.8): x₀ (trivial), the wall foot (one), the
  // vertex (pair), or null (no fixed point) — enables the GPU coset field.
  const anchor = parabolicFixedPoint(group, S);
  return { kind, group, poly, model, r0, ws, anchor };
}

/**
 * The coset-colored ball + the walls (S emphasized) as a Scene. With an
 * anchor, tiles take the SHARED §5.8 hue (hashHue of the anchor image) so
 * they match the GPU field pixel for pixel; otherwise the golden-angle
 * fallback via cosetIndex. `withTiles` false = walls/rim only (the GPU
 * field carries the coloring live).
 */
function cosetScene(state: State, radius: number, withTiles: boolean): { scene: Scene; nCosets: number } {
  let nCosets = 0;
  let tileItems: SceneItem[] = [];
  if (state.ws && withTiles) {
    const tiles = state.group.tessellateBall(radius, MAX_TILES);
    const index = state.anchor ? null : cosetIndex(state.group, state.ws, tiles);
    const hues = new Set<number>();
    tileItems = tilesToScene(
      tiles,
      (t) => {
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
        return { fill: { color, opacity: 1 }, edge: { color: GREY.ambientEdge, width: 0.012 * state.r0, opacity: 0.35 } };
      },
      fieldTileId,
    );
    if (state.anchor) nCosets = hues.size;
  }
  const scene: Scene = [
    domainItem(false),
    ...tileItems,
    ...wallItems(state.poly.walls, (i) => ({
      color: WALL_COLORS[i % WALL_COLORS.length],
      width: (SBoxes[i]?.checked ? 0.07 : 0.035) * state.r0,
      opacity: SBoxes[i]?.checked ? 0.95 : 0.55,
    })),
  ];
  return { scene, nCosets };
}

// ── Page ────────────────────────────────────────────────────────────────────

const heading = pageShell(
  'cosets / C1 — color the tiling by LEFT cosets of the parabolic W_S · pick S below · a vertex dihedral colors its flowers',
);

const controls = document.createElement('div');
controls.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
const ordersInput = textInput('2, 3, 7', 130);
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
const svgBtn = button('SVG');
const pngBtn = button('PNG');
const kSelect = buildKSelect();
const pxLabel = document.createElement('span');
pxLabel.style.cssText = 'font-size:11px;color:#999';
const { label: overlayWrap, input: overlayBox } = checkbox('CPU overlay (verify)', false);
const status = statusText();
controls.append(ordersInput, sWrap, overlayWrap, svgBtn, pngBtn, kSelect, pxLabel, status);
document.body.appendChild(controls);

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
  const d = dpr();
  const g = sizeStack({ stack, glCanvas, canvas }, size, d, true);
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
    ? cosetField(fieldStyle(state.r0), state.anchor!)
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
      { view: camera.view, scalePx: camera.scalePx * d, centerPx: [camera.centerPx[0] * d, camera.centerPx[1] * d] },
      gpuStyle,
    );
    g.clearRect(0, 0, size, size);
    paint(g, buildPathList(scene, ctx()), camera);
  };
  const schedule = rafScheduler(draw);
  draw();

  const stem = () => `cosets-${ordersInput.value.replace(/[^0-9]+/g, '-')}`;
  svgBtn.onclick = () => {
    const radius = coverageRadius(state.group, state.model, camera, frame, EXPORT_EPSILON_PX);
    const paths = mergeFieldPaths(buildPathList(cosetScene(state, radius, true).scene, ctx()));
    downloadSvg(toSvg(paths, camera, frame), `${stem()}.svg`);
  };
  pngBtn.onclick = () => {
    const k = Number(kSelect.value);
    const layers: RasterLayer[] = [
      tilingLayer(state.poly, state.model, gpuStyle),
      sceneLayer(scene, state.group.geom, state.model),
    ];
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
kSelect.addEventListener('change', updatePxLabel);
window.addEventListener('resize', rebuild);

rebuild();
