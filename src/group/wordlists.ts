import type { Vec } from '@/math/vec';
import type { Isometry2, Point2 } from '@/geometry/types';
import type { Polytope } from '@/polytope/Polytope';
import { fromVertices2 } from '@/polytope/build';
import { matrixKey, type OrbitElement } from './orbit';
import type { CoxeterGroup } from './CoxeterGroup';

/**
 * Word-list helpers beyond the class (folder README, "Word lists"; M3).
 * Everything here is ELEMENTWISE — word lists were converted to elements
 * upstream (`CoxeterGroup.elements`); no literal word syntax survives to
 * this layer.
 */

/**
 * Assign each element its LEFT coset gH: g₁ and g₂ share a coset iff
 * g₁⁻¹g₂ ∈ H, computed by keying each coset by the MINIMAL matrix key over
 * its orbit {g·h : h ∈ H} — a canonical representative without inverting
 * anything. Returns element key → coset ordinal (ordinals in first-seen
 * order, so the identity's coset is 0 when the identity leads the list).
 * O(|elements|·|H|) — fine at demo scales; H is assumed completely
 * enumerated (a truncated `subgroup` would fracture cosets).
 */
export function cosetIndex<P extends Vec, I extends Float64Array>(
  group: CoxeterGroup<P, I>,
  subgroup: ReadonlyMap<string, I>,
  elements: readonly OrbitElement<I>[],
): Map<string, number> {
  const cosetOf = new Map<string, number>();
  const ordinals = new Map<string, number>();
  for (const e of elements) {
    let min: string | null = null;
    for (const h of subgroup.values()) {
      const k = matrixKey(group.geom.compose(e.element, h));
      if (min === null || k < min) min = k;
    }
    let id = ordinals.get(min!);
    if (id === undefined) {
      id = ordinals.size;
      ordinals.set(min!, id);
    }
    cosetOf.set(matrixKey(e.element), id);
  }
  return cosetOf;
}

/**
 * The convex hull of the BASE-POINT IMAGES of a word list's elements (the
 * design doc's hull semantics, stated per its rule). 2D: the polytope
 * engine's `fromVertices2` does the geometry; its spherical hemisphere
 * refusal propagates — a hull spanning more than a hemisphere throws, by
 * design. Duplicate spellings collapse upstream in `elements`.
 */
export function hullOfWords(
  group: CoxeterGroup<Point2, Isometry2>,
  words: readonly (readonly number[])[],
): Polytope<Point2> {
  const points = [...group.elements(words).values()].map(({ element }) =>
    group.geom.apply(element, group.basePoint),
  );
  return fromVertices2(group.geom, points);
}
