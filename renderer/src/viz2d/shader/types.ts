import type { Point2 } from '@/geometry/types';

/** An RGBA color in [0,1]⁴. Alpha 0 hides the layer (README, uniforms). */
export type Rgba = readonly [number, number, number, number];

/** One star band: the half-segment anchor → wall `wall`'s foot (README). */
export interface StarBand {
  wall: number;
  color: Rgba;
}

/**
 * The style of the GPU tiling field (README, "the three coloring layers").
 * Widths and radii are INTRINSIC — metric-true dressing, the render2d stroke
 * philosophy — converted to pairing thresholds on the CPU (uniforms.ts).
 */
export interface TilingStyle {
  /** Tile fill by fold parity. */
  even: Rgba;
  odd: Rgba;
  /** Edge bands on the wall images, intrinsic half-width. */
  edge: Rgba;
  edgeHalfWidth: number;
  /** Disks about the vertex images, intrinsic radius. */
  vertex: Rgba;
  vertexRadius: number;
  /** Fold-sweep cap; truncates the far field only (default 200). */
  maxFolds?: number;

  // ── Field programs (README §5.8) — all optional, all arbitrary-depth ──
  /** Fill mode 1: hue = hashHue of the W_S-fixed anchor's image M⁻¹·v. */
  coset?: { anchor: Point2; saturation?: number; lightness?: number };
  /** Star bands over the fill: Cayley edges (anchor x₀) / uniform edges (seed). */
  star?: {
    anchor: Point2;
    halfWidth: number;
    bands: readonly StarBand[];
    node?: { color: Rgba; radius: number };
  };
  /** Fill mode 2: Wythoff face regions of the seed, colored by type. */
  regions?: { seed: Point2; colors: readonly Rgba[] };
}
