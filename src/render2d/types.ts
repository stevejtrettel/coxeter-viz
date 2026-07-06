import type { Isometry2, Point2 } from '@/geometry/types';
import type { Hyperplane } from '@/geometry/Hyperplane';

/**
 * The 2D system's vocabulary (see README, the spec): identity-carrying scene
 * items in canonical coordinates on one side, the backend-agnostic path list
 * in render coordinates on the other. Everything between (sampling, stroking,
 * clipping, culling) lives in the sibling modules; nothing here is generic —
 * this system draws 2D geometries only, so P and I are fixed to
 * Point2 / Isometry2.
 */

/**
 * Scene-item identity. Load-bearing, not cosmetic: a wall item's id encodes
 * its generator index (the indexing shared by combinatorics, decorations,
 * words, Cayley); highlighting and hit-testing address items by id.
 */
export type ItemId = string;

// ── Styles ──────────────────────────────────────────────────────────────────
// All sizes are INTRINSIC lengths in the geometry; nothing is a screen width.

export interface FillStyle {
  readonly color: string;
  /** 0–1; default 1. */
  readonly opacity?: number;
}

/** A stroke of intrinsic width, realized as a filled outline. */
export interface StrokeStyle {
  readonly color: string;
  /** Intrinsic width w; the outline offsets ±(w/2)·J·n̂ per sample. */
  readonly width: number;
  /** 0–1; default 1. */
  readonly opacity?: number;
}

/** A point mark of intrinsic radius, drawn as its jacobian-image ellipse. */
export interface PointStyle {
  readonly color: string;
  /** Intrinsic radius r; the mark is r·J·(unit circle) at the point. */
  readonly radius: number;
  /** 0–1; default 1. */
  readonly opacity?: number;
}

/** A fillable region with an optional stroked boundary. */
export interface RegionStyle {
  readonly fill?: FillStyle;
  readonly edge?: StrokeStyle;
}

/**
 * Per-frame style override, merged field-by-field over an item's own style;
 * fields that don't apply to the item's kind are ignored. `null` on `fill` /
 * `edge` suppresses that part entirely. Highlighting is exactly this — the
 * scene itself is never mutated.
 */
export interface StyleOverride {
  readonly color?: string;
  readonly opacity?: number;
  readonly width?: number;
  readonly radius?: number;
  readonly fill?: FillStyle | null;
  readonly edge?: StrokeStyle | null;
}

export type StyleOverrides = ReadonlyMap<ItemId, StyleOverride>;

// ── Scene items ─────────────────────────────────────────────────────────────
// Canonical data only: points on the locus, walls as Hyperplanes. The camera
// and models do all the picturing; items never hold render coordinates.

export interface PointItem {
  readonly id: ItemId;
  readonly kind: 'point';
  readonly at: Point2;
  readonly style: PointStyle;
}

/** A geodesic: either the segment a → b or a whole wall (clipped to view). */
export type GeodesicSource =
  | { readonly type: 'segment'; readonly a: Point2; readonly b: Point2 }
  | { readonly type: 'line'; readonly wall: Hyperplane };

export interface GeodesicItem {
  readonly id: ItemId;
  readonly kind: 'geodesic';
  readonly source: GeodesicSource;
  readonly style: StrokeStyle;
}

/**
 * A metric circle of finite intrinsic radius (incircles are the first
 * customer) — honestly sampled via exp, NOT a jacobian ellipse.
 */
export interface CircleItem {
  readonly id: ItemId;
  readonly kind: 'circle';
  readonly center: Point2;
  /** Intrinsic radius. */
  readonly radius: number;
  readonly style: RegionStyle;
}

/**
 * A geodesic polygon: vertices in cyclic order (Polytope.vertices in 2D);
 * the boundary follows the geodesic edges, curved in conformal charts.
 */
export interface PolygonItem {
  readonly id: ItemId;
  readonly kind: 'polygon';
  readonly vertices: readonly Point2[];
  readonly style: RegionStyle;
}

/**
 * The chart's own image region — "the geometry itself" (V2). The model's
 * `domain` field supplies all the geometry, so the item carries only style:
 * disk domains shade the disk and rim its boundary circle; plane domains
 * shade the whole frame (the chart's image is the plane), rim ignored.
 *
 * The rim width is in PX — the one exception to intrinsic styling, same
 * exception and same reason as sphereview's globe rim: the disk boundary is
 * at infinity (H) or is chart apparatus, so no intrinsic width exists. Like
 * that rim, a domain item is view dressing and IGNORES StyleOverrides.
 */
export interface DomainItem {
  readonly id: ItemId;
  readonly kind: 'domain';
  readonly style: {
    readonly fill?: FillStyle;
    readonly rim?: { readonly color: string; readonly widthPx: number; readonly opacity?: number };
  };
}

export type SceneItem = PointItem | GeodesicItem | CircleItem | PolygonItem | DomainItem;

/** Paint order = list order (immediate mode; there is no z). */
export type Scene = readonly SceneItem[];

// ── Camera and viewport ─────────────────────────────────────────────────────

/**
 * The camera: screen = V ∘ model.project ∘ geom.apply(view, ·). Immutable —
 * interaction produces new cameras; dragging composes reflections into
 * `view`, and content's canonical coordinates never change.
 */
export interface Camera {
  /** The view isometry g, a group element acting on canonical coordinates. */
  readonly view: Isometry2;
  /** V's scale: pixels per render-space unit. */
  readonly scalePx: number;
  /** V's offset: screen position (px) of the render-space origin. */
  readonly centerPx: readonly [number, number];
}

/** The drawing surface's size in px; with V⁻¹ it determines the frame. */
export interface ViewSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

// ── Tolerances ──────────────────────────────────────────────────────────────

/** Adaptive-sampling and culling tolerances, all in px (README defaults). */
export interface RenderTolerances {
  /** Max deviation of the projected polyline from the true curve. */
  readonly flatnessPx: number;
  /** Max half-width change between adjacent outline samples. */
  readonly widthPx: number;
  /** Items with screen extent below this are culled before pathing. */
  readonly cullPx: number;
  /** Bisection cap per curve (≤ 2^maxDepth segments). */
  readonly maxDepth: number;
}

export const DEFAULT_TOLERANCES: RenderTolerances = {
  flatnessPx: 0.25,
  widthPx: 0.25,
  cullPx: 0.5,
  maxDepth: 12,
};

// ── The path list — the seam between geometry and backends ─────────────────

/**
 * One styled filled path in RENDER coordinates (the chart's plane; V not yet
 * applied). Both backends consume this through the same affine viewport, so
 * the SVG export is geometrically identical to the canvas by construction.
 */
export interface RenderPath {
  /** The scene item that produced this path. */
  readonly id: ItemId;
  /**
   * Closed contours, interleaved [x₀, y₀, x₁, y₁, …], filled together under
   * the even-odd rule (so a stroked circle's two offset contours make an
   * annulus). Outlines are already baked: every path is a plain fill.
   */
  readonly contours: readonly Float64Array[];
  readonly color: string;
  /** Resolved: 0–1, no undefined at this layer. */
  readonly opacity: number;
}

/** Paint order = list order. */
export type PathList = readonly RenderPath[];
