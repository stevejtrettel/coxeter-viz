/**
 * group — the Milestone-1 demo (PLAN.md §5.4, G4): the (2,3,7) hyperbolic,
 * (2,4,4) Euclidean and (2,3,5) spherical tessellations with their Cayley
 * graphs overlaid, drawn through two models per geometry — Klein + Poincaré,
 * Cartesian at two scales (straight = conformal), stereographic + the
 * perspective globe. Scene conversion from the group layer's own structures
 * lives HERE, downstream of src/group (promotable to an adapter module if
 * demos repeat themselves).
 */

import type { Geometry, GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Klein2 } from '@/models/klein';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { mat3 } from '@/math/mat';
import type { CoxeterGroup, Tile } from '@/group/CoxeterGroup';
import type { CayleyGraph } from '@/group/cayley';
import type { Camera, ItemId, PathList, Scene, StyleOverrides } from '@/viz2d/render/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { toSvg } from '@/viz2d/render/svg';
import { attachInteraction, hitTest, modelUnprojector, type ScreenUnprojector } from '@/viz2d/render/interact';
import { SpherePerspective, sphereUnprojector } from '@/viz2d/sphere/projection';
import { sphereHitTest } from '@/viz2d/sphere/interact';
import { buildSpherePathList } from '@/viz2d/sphere/scene';
import type { SphereCamera } from '@/viz2d/sphere/types';
import { realizePolygon } from '@/viz2d/kit/realize';
import { cayleyScene, domainItem, parityColor, tilesToScene } from '@/viz2d/kit/scene';
import { fitToPoints, tippedView } from '@/viz2d/kit/camera';
import { GEN_COLORS, GREY, TILE } from '@/viz2d/kit/palette';

const EYE_DISTANCE = 5;

/** A generated group: the tessellation and Cayley graph out to maxWord. */
interface GroupData {
  group: CoxeterGroup<Point2, Isometry2>;
  tiles: Tile<Point2, Isometry2>[];
  graph: CayleyGraph<Isometry2>;
  /** The chamber inradius — the intrinsic unit for all demo styling. */
  r0: number;
}

function generate(geometry: GeometryKind, orders: [number, number, number], maxWord: number): GroupData {
  const rg = realizePolygon(orders, { geometry });
  return {
    group: rg.group,
    tiles: rg.group.tessellate(maxWord, 20000),
    graph: rg.group.cayleyGraph(maxWord, 20000),
    r0: rg.r0,
  };
}

/**
 * The group layer's structures as scene items (kit builders): tiles filled by
 * word parity (identity emphasized), Cayley nodes at g·basePoint, edges
 * colored by their generator, over the shaded domain. Ids and the intrinsic
 * style ratios live in kit; the far tile needs no special casing (render V2.3
 * fill honesty drops a fill that wraps the chart's puncture).
 */
function groupScene(data: GroupData): Scene {
  const { group, tiles, graph, r0 } = data;
  return [
    domainItem(true),
    ...tilesToScene(tiles, (t) => ({
      fill: { color: parityColor(t.word, TILE), opacity: 0.9 },
      edge: { color: GREY.tileEdge, width: 0.025 * r0, opacity: 0.5 },
    })),
    ...cayleyScene(group, graph, {
      edge: (gen) => ({ color: GEN_COLORS[gen], width: 0.06 * r0, opacity: 0.85 }),
      node: () => ({ color: '#1a1a1a', radius: 0.11 * r0 }),
    }),
  ];
}

// ── The three Milestone-1 groups ────────────────────────────────────────────

const h237 = generate('hyperbolic', [2, 3, 7], 16);
const e244 = generate('euclidean', [2, 4, 4], 12);
const s235 = generate('spherical', [2, 3, 5], 20); // exhausts: all 120 elements

// Tip the sphere off-axis: a generic view direction for the globe and the
// stereographic chart alike.
const sphereTip = tippedView(0.55, 0.35);

const sceneH = groupScene(h237);
const sceneE = groupScene(e244);
const sceneS = groupScene(s235);

