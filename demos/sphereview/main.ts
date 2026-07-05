/**
 * sphereview — the stage-1 success-criterion demo (PLAN.md §5.3.2): the V1
 * (2,3,5) chamber scene UNCHANGED, drawn as a translucent globe in
 * perspective. The view isometry wraps the walls' far arcs behind the
 * sphere: front arcs vivid, back arcs dimmed under the globe disk, ribbon
 * widths tapering toward the silhouette.
 */

import { matMul, mat3 } from '@/math/mat';
import type { GeometryKind } from '@/geometry/types';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import type { RealizationSpec } from '@/coxeter/spec';
import type { Scene } from '@/render2d/types';
import { paint } from '@/render2d/canvas';
import { buildSpherePathList } from '@/sphereview/scene';
import type { SphereCamera } from '@/sphereview/types';

const WALL_COLORS = ['#c0392b', '#27ae60', '#2f6fb7'];
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

/** The V1 chamber scene, verbatim (demos/render2d): the same items draw here. */
function chamberScene(realized: RealizedPolygon): Scene {
  const r0 = realized.inradius;
  const origin = realized.geom.origin();
  return [
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

/** Rotation by angle a in the (i, j) coordinate plane of ambient R³. */
function planeRotation(i: number, j: number, a: number) {
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

const s235 = solvePolygon(triangleSpec('spherical', [2, 3, 5]));
const scene = chamberScene(s235);
// Tip the chamber off-axis so the walls' far arcs wrap behind the globe.
const view = matMul(planeRotation(0, 1, 0.9), planeRotation(0, 2, 0.45));

// ── Page ────────────────────────────────────────────────────────────────────

const PAD = 20;
document.body.style.cssText = `margin:0;padding:${PAD}px;background:#f7f5f0;font-family:system-ui,sans-serif;color:#222`;
const heading = document.createElement('h2');
heading.textContent =
  'sphereview stage 1 — the (2,3,5) chamber on a translucent globe, perspective d = 5';
heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 12px';
document.body.appendChild(heading);

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

function renderAll(): void {
  const headingH = heading.offsetHeight + 12;
  const size = Math.max(
    260,
    Math.min(760, window.innerWidth - 2 * PAD, window.innerHeight - 2 * PAD - headingH),
  );
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.cssText = `width:${size}px;height:${size}px;background:#fff;border-radius:4px`;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const silhouette = EYE_DISTANCE / Math.sqrt(EYE_DISTANCE * EYE_DISTANCE - 1);
  const camera: SphereCamera = {
    view,
    scalePx: size / 2 / (silhouette * 1.12),
    centerPx: [size / 2, size / 2],
    eyeDistance: EYE_DISTANCE,
  };
  const paths = buildSpherePathList(scene, {
    camera,
    size: { widthPx: size, heightPx: size },
  });
  paint(g, paths, camera);
}

renderAll();
window.addEventListener('resize', renderAll);
