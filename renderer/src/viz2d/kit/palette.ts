/**
 * The house palette (`viz2d/kit`): every color a demo uses, named once. A demo
 * chooses FROM these; it does not invent hexes. Grouped by role; the generator
 * colors are indexed by generator (= wall = word letter) exactly as everywhere.
 */

/** Generator/wall colors by index — the first three, and the extended six. */
export const GEN_COLORS = ['#c0392b', '#27ae60', '#2f6fb7'] as const;
export const WALL_COLORS = ['#c0392b', '#27ae60', '#2f6fb7', '#8e44ad', '#d68910', '#16a085'] as const;

/** Tile fill by word-length parity (identity emphasized). */
export const TILE = { identity: '#f6d9a0', even: '#f2e3c4', odd: '#ffffff' } as const;

/** A categorical coset palette, cycled over coset ordinals (wordlists). */
export const COSET_COLORS = [
  '#f4d6a0', '#bfe3c0', '#bcd6f0', '#f0c4c4', '#ddc9ec', '#f2e2b8',
  '#c8e6e0', '#e6cdb8', '#ccd9f2', '#e0e4bb', '#e8c7dd', '#c9e0f4',
] as const;

/** One soft color per Wythoff face type (uniform). */
export const TYPE_COLORS = ['#f2e3c4', '#cfe0ee', '#d5e8d0'] as const;

/** The fundamental domain highlight, and a word-list patch over it (tilings). */
export const FD = '#f6d9a0';
export const LIST = '#d15954';

/** Accents. */
export const HOVER = '#ffb454';
export const ENTRY = '#e84a5f';
export const HULL = '#2f6fb7';
export const HULL_TILES = '#8e44ad';

/** Neutrals: the page, the chart dressing, the tile/ambient edge strokes. */
export const GREY = {
  page: '#f7f5f0',
  domain: '#fbf9f3',
  rim: '#bbbbbb',
  tileEdge: '#7a6a4a',
  ambientEdge: '#9a8d75',
} as const;
