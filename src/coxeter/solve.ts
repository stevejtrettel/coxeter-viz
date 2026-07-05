import type { Geometry, GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import { Spherical2 } from '@/geometry/Spherical';
import { Euclidean2 } from '@/geometry/Euclidean';
import { Hyperbolic2 } from '@/geometry/Hyperbolic';
import { fromHalfspaces2 } from '@/polytope/build';
import type { Polytope } from '@/polytope/Polytope';
import { validatePolygon, type RealizationSpec } from './spec';
import { buildInscribedPolygon } from './polygon';

/**
 * The 2D solver entry point: validate → construct → VERIFY (folder README).
 * You get walls that provably realize the spec's combinatorics with the
 * decorated dihedral angles, or an error — never a silently-wrong picture.
 */

export interface RealizedPolygon {
  spec: RealizationSpec;
  geometry: GeometryKind;
  geom: Geometry<Point2, Isometry2>;
  /** Walls by generator index; the chamber is { side ≤ 0 for all }. */
  walls: Hyperplane[];
  /** The chamber, built and verified by the polytope engine. */
  chamber: Polytope<Point2>;
  /** Byproduct: ⟨nᵢ,nⱼ⟩ by generator index (E: wall directions only). */
  gram: number[][];
  /** The incenter is the origin; this is its distance to every wall (E: 1). */
  inradius: number;
  diagnostics: { closureError: number; maxGramError: number };
}

/** The 2D geometry instance for a kind (shared with the group layer). */
export function makeGeometry2(kind: GeometryKind): Geometry<Point2, Isometry2> {
  switch (kind) {
    case 'spherical':
      return new Spherical2();
    case 'euclidean':
      return new Euclidean2();
    case 'hyperbolic':
      return new Hyperbolic2();
  }
}

const GRAM_TOL = 1e-9;

export function solvePolygon(spec: RealizationSpec): RealizedPolygon {
  const v = validatePolygon(spec);
  const geom = makeGeometry2(v.geometry);
  const built = buildInscribedPolygon(v);
  const walls = built.covectors.map((c) => Hyperplane.fromCovector(geom, c));

  // ── Postcondition 1: the decorated dihedral angles hold exactly.
  let maxGramError = 0;
  for (let k = 0; k < v.n; k++) {
    const a = v.cyclicOrder[k];
    const b = v.cyclicOrder[(k + 1) % v.n];
    const err = Math.abs(built.gram[a][b] + Math.cos(Math.PI / v.vertexOrders[k]));
    maxGramError = Math.max(maxGramError, err);
  }
  if (maxGramError > GRAM_TOL) {
    throw new Error(`solvePolygon: dihedral-angle residual ${maxGramError} exceeds ${GRAM_TOL}.`);
  }

  // ── Postcondition 2: the walls realize the spec's combinatorics — the
  // polytope engine independently re-derives the chamber.
  const chamber = fromHalfspaces2(geom, walls);
  if (chamber.vertices.length !== v.n) {
    throw new Error(
      `solvePolygon: chamber has ${chamber.vertices.length} vertices, spec says ${v.n} — ` +
        'the solved walls do not realize the requested combinatorics.',
    );
  }
  for (let i = 0; i < walls.length; i++) {
    const incident = chamber.vertices.filter((p) => Math.abs(walls[i].side(p)) < 1e-7).length;
    if (incident !== 2) {
      throw new Error(`solvePolygon: wall ${i} is incident to ${incident} chamber vertices (expected 2).`);
    }
  }

  return {
    spec,
    geometry: v.geometry,
    geom,
    walls,
    chamber,
    gram: built.gram,
    inradius: built.inradius,
    diagnostics: { closureError: built.diagnostics.closureError, maxGramError },
  };
}
