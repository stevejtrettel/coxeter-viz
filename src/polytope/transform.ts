import { Hyperplane } from '@/geometry/Hyperplane';
import type { Geometry, Vec } from '@/geometry/types';
import { Polytope } from './Polytope';

/**
 * The image g(P) of a polytope under an isometry. The face lattice is
 * invariant, so nothing is re-hulled: vertices map covariantly (v ↦ g·v,
 * re-normalized against float drift) and wall covectors CONTRAvariantly
 * (c ↦ (g⁻¹)ᵀc via geometry.applyDual), which keeps side values equivariant
 * — the transported wall bounds the transported polytope exactly. O(V+F).
 *
 * A reflection reverses orientation, so face loops come back wound the other
 * way; nothing downstream currently depends on winding (revisit if outward
 * orientation starts to matter).
 */
export function transformPolytope<P extends Vec<P>, I>(
  poly: Polytope<P>,
  geom: Geometry<P, I>,
  g: I,
): Polytope<P> {
  return new Polytope(
    poly.dim,
    poly.vertices.map((v) => geom.normalize(geom.apply(g, v))),
    poly.vertexKind.slice(),
    poly.edges.map((e) => [e[0], e[1]] as [number, number]),
    poly.faces.map((f) => ({ loop: f.loop.slice(), facet: f.facet })),
    poly.facets.map((w) => Hyperplane.fromCovector(geom, geom.applyDual(g, w.covector))),
  );
}
