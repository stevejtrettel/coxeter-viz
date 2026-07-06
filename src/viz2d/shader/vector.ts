import type { Isometry2, Point2 } from '@/geometry/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import type { CoxeterGroup } from '@/group/CoxeterGroup';
import { wordId } from '@/group/CoxeterGroup';
import { matrixKey } from '@/group/orbit';
import { vec3 } from '@/math/vec';
import type { Model } from '@/models/types';
import type { Camera, PathList, RenderPath, SceneItem, ViewSize } from '@/viz2d/render/types';
import type { Rgba, TilingStyle } from './types';

/**
 * The field's VECTOR TWIN (README, "The vector twin"): the GPU tiling field
 * regenerated as render2d scene items from the SAME TilingStyle, convention
 * for convention — parity fills (word-length parity = fold parity = the sign
 * character), edge bands as the deduplicated wall-image orbit at stroke
 * width 2·halfWidth, vertex disks as the vertex orbit's metric circles, in
 * the GPU's compositing order. SVG export is its customer: exact for
 * compact groups, ball-truncated at the frontier in E/H (documented).
 */

/** rgba → render2d color/opacity; null when the layer is hidden (a = 0). */
function css(c: Rgba): { color: string; opacity: number } | null {
  if (c[3] <= 0) return null;
  const b = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x)));
  return { color: `rgb(${b(c[0])},${b(c[1])},${b(c[2])})`, opacity: c[3] };
}

/** Quantized key identifying ±c as one wall (sign fixed by the first big entry). */
function wallKey(c: Float64Array): string {
  let flip = 1;
  for (let i = 0; i < c.length; i++) {
    if (Math.abs(c[i]) > 1e-9) {
      flip = c[i] < 0 ? -1 : 1;
      break;
    }
  }
  const canon = Float64Array.from(c, (x) => flip * x);
  return matrixKey(canon);
}

/**
 * The view's COVERAGE RADIUS (README, "Coverage is ADAPTIVE"): the largest
 * intrinsic distance from the base point to a frame point where a tile
 * would still render at least `epsilonPx` wide — width = 2·inradius(F),
 * the honest visibility measure for sliver chambers (diameter overstates
 * it). Sampled on a coarse pixel grid: unproject in-domain samples,
 * relevance-test via `model.scaleAt`, measure distance in content
 * coordinates through view⁻¹. One ε means the same visual completeness for
 * every group, chart, camera, and zoom — `epsilonPx` is the size/reach
 * dial (larger ⇒ shallower ⇒ smaller SVG). Feed the result to
 * `tessellateBall`, whose diam(F) margin also absorbs this sampling's
 * coarseness.
 */
export function coverageRadius(
  group: CoxeterGroup<Point2, Isometry2>,
  model: Model<Point2>,
  camera: Camera,
  size: ViewSize,
  epsilonPx = 1.5,
  grid = 32,
): number {
  const geom = group.geom;
  const viewInv = geom.inverse(camera.view);
  const width = 2 * Math.min(...group.walls.map((w) => w.distanceTo(geom, group.basePoint)));
  const domR = model.domain.kind === 'disk' ? model.domain.radius : Infinity;
  let radius = 0;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const px = ((gx + 0.5) / grid) * size.widthPx;
      const py = ((gy + 0.5) / grid) * size.heightPx;
      const u0 = (px - camera.centerPx[0]) / camera.scalePx;
      const u1 = (camera.centerPx[1] - py) / camera.scalePx;
      if (u0 * u0 + u1 * u1 >= domR * domR) continue;
      const p = model.unproject(vec3(u0, u1, 0));
      if (width * model.scaleAt(p) * camera.scalePx < epsilonPx) continue;
      radius = Math.max(radius, geom.distance(geom.apply(viewInv, p), group.basePoint));
    }
  }
  return radius;
}

/** The enumeration bound: intrinsic radius (adaptive) or word depth (fixed). */
export type FieldBound = { radius: number } | { maxWord: number };

