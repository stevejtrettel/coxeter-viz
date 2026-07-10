import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Stereographic2 } from '@/models/stereographic';
import { classifyPolygon, type RealizationSpec } from '@/coxeter/spec';
import { solvePolygon, type RealizedPolygon } from '@/coxeter/solve';
import { groupFromPolygon, type CoxeterGroup } from '@/group/CoxeterGroup';

/**
 * The realize preamble (`viz2d/kit`): abstract vertex orders → a solved,
 * grouped, chart-bearing tessellation, the bundle every 2D demo opens with.
 * Composes the library (`solvePolygon`, `groupFromPolygon`) with the viz
 * chart choice (`defaultModel`); the math is all downstream.
 */

/** The default flat chart per geometry: Poincaré (H), Cartesian (E), stereographic (S). */
export function defaultModel(kind: GeometryKind): Model<Point2> {
  switch (kind) {
    case 'hyperbolic':
      return new Poincare2();
    case 'euclidean':
      return new Cartesian2();
    case 'spherical':
      return new Stereographic2();
  }
}

/**
 * A `RealizationSpec` for the cyclic polygon with the given vertex orders
 * (decoration k on walls {k, k+1}). Geometry defaults to the exact
 * classification of the orders (`classifyPolygon`) — the "model: auto" of the
 * design doc — or is forced when supplied.
 */
export function polygonSpec(orders: number[], geometry?: GeometryKind): RealizationSpec {
  const n = orders.length;
  return {
    geometry: geometry ?? classifyPolygon(orders),
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: Array.from({ length: n }, (_, k) => k) },
    decorations: orders.map((m, k) => ({ walls: [k, (k + 1) % n] as [number, number], order: m })),
  };
}

/** A realized group ready to picture: the solved polygon, its group, chart, and unit. */
export interface RealizedGroup {
  kind: GeometryKind;
  poly: RealizedPolygon;
  group: CoxeterGroup<Point2, Isometry2>;
  model: Model<Point2>;
  /** = poly.inradius, the intrinsic unit all styling is measured in. */
  r0: number;
}

/**
 * Realize a spec end to end: `solvePolygon` → `groupFromPolygon` → chart.
 * The spec-shaped entry (P3): the inference layer (`classifyCoxeterMatrix`)
 * hands the app a `RealizationSpec` directly. `opts.model` overrides the
 * default chart.
 */
export function realizeSpec(spec: RealizationSpec, opts?: { model?: Model<Point2> }): RealizedGroup {
  const poly = solvePolygon(spec);
  const group = groupFromPolygon(poly);
  return {
    kind: spec.geometry,
    poly,
    group,
    model: opts?.model ?? defaultModel(spec.geometry),
    r0: poly.inradius,
  };
}

/**
 * Realize a cyclic Coxeter polygon end to end: `polygonSpec` → `realizeSpec`.
 * `opts.geometry` forces the geometry (else inferred); `opts.model` overrides
 * the default chart.
 */
export function realizePolygon(
  orders: number[],
  opts?: { geometry?: GeometryKind; model?: Model<Point2> },
): RealizedGroup {
  return realizeSpec(polygonSpec(orders, opts?.geometry), { model: opts?.model });
}
