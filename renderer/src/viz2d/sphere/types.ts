import type { Camera, FillStyle } from '@/viz2d/render/types';

/**
 * The sphere view's vocabulary (see README, the spec). Everything else —
 * scene items, styles, tolerances, the path list — is render2d's,
 * unchanged: this view is a third consumer of the same seam.
 */

/** render2d's camera plus the perspective eye distance (in sphere radii). */
export interface SphereCamera extends Camera {
  /** Eye distance d > 1 on the distinguished axis; the visible cap is p₀ > 1/d. */
  readonly eyeDistance: number;
}

/**
 * The translucent globe between the back and front passes. `fill` dims
 * back content by its opacity; `rim` is a px-width ring on the silhouette —
 * view dressing, not scene content (the one exception to intrinsic sizing).
 */
export interface SphereStyle {
  readonly fill?: FillStyle;
  readonly rim?: { readonly color: string; readonly widthPx: number; readonly opacity?: number };
}

export const DEFAULT_SPHERE_STYLE: SphereStyle = {
  fill: { color: '#ffffff', opacity: 0.75 },
  rim: { color: '#999999', widthPx: 1 },
};
