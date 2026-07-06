/**
 * group — the Milestone-1 demo (PLAN.md §5.4, G4): the (2,3,7) hyperbolic,
 * (2,4,4) Euclidean and (2,3,5) spherical tessellations with their Cayley
 * graphs overlaid, drawn through two models per geometry — Klein + Poincaré,
 * Cartesian at two scales (straight = conformal), stereographic + the
 * perspective globe. Scene conversion from the group layer's own structures
 * lives HERE, downstream of src/group (promotable to an adapter module if
 * demos repeat themselves).
 */

import type { GeometryKind, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Klein2 } from '@/models/klein';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { mat3, matMul } from '@/math/mat';
import { scale as vecScale } from '@/math/vec';
import { solvePolygon } from '@/coxeter/solve';
import type { RealizationSpec } from '@/coxeter/spec';
import { groupFromPolygon, wordId, type CoxeterGroup, type Tile } from '@/group/CoxeterGroup';
import type { CayleyGraph } from '@/group/cayley';
import type { Isometry2 } from '@/geometry/types';
import type { Camera, Scene, SceneItem } from '@/render2d/types';
import { buildPathList } from '@/render2d/scene';
import { paint } from '@/render2d/canvas';
import { buildSpherePathList } from '@/sphereview/scene';
import type { SphereCamera } from '@/sphereview/types';

// Generator colors — the same indexing as walls, decorations, words.
const GEN_COLORS = ['#c0392b', '#27ae60', '#2f6fb7'];
const TILE_IDENTITY = '#f6d9a0';
const TILE_EVEN = '#f2e3c4';
const TILE_ODD = '#ffffff';
const EYE_DISTANCE = 5;

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

/** A generated group: the tessellation and Cayley graph out to maxWord. */
interface GroupData {
  group: CoxeterGroup<Point2, Isometry2>;
  tiles: Tile<Point2, Isometry2>[];
  graph: CayleyGraph<Isometry2>;
  /** The chamber inradius — the intrinsic unit for all demo styling. */
  r0: number;
}

function generate(geometry: GeometryKind, orders: [number, number, number], maxWord: number): GroupData {
  const realized = solvePolygon(triangleSpec(geometry, orders));
  const group = groupFromPolygon(realized);
  return {
    group,
    tiles: group.tessellate(maxWord, 20000),
    graph: group.cayleyGraph(maxWord, 20000),
    r0: realized.inradius,
  };
}

/**
 * The group layer's structures as render2d scene items, ids per the README
 * scheme (tile:<word>, cay:<word>, cayedge:<word>:<i>): tiles filled by word
 * parity (the identity tile emphasized), Cayley nodes at g·basePoint, edges
 * colored by their generator. `skipTileAt` drops the tiles containing a given
 * canonical point — demo chrome for the stereographic chart, where the tile
 * covering the projection antipode has an unbounded image whose fill would
 * paint the whole frame.
 */
function groupScene(data: GroupData, skipTileAt?: Point2): Scene {
  const { group, tiles, graph, r0 } = data;
  const items: SceneItem[] = [
    {
      // The geometry itself (render2d V2.2): shaded domain, rimmed disk
      // boundary. The globe panel's builder skips it (draws its own globe).
      id: 'domain',
      kind: 'domain',
      style: { fill: { color: '#fbf9f3' }, rim: { color: '#bbbbbb', widthPx: 1.25 } },
    },
  ];

  for (const tile of tiles) {
    if (skipTileAt && tile.polytope.facets.every((f) => f.side(skipTileAt) <= 1e-9)) continue;
    const fill = tile.word.length === 0 ? TILE_IDENTITY : tile.word.length % 2 === 0 ? TILE_EVEN : TILE_ODD;
    items.push({
      id: `tile:${wordId(tile.word)}`,
      kind: 'polygon',
      vertices: tile.polytope.vertices,
      style: {
        fill: { color: fill, opacity: 0.9 },
        edge: { color: '#7a6a4a', width: 0.025 * r0, opacity: 0.5 },
      },
    });
  }

  const points = graph.nodes.map((n) => group.geom.apply(n.element, group.basePoint));
  for (const e of graph.edges) {
    items.push({
      id: `cayedge:${wordId(graph.nodes[e.a].word)}:${e.generator}`,
      kind: 'geodesic',
      source: { type: 'segment', a: points[e.a], b: points[e.b] },
      style: { color: GEN_COLORS[e.generator], width: 0.06 * r0, opacity: 0.85 },
    });
  }
  graph.nodes.forEach((n, k) => {
    items.push({
      id: `cay:${wordId(n.word)}`,
      kind: 'point',
      at: points[k],
      style: { color: '#1a1a1a', radius: 0.11 * r0 },
    });
  });

  return items;
}