/** Fit: pixels per render unit so every Cayley node lands inside the frame. */
function fitToNodes(data: GroupData, model: Model<Point2>, view: Isometry2, sizePx: number, margin: number): number {
  const pts = data.graph.nodes.map((n) => data.group.geom.apply(n.element, data.group.basePoint));
  return fitToPoints(data.group.geom, model, pts, sizePx, { view, margin });
}

// ── Panels ──────────────────────────────────────────────────────────────────

/**
 * A panel builds one path list per (camera, size); the Canvas painter and the
 * SVG exporter both consume it, so the downloaded figure IS the screen —
 * including whatever view you dragged yourself into (V3.3). `interact`
 * marks a panel live; the globe stays static (V3 ruling: sphereview has no
 * unproject yet — §6).
 */
interface Panel {
  title: string;
  initialCamera(sizePx: number): Camera;
  paths(camera: Camera, sizePx: number, overrides?: StyleOverrides): PathList;
  interact?: { geom: Geometry<Point2, Isometry2>; unproject: ScreenUnprojector };
  /** V3.4: the id under a pointer (hover), via the mathematical hitTest. */
  hit?(camera: Camera, sizePx: number, px: readonly [number, number]): ItemId | null;
}

function flatPanel(title: string, scene: Scene, data: GroupData, model: Model<Point2>, makeCamera: (sizePx: number) => Camera): Panel {
  const geom = data.group.geom;
  const ctx = (camera: Camera, sizePx: number, overrides?: StyleOverrides) => ({
    geom,
    model,
    camera,
    size: { widthPx: sizePx, heightPx: sizePx },
    overrides,
  });
  return {
    title,
    initialCamera: makeCamera,
    paths: (camera, sizePx, overrides) => buildPathList(scene, ctx(camera, sizePx, overrides)),
    interact: { geom, unproject: modelUnprojector(model) },
    hit: (camera, sizePx, px) => hitTest(scene, ctx(camera, sizePx), px),
  };
}

