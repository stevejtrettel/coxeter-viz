import type { CoxeterMatrix } from '@/coxeter/matrix';

/**
 * The figure document (README, PLAN §7.4): the versioned JSON contract.
 * Pure abstract data — a Coxeter matrix, layer descriptions, word lists —
 * with no geometry anywhere; the engine infers the geometry. All indices
 * are GENERATOR indices (the matrix row order); words apply left to right.
 * Lengths are intrinsic, in units of the chamber inradius r₀.
 */

export type ModelName = 'auto' | 'poincare' | 'klein' | 'cartesian' | 'gnomonic' | 'stereographic';

/** How much to draw: a metric ball (default form) or a word-length depth (expert). */
export type Extent = { ball: number } | { depth: number };

/** A tile coloring: a named map, or one constant color. */
export type ColorSpec = { map: 'parity' | 'hue' } | { constant: string };

export interface DomainLayer {
  type: 'domain';
  fill?: string;
}
export interface WallsLayer {
  type: 'walls';
  width?: number; // × r₀
  colors?: string[]; // one per generator
}
export interface TessellationLayer {
  type: 'tessellation';
  extent?: Extent; // omitted = cover the frame
  color?: ColorSpec;
  opacity?: number;
  /**
   * Stroke the tiling's edges, colored by PANEL TYPE — the generator index i
   * the edge is a translated mirror of (its reflection is conjugate to s_i).
   * `colors[i]` per generator (defaults to the house wall colors); width × r₀.
   * The edges are drawn for the enumerated tiles (like Cayley edges / walls),
   * even when a GPU field paints the fill to pixel depth beneath them.
   */
  edges?: { width?: number; colors?: string[] };
}
export interface CayleyLayer {
  type: 'cayley';
  extent?: Extent;
  node?: { size?: number; color?: string }; // size × r₀
  edge?: { width?: number }; // × r₀; edges are colored by generator
}
export interface TilesLayer {
  type: 'tiles';
  /** Each word w names THE TILE w·(FD). */
  words: number[][];
  fill?: string;
}
export interface HullLayer {
  type: 'hull';
  /** The hull of the base-point images w·x₀ (straight chart). */
  words: number[][];
  fill?: string;
  stroke?: string;
}
export interface CosetsLayer {
  type: 'cosets';
  /**
   * Generator indices of the parabolic W_S; left cosets get one color each
   * through the SHARED hashHue law (CPU/SVG/GPU agree bit-exactly — there
   * is no palette knob, by design). S must admit a W_S-fixed anchor:
   * ∅, one generator, or a meeting pair (else W_S is infinite / anchorless
   * and validation refuses).
   */
  subgroup: number[];
  extent?: Extent;
}
export interface UniformLayer {
  type: 'uniform';
  /**
   * Ringed generator indices (≥ 1) — the Wythoff seed; faces colored by
   * type. Triangle chambers (rank 3) only.
   */
  rings: number[];
  palette?: string[];
}

export type Layer =
  | DomainLayer
  | WallsLayer
  | TessellationLayer
  | CayleyLayer
  | TilesLayer
  | HullLayer
  | CosetsLayer
  | UniformLayer;

/**
 * The group, by presentation (exactly one):
 * - `coxeterMatrix` — the abstract group; the uniform discover-representation path.
 * - `polygon` — the 2D polygon presentation (PLAN §10, the default 2D input):
 *   a cyclic list of vertex orders, entry k = the order of s_k·s_{k+1 mod n};
 *   the list position IS the generator index, verbatim.
 */
export type GroupPresentation = { coxeterMatrix: CoxeterMatrix } | { polygon: readonly number[] };

export interface Figure {
  version: '0.1';
  /** Optional display title: the saved page's browser-tab title, export filenames. */
  title?: string;
  group: GroupPresentation;
  model: ModelName; // defaulted to 'auto' by checkFigure
  layers: Layer[];
}

/** One thing wrong with a document, located by a dotted path into it. */
export interface FigureProblem {
  /** Where: "layers[2].words[0][3]", "group.coxeterMatrix", "version". */
  path: string;
  /** The structural or mathematical reason, human-readable. */
  problem: string;
}

/** Validation is a value, never a throw (house ruling 2026-07-10). */
export type FigureCheck = { ok: true; figure: Figure } | { ok: false; problems: FigureProblem[] };
