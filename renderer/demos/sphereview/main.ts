/**
 * sphereview — the stage-1 success-criterion demo (PLAN.md §5.3.2): the V1
 * (2,3,5) chamber scene UNCHANGED, drawn as a translucent globe in
 * perspective. The view isometry wraps the walls' far arcs behind the
 * sphere: front arcs vivid, back arcs dimmed under the globe disk, ribbon
 * widths tapering toward the silhouette.
 */

import type { Isometry2 } from '@/geometry/types';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import type { Scene } from '@/viz2d/render/types';
import { paint } from '@/viz2d/render/canvas';
import { toSvg } from '@/viz2d/render/svg';
import { attachInteraction } from '@/viz2d/render/interact';
import { buildSpherePathList } from '@/viz2d/sphere/scene';
import { SpherePerspective, sphereUnprojector } from '@/viz2d/sphere/projection';
import type { SphereCamera } from '@/viz2d/sphere/types';
import { polygonSpec } from '@/viz2d/kit/realize';
import { tippedView } from '@/viz2d/kit/camera';
import { FD, GEN_COLORS } from '@/viz2d/kit/palette';
import { PAD, button, canvas2d, downloadSvg, dpr, pageShell, rafScheduler } from '../shared';

const EYE_DISTANCE = 5;

/** The V1 chamber scene, verbatim (demos/render2d): the same items draw here. */
function chamberScene(realized: RealizedPolygon): Scene {
  const r0 = realized.inradius;
  const origin = realized.geom.origin();
  return [
    {
      id: 'chamber',
      kind: 'polygon',
      vertices: realized.chamber.vertices,
      style: { fill: { color: FD, opacity: 0.8 } },
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
      style: { color: GEN_COLORS[i], width: 0.12 * r0 },
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

const s235 = solvePolygon(polygonSpec([2, 3, 5], 'spherical'));
const scene = chamberScene(s235);
// Tip the chamber off-axis so the walls' far arcs wrap behind the globe.
const initialView = tippedView(0.9, 0.45);
// P3: back arcs dash (the hidden-line convention), sized by the inradius.
const backDash = { on: 0.5 * s235.inradius, off: 0.35 * s235.inradius };

// ── Page ────────────────────────────────────────────────────────────────────

const heading = pageShell(
  'sphereview — the (2,3,5) chamber, perspective d = 5 · drag to rotate, wheel to zoom · dashed hidden lines',
);
heading.style.margin = '0 0 12px';

const save = button('SVG');
save.title = 'Download as SVG — identical to the canvas, current view included';
save.style.marginBottom = '8px';
save.style.display = 'block';
document.body.appendChild(save);

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// The view survives resize; the affine part is re-derived from the new size.
let savedView: Isometry2 = initialView;
// One canvas is reused across resizes: tear down the old controller first.
let detach: (() => void) | null = null;

function renderAll(): void {
  const headingH = heading.offsetHeight + save.offsetHeight + 20;
  const size = Math.max(
    260,
    Math.min(760, window.innerWidth - 2 * PAD, window.innerHeight - 2 * PAD - headingH),
  );
  const g = canvas2d(canvas, size, dpr());
  canvas.style.background = '#fff';
  canvas.style.borderRadius = '4px';

  const silhouette = EYE_DISTANCE / Math.sqrt(EYE_DISTANCE * EYE_DISTANCE - 1);
  let camera: SphereCamera = {
    view: savedView,
    scalePx: size / 2 / (silhouette * 1.12),
    centerPx: [size / 2, size / 2],
    eyeDistance: EYE_DISTANCE,
  };

  const build = () =>
    buildSpherePathList(scene, { camera, size: { widthPx: size, heightPx: size }, backDash });
  const draw = (): void => {
    g.clearRect(0, 0, size, size);
    paint(g, build(), camera);
  };
  const schedule = rafScheduler(draw);

  draw();
  save.onclick = () => {
    downloadSvg(toSvg(build(), camera, { widthPx: size, heightPx: size }), 'sphereview-235-chamber.svg');
  };
  // Globe rotation (stage 2a): drag the front sheet, the double-bisector
  // machinery composes the rotation into the view.
  detach?.();
  const handle = attachInteraction(canvas, {
    geom: s235.geom,
    unproject: sphereUnprojector(new SpherePerspective(EYE_DISTANCE)),
    camera,
    onCamera: (c) => {
      camera = c as SphereCamera;
      savedView = c.view;
      schedule();
    },
  });
  detach = () => handle.dispose();
}

renderAll();
window.addEventListener('resize', renderAll);
