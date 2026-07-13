import { vec3 } from '@/math/vec';
import { solveLinear } from '@/math/linearSolve';
import type { Isometry2, Point2 } from '@/geometry/types';
import type { RealizedPolygon } from '@/coxeter/solve';
import type { Polytope } from '@/polytope/Polytope';
import { fromVertices2 } from '@/polytope/build';
import { transformPolytope } from '@/polytope/transform';
import type { CoxeterGroup } from './CoxeterGroup';
import { matrixKey } from './orbit';

/**
 * The Wythoff construction over a realized TRIANGLE (folder README,
 * "Uniform tilings"): ringed-node seed from the plain 3×3 linear system
 * cᵢ·p = tᵢ (t = −1 ringed / 0 unringed — equal targets are what make the
 * ringed edge lengths uniform), base faces = the seed's orbits under the
 * three vertex dihedrals hulled, carried over the metric ball with
 * centroid dedup. Simplex chambers only; the parent repo's construction
 * re-derived in the covector vocabulary.
 */

/** A face of the uniform tiling; `type` = the wall-pair (decoration) index. */
export interface UniformCell {
  type: number;
  polytope: Polytope<Point2>;
}

/**
 * The seed point of the ring pattern: ON every unringed mirror, unit depth
 * inside every ringed one. Throws unless the chamber is a triangle and at
 * least one node is ringed.
 */
export function wythoffPoint(poly: RealizedPolygon, rings: readonly boolean[]): Point2 {
  if (poly.walls.length !== 3 || rings.length !== 3) {
    throw new Error('wythoffPoint: simplex chambers only (exactly 3 walls/rings)');
  }
  if (!rings.some(Boolean)) {
    throw new Error('wythoffPoint: at least one ring (all-unringed pins the seed to nothing)');
  }
  const A = poly.walls.map((w) => [w.covector[0], w.covector[1], w.covector[2]]);
  const b = rings.map((r) => (r ? -1 : 0));
  const x = solveLinear(A, b);
  // Points live on the p₀ > 0 side in all three geometries; the solve is
  // homogeneous-friendly (negating flips every side), so fix the sign.
  const s = x[0] < 0 ? -1 : 1;
  const p = poly.geom.normalize(vec3(s * x[0], s * x[1], s * x[2]));
  if (!p.every(Number.isFinite)) {
    throw new Error('wythoffPoint: seed does not normalize (ring pattern leaves the geometry?)');
  }
  return p;
}

/**
 * The uniform tiling of a ring pattern out to the metric `radius`: base
 * faces = seed orbits under the decorated pairs' dihedrals (degenerate
 * orbits — the seed fixed, both walls unringed — skipped), carried over
 * `orbitBall` and deduplicated by quantized centroid.
 */
export function uniformCells(
  group: CoxeterGroup<Point2, Isometry2>,
  poly: RealizedPolygon,
  rings: readonly boolean[],
  radius: number,
  maxCount = 20000,
): UniformCell[] {
  const geom = group.geom;
  const seed = wythoffPoint(poly, rings);

  const base: UniformCell[] = [];
  poly.spec.decorations.forEach((dec, type) => {
    const [i, j] = dec.walls;
    const dihedral = group.subgroup([group.reflections[i], group.reflections[j]], 4 * dec.order + 8);
    const pts = new Map<string, Point2>();
    for (const h of dihedral.values()) {
      const q = geom.apply(h, seed);
      pts.set(matrixKey(q), q);
    }
    if (pts.size < 3) return; // degenerate: the dihedral fixes the seed
    base.push({ type, polytope: fromVertices2(geom, [...pts.values()]) });
  });

  const cells: UniformCell[] = [];
  const seen = new Set<string>();
  for (const e of group.orbitBall(radius, maxCount)) {
    for (const f of base) {
      const carried = transformPolytope(f.polytope, geom, e.element);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const v of carried.vertices) {
        cx += v[0];
        cy += v[1];
        cz += v[2];
      }
      const key = `${f.type}:${matrixKey(geom.normalize(vec3(cx, cy, cz)))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ type: f.type, polytope: carried });
    }
  }
  return cells;
}