/**
 * Merge the twin's TILE paths by style: the tiles are pairwise DISJOINT (a
 * tessellation), so any set of them fills identically as ONE multi-contour
 * even-odd path — same pixels, a fraction of the SVG bytes (per-path
 * attributes and word-length data-ids dominate a deep export). Only
 * `field:tile:` paths merge: wall outlines CROSS (even-odd would punch
 * holes at crossings) and the domain underlay CONTAINS the tiles (they
 * would become holes in it), so both stay as they are. Everything
 * non-field passes through untouched, order preserved.
 */
export function mergeFieldPaths(paths: PathList): PathList {
  const out: RenderPath[] = [];
  const byStyle = new Map<string, { id: string; color: string; opacity: number; contours: Float64Array[] }>();
  let firstTile = -1;
  for (const p of paths) {
    if (!p.id.startsWith('field:tile:')) {
      out.push(p);
      continue;
    }
    if (firstTile < 0) firstTile = out.length;
    const key = `${p.color}/${p.opacity}`;
    const m = byStyle.get(key);
    if (m) m.contours.push(...p.contours);
    else
      byStyle.set(key, {
        id: `field:tiles:${byStyle.size}`,
        color: p.color,
        opacity: p.opacity,
        contours: [...p.contours],
      });
  }
  if (firstTile >= 0) out.splice(firstTile, 0, ...byStyle.values());
  return out;
}

/**
 * The field as a Scene fragment, in GPU order: domain underlay (`even`, to
 * quiet the truncation frontier), parity tiles, wall-image lines, vertex
 * circles. The bound is either an intrinsic `radius` (adaptive — pair with
 * `coverageRadius`; group-independent coverage via `tessellateBall`) or a
 * fixed `maxWord`; `maxCount` backstops both.
 */
export function fieldScene(
  group: CoxeterGroup<Point2, Isometry2>,
  style: TilingStyle,
  bound: FieldBound,
  maxCount?: number,
): SceneItem[] {
  const geom = group.geom;
  const tiles =
    'radius' in bound
      ? group.tessellateBall(bound.radius, maxCount)
      : group.tessellate(bound.maxWord, maxCount);
  const even = css(style.even);
  const odd = css(style.odd);
  const edge = style.edgeHalfWidth > 0 ? css(style.edge) : null;
  const vertex = style.vertexRadius > 0 ? css(style.vertex) : null;
  const items: SceneItem[] = [];

  if (even) items.push({ id: 'field:bg', kind: 'domain', style: { fill: even } });

  // Tiles by the sign character: word-length parity = the GPU's fold parity.
  for (const t of tiles) {
    const fill = t.word.length % 2 === 0 ? even : odd;
    if (!fill) continue;
    items.push({
      id: `field:tile:${wordId(t.word)}`,
      kind: 'polygon',
      vertices: t.polytope.vertices,
      style: { fill },
    });
  }

  // Edge bands: the wall-image orbit as FULL geodesics, one item per mirror
  // (±covector dedup), stroke width 2w = the GPU band |⟨p,c⟩| < sin_κ(w).
  if (edge) {
    const seen = new Set<string>();
    let n = 0;
    for (const t of tiles) {
      for (const w of group.walls) {
        const c = geom.applyDual(t.element, w.covector);
        const key = wallKey(c);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: `field:wall:${n++}`,
          kind: 'geodesic',
          source: { type: 'line', wall: Hyperplane.fromCovector(geom, c) },
          style: { ...edge, width: 2 * style.edgeHalfWidth },
        });
      }
    }
  }

  // Vertex disks: the vertex orbit as metric circles of intrinsic radius r.
  if (vertex) {
    const seen = new Set<string>();
    let n = 0;
    for (const t of tiles) {
      for (const v of t.polytope.vertices) {
        const key = matrixKey(v);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: `field:vertex:${n++}`,
          kind: 'circle',
          center: v,
          radius: style.vertexRadius,
          style: { fill: vertex },
        });
      }
    }
  }

  return items;
}