function downloadSvg(panel: Panel, camera: Camera, sizePx: number): void {
  const svg = toSvg(panel.paths(camera, sizePx), camera, { widthPx: sizePx, heightPx: sizePx });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = `${panel.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const identityView: Isometry2 = mat3([
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]);

const klein = new Klein2();
const poincare = new Poincare2();
const cartesian = new Cartesian2();
const stereographic = new Stereographic2();

const panels: Panel[] = [
  flatPanel('(2,3,7) H² — Klein (straight)', sceneH, h237, klein, (s) => ({
    view: identityView,
    scalePx: s / 2 / 1.08,
    centerPx: [s / 2, s / 2],
  })),
  flatPanel('(2,4,4) E² — Cartesian, fit (straight = conformal)', sceneE, e244, cartesian, (s) => ({
    view: identityView,
    scalePx: fitToNodes(e244, cartesian, identityView, s, 1.1),
    centerPx: [s / 2, s / 2],
  })),
  flatPanel('(2,3,5) S² — stereographic (conformal)', sceneS, s235, stereographic, (s) => ({
    view: sphereTip,
    scalePx: s / 2 / 3.2,
    centerPx: [s / 2, s / 2],
  })),
  flatPanel('(2,3,7) H² — Poincaré (conformal)', sceneH, h237, poincare, (s) => ({
    view: identityView,
    scalePx: s / 2 / 1.08,
    centerPx: [s / 2, s / 2],
  })),
  flatPanel('(2,4,4) E² — Cartesian, detail', sceneE, e244, cartesian, (s) => ({
    view: identityView,
    scalePx: fitToNodes(e244, cartesian, identityView, s, 0.45),
    centerPx: [s / 2, s / 2],
  })),
  {
    title: `(2,3,5) S² — perspective globe, d = ${EYE_DISTANCE}`,
    initialCamera(sizePx) {
      const silhouette = EYE_DISTANCE / Math.sqrt(EYE_DISTANCE * EYE_DISTANCE - 1);
      const camera: SphereCamera = {
        view: sphereTip,
        scalePx: sizePx / 2 / (silhouette * 1.12),
        centerPx: [sizePx / 2, sizePx / 2],
        eyeDistance: EYE_DISTANCE,
      };
      return camera;
    },
    paths: (camera, sizePx, overrides) =>
      buildSpherePathList(sceneS, {
        camera: camera as SphereCamera,
        size: { widthPx: sizePx, heightPx: sizePx },
        overrides,
        // P3: hidden-line convention — back arcs dash (intrinsic pattern).
        backDash: { on: 0.5 * s235.r0, off: 0.35 * s235.r0 },
      }),
    // Globe rotation (sphereview stage 2a): drag the front sheet; the same
    // double-bisector machinery — an S² translation IS a rotation.
    interact: { geom: s235.group.geom, unproject: sphereUnprojector(new SpherePerspective(EYE_DISTANCE)) },
    // P3: front-sheet hover.
    hit: (camera, _sizePx, px) => sphereHitTest(sceneS, camera as SphereCamera, px),
  },
];

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
const GAP = 16;
const TITLE_H = 24;

document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'group G4 / Milestone 1 — tessellations and Cayley graphs in S, E, H · drag to slide, shift-drag to pan, wheel to zoom';
heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 12px';
document.body.appendChild(heading);

// The view isometry each panel has been dragged into — survives resize
// (the affine part is re-derived from the new panel size).
const savedViews: (Isometry2 | null)[] = panels.map(() => null);

const grid = document.createElement('div');
document.body.appendChild(grid);

/** Panel size: the 3 × 2 grid fits BOTH viewport dimensions. */
function panelSize(): number {
  const headingH = heading.offsetHeight + 12;
  const wFit = Math.floor((window.innerWidth - 2 * PAD - 2 * GAP) / 3);
  const hFit = Math.floor((window.innerHeight - 2 * PAD - headingH - GAP - 2 * TITLE_H) / 2);
  return Math.max(220, Math.min(460, wFit, hFit));
}

function renderAll(): void {
  const size = panelSize();
  grid.style.cssText = `display:grid;grid-template-columns:repeat(3,${size}px);gap:${GAP}px`;
  grid.replaceChildren();
  const dpr = window.devicePixelRatio || 1;

  panels.forEach((panel, i) => {
    const cell = document.createElement('div');
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;align-items:baseline;gap:8px;height:${TITLE_H - 6}px;margin-bottom:6px`;
    const title = document.createElement('div');
    title.textContent = panel.title;
    title.style.cssText = 'font-size:12px;color:#555;white-space:nowrap;overflow:hidden;flex:1';
    const save = document.createElement('button');
    save.textContent = 'SVG';
    save.title = 'Download this panel as SVG — identical to the canvas, current view included';
    save.style.cssText =
      'font-size:10px;padding:1px 7px;color:#666;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer';
    bar.append(title, save);
    const canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.cssText = `width:${size}px;height:${size}px;background:#fff;border-radius:4px`;
    cell.append(bar, canvas);
    grid.appendChild(cell);

    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    let camera = panel.initialCamera(size);
    const saved = savedViews[i];
    if (saved) camera = { ...camera, view: saved };

    // V3.4: hover highlight — a per-frame style override, never a scene
    // mutation. Tiles only; the SVG export deliberately omits it (transient
    // UI state, not the figure).
    let hovered: ItemId | null = null;
    const draw = (): void => {
      const overrides = hovered
        ? new Map([[hovered, { fill: { color: '#ffb454', opacity: 0.95 } }]])
        : undefined;
      g.clearRect(0, 0, size, size);
      paint(g, panel.paths(camera, size, overrides), camera);
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
    save.addEventListener('click', () => downloadSvg(panel, camera, size));
    if (panel.interact) {
      attachInteraction(canvas, {
        geom: panel.interact.geom,
        unproject: panel.interact.unproject,
        camera,
        onCamera: (c) => {
          camera = c;
          savedViews[i] = c.view;
          schedule();
        },
        onPointer: (px) => {
          const id = px && panel.hit ? panel.hit(camera, size, px) : null;
          const tile = id?.startsWith('tile:') ? id : null;
          if (tile !== hovered) {
            hovered = tile;
            schedule();
          }
        },
      });
    }
  });
}

renderAll();
window.addEventListener('resize', renderAll);
