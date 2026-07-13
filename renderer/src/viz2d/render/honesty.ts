import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { finite2 } from './cull';
import { vertexMean } from './item';

/**
 * V2.3 fill honesty (see README): a region containing the chart's puncture
 * projects to the COMPLEMENT of its boundary loop, so an even-odd fill would
 * paint the wrong side. Only spherical flat charts can wrap; H/E charts are
 * embeddings and always honest.
 */

/**
 * A canonical interior point of a geodesically convex vertex loop: the
 * normalized vertex mean (chordal mean, inside the convex hull in all three
 * geometries). Null when undecidable (spherical mean ≈ 0).
 */
export function polygonInterior(geom: Geometry<Point2, Isometry2>, verts: readonly Point2[]): Point2 | null {
  const s = vertexMean(verts);
  if (Math.abs(geom.form(s, s)) < 1e-12) return null;
  return geom.normalize(s);
}

/** Even-odd ray cast: is (x, y) inside the closed contour? */
function insideContour(c: Float64Array, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = c.length - 2; i < c.length; j = i, i += 2) {
    const yi = c[i + 1];
    const yj = c[j + 1];
    if (yi > y !== yj > y && x < c[i] + ((y - yi) / (yj - yi)) * (c[j] - c[i])) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The interior-point winding test (README): a canonical interior point (a
 * circle's center exactly; a polygon's normalized vertex mean) must project
 * INSIDE the sampled loop; a wrapped region puts it outside (or at the
 * puncture itself, non-finite). Non-spherical charts are always honest; an
 * undecidable mean keeps the fill (dropping is the exceptional act).
 */
export function honestFill(
  geom: Geometry<Point2, Isometry2>,
  model: Model<Point2>,
  interior: Point2 | null,
  contour: Float64Array,
): boolean {
  if (geom.kind !== 'spherical') return true;
  if (interior === null) return true;
  const u = model.project(interior);
  return finite2(u) && insideContour(contour, u[0], u[1]);
}
