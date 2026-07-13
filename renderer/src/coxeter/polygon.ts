import { vec3, type Covec3 } from '@/math/vec';
import type { GeometryKind } from '@/geometry/types';
import type { ValidatedPolygon } from './spec';

/**
 * The inscribed-circle polygon solver — Porti's minimum-perimeter polygon,
 * generalized over curvature (see README for the derivation). Incenter at
 * the origin; wall k tangent to the circle of radius r with outward normal
 * at angle φₖ; the gaps Δφₖ = 2·arcsin(cos(βₖ/2)/C(r)) close up (Σ = 2π) at
 * the unique inradius. Pure numerics — no Geometry instance; covectors come
 * out in the ambient (c₀, x, y) convention, unit-normalized (cᵀJc = 1).
 */

export interface InscribedPolygon {
  /** Wall covectors indexed by GENERATOR (cyclic position unwound). */
  covectors: Covec3[];
  /** Gram matrix ⟨nᵢ,nⱼ⟩ of the poles, by generator index (E: directions only). */
  gram: number[][];
  /** Inradius (r ≡ 1 for E: the scale modulus, fixed by convention). */
  inradius: number;
  diagnostics: {
    /** Σ Δφₖ − 2π at the solved radius. */
    closureError: number;
  };
}

/** C(r): the divisor in the gap formula — cos r (S), 1 (E), cosh r (H). */
function gapDivisor(kind: GeometryKind, r: number): number {
  switch (kind) {
    case 'spherical':
      return Math.cos(r);
    case 'euclidean':
      return 1;
    case 'hyperbolic':
      return Math.cosh(r);
  }
}

const clamp1 = (x: number) => Math.min(1, Math.max(-1, x));

export function buildInscribedPolygon(v: ValidatedPolygon): InscribedPolygon {
  const { geometry, n, cyclicOrder, vertexOrders } = v;
  const halfCos = vertexOrders.map((m) => Math.cos(Math.PI / (2 * m))); // cos(βₖ/2)

  const closure = (r: number): number => {
    const C = gapDivisor(geometry, r);
    let sum = 0;
    for (const c of halfCos) sum += 2 * Math.asin(clamp1(c / C));
    return sum - 2 * Math.PI;
  };

  // Solve for the inradius (README: monotone in r; E needs no solve).
  let r: number;
  if (geometry === 'euclidean') {
    r = 1; // the scale modulus, fixed: incircle radius 1
  } else if (geometry === 'hyperbolic') {
    // closure decreases from Σ(π−β) − 2π > 0 to −2π; bracket by doubling.
    let hi = 1;
    while (closure(hi) > 0) hi *= 2;
    let lo = 0;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      if (closure(mid) > 0) lo = mid;
      else hi = mid;
    }
    r = (lo + hi) / 2;
  } else {
    // spherical: closure increases on [0, β_min/2); the domain end is where
    // the widest-angle wall's gap reaches π.
    const rMax = Math.min(...vertexOrders.map((m) => Math.PI / (2 * m)));
    if (closure(rMax * (1 - 1e-12)) < 0) {
      throw new Error('spherical polygon: the angle data admits no inscribed-circle polygon.');
    }
    let lo = 0;
    let hi = rMax;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      if (closure(mid) < 0) lo = mid;
      else hi = mid;
    }
    r = (lo + hi) / 2;
  }

  // Cumulative normal angles from the solved gaps.
  const C = gapDivisor(geometry, r);
  const gaps = halfCos.map((c) => 2 * Math.asin(clamp1(c / C)));
  const closureError = gaps.reduce((s, g) => s + g, 0) - 2 * Math.PI;
  const phi: number[] = [0];
  for (let k = 1; k < n; k++) phi.push(phi[k - 1] + gaps[k - 1]);

  // The wall tangent to the incircle at angle φ (README table), and the
  // matching pole/curvature data for the Gram byproduct.
  const covectorAt = (angle: number): Covec3 => {
    switch (geometry) {
      case 'spherical':
        return vec3(-Math.sin(r), Math.cos(r) * Math.cos(angle), Math.cos(r) * Math.sin(angle));
      case 'euclidean':
        return vec3(-1, Math.cos(angle), Math.sin(angle));
      case 'hyperbolic':
        return vec3(-Math.sinh(r), Math.cosh(r) * Math.cos(angle), Math.cosh(r) * Math.sin(angle));
    }
  };

  // Unwind cyclic position → generator index.
  const covectors = new Array<Covec3>(n);
  for (let k = 0; k < n; k++) covectors[cyclicOrder[k]] = covectorAt(phi[k]);

  // Gram of the poles: ⟨Jcᵢ, Jcⱼ⟩_J = cᵢᵀ J cⱼ, with J = diag(κ, 1, 1).
  const kappa = geometry === 'spherical' ? 1 : geometry === 'euclidean' ? 0 : -1;
  const gram = covectors.map((ci) =>
    covectors.map((cj) => kappa * ci[0] * cj[0] + ci[1] * cj[1] + ci[2] * cj[2]),
  );

  return { covectors, gram, inradius: r, diagnostics: { closureError } };
}
