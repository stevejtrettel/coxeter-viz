import type { FillStyle, PointStyle, RegionStyle, StrokeStyle, StyleOverride } from './types';

/**
 * Style resolution: merge a per-frame `StyleOverride` field-by-field over an
 * item's own style, producing a fully-resolved style (no `undefined`
 * opacities) for the builder. Pure — no geometry. Highlighting is exactly a
 * `StyleOverrides` entry resolved here; the scene is never mutated.
 */

function resolvedOpacity(base: number | undefined, ov?: StyleOverride): number {
  return ov?.opacity ?? base ?? 1;
}

export function resolveStroke(sty: StrokeStyle, ov?: StyleOverride): StrokeStyle & { opacity: number } {
  return {
    color: ov?.color ?? sty.color,
    width: ov?.width ?? sty.width,
    opacity: resolvedOpacity(sty.opacity, ov),
    dash: sty.dash,
  };
}

export function resolvePoint(sty: PointStyle, ov?: StyleOverride): PointStyle & { opacity: number } {
  return {
    color: ov?.color ?? sty.color,
    radius: ov?.radius ?? sty.radius,
    opacity: resolvedOpacity(sty.opacity, ov),
  };
}

export interface ResolvedRegion {
  fill?: FillStyle & { opacity: number };
  edge?: StrokeStyle & { opacity: number };
}

/**
 * Region merge: `null` on an override's fill/edge suppresses that part; a
 * provided FillStyle/StrokeStyle replaces it; the flat color/opacity/width
 * fields then recolor/resize whatever parts remain.
 */
export function resolveRegion(sty: RegionStyle, ov?: StyleOverride): ResolvedRegion {
  const fillBase = ov?.fill === null ? undefined : (ov?.fill ?? sty.fill);
  const edgeBase = ov?.edge === null ? undefined : (ov?.edge ?? sty.edge);
  const out: ResolvedRegion = {};
  if (fillBase) {
    out.fill = {
      color: ov?.color ?? fillBase.color,
      opacity: resolvedOpacity(fillBase.opacity, ov),
    };
  }
  if (edgeBase) {
    out.edge = {
      color: ov?.color ?? edgeBase.color,
      width: ov?.width ?? edgeBase.width,
      opacity: resolvedOpacity(edgeBase.opacity, ov),
      dash: edgeBase.dash,
    };
  }
  return out;
}