/** Rotation by angle a in the (i, j) coordinate plane of ambient R³. */
function planeRotation(i: number, j: number, a: number): Isometry2 {
  const rows = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  rows[i][i] = Math.cos(a);
  rows[j][j] = Math.cos(a);
  rows[i][j] = -Math.sin(a);
  rows[j][i] = Math.sin(a);
  return mat3(rows);
}

// ── The three Milestone-1 groups ────────────────────────────────────────────

const h237 = generate('hyperbolic', [2, 3, 7], 16);
const e244 = generate('euclidean', [2, 4, 4], 12);
const s235 = generate('spherical', [2, 3, 5], 20); // exhausts: all 120 elements

// Tip the sphere off-axis: generic view direction for the globe, and it moves
// the stereographic antipode into a tile interior (whose fill we then skip).
const sphereTip = matMul(planeRotation(0, 1, 0.55), planeRotation(0, 2, 0.35));
const geomS = s235.group.geom;
const antipodePreimage = geomS.apply(geomS.inverse(sphereTip), vecScale(geomS.origin(), -1) as Point2);

const sceneH = groupScene(h237);
const sceneE = groupScene(e244);
const sceneS = groupScene(s235);
const sceneSStereo = groupScene(s235, antipodePreimage);

/** Fit: pixels per render unit so every Cayley node lands inside the frame. */
function fitToNodes(data: GroupData, model: Model<Point2>, view: Isometry2, sizePx: number, margin: number): number {
  let extent = 0;
  for (const n of data.graph.nodes) {
    const u = model.project(data.group.geom.apply(view, data.group.geom.apply(n.element, data.group.basePoint)));
    extent = Math.max(extent, Math.hypot(u[0], u[1]));
  }
  return sizePx / 2 / (extent * margin);
}

// ── Panels ──────────────────────────────────────────────────────────────────

interface Panel {
  title: string;
  scene: Scene;
  paint(g: CanvasRenderingContext2D, sizePx: number): void;
}

function flatPanel(title: string, scene: Scene, data: GroupData, model: Model<Point2>, makeCamera: (sizePx: number) => Camera): Panel {
  return {
    title,
    scene,
    paint(g, sizePx) {
      const camera = makeCamera(sizePx);
      const ctx = { geom: data.group.geom, model, camera, size: { widthPx: sizePx, heightPx: sizePx } };
      paint(g, buildPathList(scene, ctx), camera);
    },
  };
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
  flatPanel('(2,3,5) S² — stereographic (conformal; far tile omitted)', sceneSStereo, s235, stereographic, (s) => ({
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
    scene: sceneS,
    paint(g, sizePx) {
      const silhouette = EYE_DISTANCE / Math.sqrt(EYE_DISTANCE * EYE_DISTANCE - 1);
      const camera: SphereCamera = {
        view: sphereTip,
        scalePx: sizePx / 2 / (silhouette * 1.12),
        centerPx: [sizePx / 2, sizePx / 2],
        eyeDistance: EYE_DISTANCE,
      };
      paint(g, buildSpherePathList(sceneS, { camera, size: { widthPx: sizePx, heightPx: sizePx } }), camera);
    },
  },
];

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
const GAP = 16;
const TITLE_H = 24;

document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'group G4 / Milestone 1 — tessellations and Cayley graphs in S, E, H through two models each';
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
    panel.paint(g, size);
  }
}

renderAll();
window.addEventListener('resize', renderAll);
