import type { Covec, Vec } from '@/math/vec';
import type { GeometryKind, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';

/**
 * The pure CPU side of the shader contract (README, "uniforms contract"):
 * chart ids, κ, the precomputed κ-trig thresholds, uniform-array packing —
 * all float64, all testable without a GPU. `foldPoint` is the float64
 * reference implementation of the shader's fold loop, used by the tests to
 * pin the algorithm's algebra (chamber membership, parity) against the
 * group layer.
 */

/** Model.name → chart id, matching the dispatch in shader.ts. */
export const CHART_IDS: Readonly<Record<string, number>> = {
  'poincare-disk': 0,
  'klein-disk': 1,
  cartesian: 2,
  stereographic: 3,
  gnomonic: 4,
};

/** The chart id of a flat 2D model; throws on anything else (e.g. Globe2). */
export function chartId(model: Model<Point2>): number {
  const id = CHART_IDS[model.name];
  if (id === undefined || model.renderDim !== 2) {
    throw new Error(`tilingshader: no chart for model '${model.name}' (renderDim ${model.renderDim})`);
  }
  return id;
}

/** κ = +1 / 0 / −1; J = diag(κ, 1, 1). */
export function kappaOf(kind: GeometryKind): number {
  switch (kind) {
    case 'spherical':
      return 1;
    case 'euclidean':
      return 0;
    case 'hyperbolic':
      return -1;
  }
}

/**
 * Edge threshold sin_κ(w): a unit covector's side value at a normalized
 * point is the κ-sine of the distance to the wall (Hyperplane.distanceTo,
 * inverted), so the band |⟨p,c⟩| < sin_κ(w) has intrinsic half-width w.
 */
export function edgeThreshold(kappa: number, halfWidth: number): number {
  if (kappa > 0) return Math.sin(halfWidth);
  if (kappa < 0) return Math.sinh(halfWidth);
  return halfWidth;
}

/**
 * Vertex threshold Q_r: the κ-quadratic form of the difference of two
 * points at distance r — 2(1 − cos r) in S, r² in E, 2(cosh r − 1) in H —
 * monotone in r (on [0, π] in S), so Q(p − v) < Q_r is a metric disk.
 */
export function vertexThreshold(kappa: number, radius: number): number {
  if (kappa > 0) return 2 * (1 - Math.cos(radius));
  if (kappa < 0) return 2 * (Math.cosh(radius) - 1);
  return radius * radius;
}

/** Pack ambient vectors/covectors into a vec3[max] uniform buffer. */
export function packVec3s(vs: readonly Vec[], max: number): Float32Array {
  if (vs.length > max) {
    throw new Error(`tilingshader: ${vs.length} entries exceed the uniform capacity ${max}`);
  }
  const out = new Float32Array(3 * max);
  for (let i = 0; i < vs.length; i++) {
    out[3 * i] = vs[i][0];
    out[3 * i + 1] = vs[i][1];
    out[3 * i + 2] = vs[i][2];
  }
  return out;
}

export interface FoldResult {
  /** The folded point, in the chamber when converged. */
  p: Point2;
  /** Reflection count; its parity is the sign character of the carrying element. */
  folds: number;
  converged: boolean;
}

/**
 * The reference fold (float64, mirrors the GLSL loop exactly): sweep the
 * walls in generator order, reflecting p ← p − 2⟨p,c⟩·Jc across every wall
 * with ⟨p,c⟩ > 0, renormalizing each sweep, until a clean sweep or the cap.
 * Converges because every accepted reflection strictly decreases the
 * distance to the incenter (README).
 */
export function foldPoint(
  p: Point2,
  walls: readonly Covec[],
  kappa: number,
  maxSweeps = 200,
): FoldResult {
  const q = Float64Array.from(p);
  let folds = 0;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let moved = false;
    for (const c of walls) {
      const s = q[0] * c[0] + q[1] * c[1] + q[2] * c[2];
      if (s > 0) {
        q[0] -= 2 * s * kappa * c[0];
        q[1] -= 2 * s * c[1];
        q[2] -= 2 * s * c[2];
        folds++;
        moved = true;
      }
    }
    if (kappa === 0) {
      const f = 1 / q[0];
      q[0] = 1;
      q[1] *= f;
      q[2] *= f;
    } else {
      const f = 1 / Math.sqrt(Math.abs(kappa * q[0] * q[0] + q[1] * q[1] + q[2] * q[2]));
      q[0] *= f;
      q[1] *= f;
      q[2] *= f;
    }
    if (!moved) return { p: q, folds, converged: true };
  }
  return { p: q, folds, converged: false };
}
