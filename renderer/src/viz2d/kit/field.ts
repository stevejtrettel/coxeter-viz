import type { Point2 } from '@/geometry/types';
import type { Rgba, StarBand, TilingStyle } from '@/viz2d/shader/types';

/**
 * GPU-field style assembly (`viz2d/kit`): the house `TilingStyle` ambience and
 * the field-program builders. The MATH inputs (a coset anchor, a Wythoff seed)
 * come from the library — `parabolicFixedPoint`, `wythoffPoint`; this module
 * only packs them, plus the demo's colors, into a `TilingStyle`.
 */

/** '#rrggbb' → Rgba in [0,1]⁴ for shader uniforms. */
export function rgba(hex: string, a: number): Rgba {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
    a,
  ];
}

/**
 * The house field ambience: quiet parity (cream/white), faint intrinsic edges
 * matching the CPU ambient strokes, no vertex disks — the anonymous group as
 * background under the named elements.
 */
export function fieldStyle(r0: number): TilingStyle {
  return {
    even: [1, 1, 1, 1],
    odd: [0.98, 0.955, 0.905, 1],
    edge: [0.604, 0.553, 0.459, 0.45],
    edgeHalfWidth: 0.0075 * r0,
    vertex: [0, 0, 0, 0],
    vertexRadius: 0,
  };
}

/** A blank base (all layers off): the ground for a pure field program (uniform). */
export function blankStyle(): TilingStyle {
  return { even: [0, 0, 0, 0], odd: [0, 0, 0, 0], edge: [0, 0, 0, 0], edgeHalfWidth: 0, vertex: [0, 0, 0, 0], vertexRadius: 0 };
}

/** One band per wall, colored by index — the Cayley/uniform edge net's bands. */
export function starBands(walls: readonly unknown[], colorOf: (i: number) => Rgba): StarBand[] {
  return walls.map((_, i) => ({ wall: i, color: colorOf(i) }));
}

/** Add the coset fill program (hue = hashHue of the anchor's image). */
export function cosetField(base: TilingStyle, anchor: Point2): TilingStyle {
  return { ...base, coset: { anchor } };
}

/** Add the star band net (Cayley anchored at x₀; uniform edges at the seed). */
export function starField(base: TilingStyle, star: NonNullable<TilingStyle['star']>): TilingStyle {
  return { ...base, star };
}

/** Add the Wythoff region fill program (faces of the seed, colored by type). */
export function regionsField(base: TilingStyle, seed: Point2, colors: readonly Rgba[]): TilingStyle {
  return { ...base, regions: { seed, colors } };
}
