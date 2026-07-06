/**
 * render2d — the V1 success-criterion demo (PLAN.md §5.3.1): the solved
 * (2,3,7) hyperbolic, (2,4,4) Euclidean and (2,3,5) spherical chambers, each
 * drawn with its walls, incircle, incenter and vertices through its straight
 * AND conformal chart. Static camera; all styling intrinsic. The light
 * domain circle on disk charts is demo chrome, not render-layer output.
 */

import type { GeometryKind, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Klein2 } from '@/models/klein';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Gnomonic2 } from '@/models/gnomonic';
import { Stereographic2 } from '@/models/stereographic';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import type { RealizationSpec } from '@/coxeter/spec';
import type { Camera, Scene } from '@/render2d/types';
import { buildPathList } from '@/render2d/scene';
import { paint } from '@/render2d/canvas';

const WALL_COLORS = ['#c0392b', '#27ae60', '#2f6fb7'];

function triangleSpec(geometry: GeometryKind, orders: [number, number, number]): RealizationSpec {
  return {
    geometry,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: [0, 1, 2] },
    decorations: [
      { walls: [0, 1], order: orders[0] },
      { walls: [1, 2], order: orders[1] },
      { walls: [2, 0], order: orders[2] },
    ],
  };
}

/** The chamber scene: domain, polygon, walls (id = generator index), incircle, points. */
function chamberScene(realized: RealizedPolygon): Scene {
  const r0 = realized.inradius;
  const origin = realized.geom.origin();
  return [
    {
      // The geometry itself (V2.2): shaded domain, rimmed disk boundary.
      id: 'domain',
      kind: 'domain',
      style: { fill: { color: '#fbf9f3' }, rim: { color: '#bbbbbb', widthPx: 1.25 } },
    },
    {
      id: 'chamber',
      kind: 'polygon',
      vertices: realized.chamber.vertices,
      style: { fill: { color: '#f6d9a0', opacity: 0.8 } },
    },
    {
      id: 'incircle',
      kind: 'circle',
      center: origin,
      radius: r0,
      style: {
        fill: { color: '#2d9cdb', opacity: 0.15 },
        edge: { color: '#2d9cdb', width: 0.07 * r0 },
      },
    },
    ...realized.walls.map((wall, i) => ({
      id: `wall:${i}`,
      kind: 'geodesic' as const,
      source: { type: 'line' as const, wall },
      style: { color: WALL_COLORS[i], width: 0.12 * r0 },
    })),
    {
      id: 'incenter',
      kind: 'point' as const,
      at: origin,
      style: { color: '#1a1a1a', radius: 0.12 * r0 },
    },
    ...realized.chamber.vertices.map((v, i) => ({
      id: `vertex:${i}`,
      kind: 'point' as const,
      at: v,
      style: { color: '#1a1a1a', radius: 0.1 * r0 },
    })),
  ];
}

/**
 * A static camera per panel: disk charts show their whole domain (the
 * classic picture); plane charts fit the chamber with room for the walls
 * to sweep past.
 */
function panelCamera(realized: RealizedPolygon, model: Model<Point2>, sizePx: number): Camera {
  let scalePx: number;
  if (model.domain.kind === 'disk') {
    scalePx = sizePx / 2 / (model.domain.radius * 1.08);
  } else {
    let extent = 0;
    for (const v of realized.chamber.vertices) {
      const u = model.project(v);
      extent = Math.max(extent, Math.hypot(u[0], u[1]));
    }
    scalePx = sizePx / 2 / (extent * 2.2);
  }
  return { view: realized.geom.identity(), scalePx, centerPx: [sizePx / 2, sizePx / 2] };
}

interface Panel {
  title: string;
  realized: RealizedPolygon;
  model: Model<Point2>;
}

const h237 = solvePolygon(triangleSpec('hyperbolic', [2, 3, 7]));
const e244 = solvePolygon(triangleSpec('euclidean', [2, 4, 4]));
const s235 = solvePolygon(triangleSpec('spherical', [2, 3, 5]));

const panels: Panel[] = [
  { title: '(2,3,7) H² — Klein (straight)', realized: h237, model: new Klein2() },
  { title: '(2,4,4) E² — Cartesian (straight = conformal)', realized: e244, model: new Cartesian2() },
  { title: '(2,3,5) S² — gnomonic (straight)', realized: s235, model: new Gnomonic2() },
  { title: '(2,3,7) H² — Poincaré (conformal)', realized: h237, model: new Poincare2() },
  { title: '(2,4,4) E² — Cartesian (straight = conformal)', realized: e244, model: new Cartesian2() },
  { title: '(2,3,5) S² — stereographic (conformal)', realized: s235, model: new Stereographic2() },
];

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
const GAP = 16;
const TITLE_H = 24;

document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent = 'render2d V1 — chambers, walls, incircles through straight and conformal charts';
heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 12px';
document.body.appendChild(heading);

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

  for (const panel of panels) {
    const cell = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = panel.title;
    title.style.cssText = `font-size:12px;height:${TITLE_H - 6}px;margin-bottom:6px;color:#555;white-space:nowrap;overflow:hidden`;
    const canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.cssText = `width:${size}px;height:${size}px;background:#fff;border-radius:4px`;
    cell.append(title, canvas);
    grid.appendChild(cell);

    const g = canvas.getContext('2d');
    if (!g) continue;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const camera = panelCamera(panel.realized, panel.model, size);
    const scene = chamberScene(panel.realized);
    const ctx = { geom: panel.realized.geom, model: panel.model, camera, size: { widthPx: size, heightPx: size } };
    paint(g, buildPathList(scene, ctx), camera);
  }
}

renderAll();
window.addEventListener('resize', renderAll);
