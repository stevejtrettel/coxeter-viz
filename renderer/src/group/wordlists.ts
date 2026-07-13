import type { Vec } from '@/math/vec';
import type { Isometry2, Point2 } from '@/geometry/types';
import type { Polytope } from '@/polytope/Polytope';
import { fromVertices2 } from '@/polytope/build';
import { matrixKey, type OrbitElement } from './orbit';
import type { CoxeterGroup } from './CoxeterGroup';

/**
 * Word-list helpers beyond the class (folder README, "Word lists"; M3).
 * Everything here is ELEMENTWISE — word lists were converted to elements
 * upstream (`CoxeterGroup.elements`); no literal word syntax survives to
 * this layer. Also the word-list PARSERS (the abstract input format) and the
 * standard parabolic constructions (dihedral word list, W_S fixed point).
 */

/**
 * The alternating words of the dihedral parabolic ⟨R_i, R_j⟩ (order 2m): the
 * length-k prefixes of iji… and jij… for k = 0…2m−1 enumerate all 2m
 * elements (duplicates collapse in `elements`). The standard patch for coset
 * / hull demos over a vertex dihedral.
 */
export function dihedralWords(i: number, j: number, m: number): number[][] {
  const words: number[][] = [[]];
  for (let k = 1; k <= 2 * m - 1; k++) {
    words.push(Array.from({ length: k }, (_, t) => (t % 2 === 0 ? i : j)));
    words.push(Array.from({ length: k }, (_, t) => (t % 2 === 0 ? j : i)));
  }
  return words;
}

/**
 * The point fixed by the parabolic W_S (the anchor a coset coloring / a GPU
 * coset field hangs on): the base point for S = ∅; the perpendicular foot of
 * the base point on the single wall for |S| = 1; the shared chamber vertex of
 * the two walls for |S| = 2 (a vertex dihedral); null when no such fixed
 * point exists in the chamber (|S| ≥ 3, or a non-adjacent pair). 2D — a pair
 * of walls meets at a vertex.
 */
export function parabolicFixedPoint(
  group: CoxeterGroup<Point2, Isometry2>,
  S: readonly number[],
): Point2 | null {
  if (S.length === 0) return group.basePoint;
  if (S.length === 1) return group.walls[S[0]].foot(group.geom, group.basePoint);
  if (S.length === 2) {
    return (
      group.chamber.vertices.find((q) => S.every((i) => Math.abs(group.walls[i].side(q)) < 1e-7)) ??
      null
    );
  }
  return null;
}

/**
 * Parse a word list in the DOT FORMAT: whitespace/comma/semicolon-separated
 * tokens, each a run of generator indices joined by "." (`0.1.0`), with `e`
 * the identity `[]`. Tokens with an index ≥ rank or bad syntax go to `bad`.
 * The abstract input the group consumes; `CoxeterGroup.elements` turns it
 * into elements.
 */
export function parseWordList(text: string, rank: number): { words: number[][]; bad: string[] } {
  const words: number[][] = [];
  const bad: string[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    if (tok === 'e') {
      words.push([]);
      continue;
    }
    const letters = /^[0-9]+(\.[0-9]+)*$/.test(tok) ? tok.split('.').map(Number) : null;
    if (letters && letters.every((i) => i < rank)) words.push(letters);
    else bad.push(tok);
  }
  return { words, bad };
}

/**
 * Parse a word-list FILE: the Python-friendly JSON form first — an array
 * `[[0,1],…]` or `{ "words": [...] }` of index arrays — else the dot format
 * (`parseWordList`). Malformed JSON entries (non-arrays, indices out of
 * `[0, rank)`) are skipped with a note.
 */
export function parseWordFile(text: string, rank: number): { words: number[][]; errors: string[] } {
  const errors: string[] = [];
  const isWord = (w: unknown): w is number[] =>
    Array.isArray(w) && w.every((i) => Number.isInteger(i) && i >= 0 && i < rank);
  try {
    const json: unknown = JSON.parse(text);
    const list = Array.isArray(json) ? json : (json as { words?: unknown }).words;
    if (Array.isArray(list)) {
      const words = list.filter(isWord) as number[][];
      if (words.length < list.length) errors.push(`${list.length - words.length} malformed entries skipped`);
      return { words, errors };
    }
    errors.push('JSON has no word array');
    return { words: [], errors };
  } catch {
    const { words, bad } = parseWordList(text, rank);
    return { words, errors: bad.length ? [`ignored: ${bad.slice(0, 5).join(' ')}`] : [] };
  }
}

/**
 * Assign each element its LEFT coset gH: g₁ and g₂ share a coset iff
 * g₁⁻¹g₂ ∈ H, computed by keying each coset by the MINIMAL matrix key over
 * its orbit {g·h : h ∈ H} — a canonical representative without inverting
 * anything. Returns element key → coset ordinal (ordinals in first-seen
 * order, so the identity's coset is 0 when the identity leads the list).
 * O(|elements|·|H|) — fine at demo scales; H is assumed completely
 * enumerated (a truncated `subgroup` would fracture cosets).
 */
export function cosetIndex<P extends Vec, I extends Float64Array>(
  group: CoxeterGroup<P, I>,
  subgroup: ReadonlyMap<string, I>,
  elements: readonly OrbitElement<I>[],
): Map<string, number> {
  const cosetOf = new Map<string, number>();
  const ordinals = new Map<string, number>();
  for (const e of elements) {
    let min: string | null = null;
    for (const h of subgroup.values()) {
      const k = matrixKey(group.geom.compose(e.element, h));
      if (min === null || k < min) min = k;
    }
    let id = ordinals.get(min!);
    if (id === undefined) {
      id = ordinals.size;
      ordinals.set(min!, id);
    }
    cosetOf.set(matrixKey(e.element), id);
  }
  return cosetOf;
}

/**
 * The convex hull of the BASE-POINT IMAGES of a word list's elements (the
 * design doc's hull semantics, stated per its rule). 2D: the polytope
 * engine's `fromVertices2` does the geometry; its spherical hemisphere
 * refusal propagates — a hull spanning more than a hemisphere throws, by
 * design. Duplicate spellings collapse upstream in `elements`.
 */
export function hullOfWords(
  group: CoxeterGroup<Point2, Isometry2>,
  words: readonly (readonly number[])[],
): Polytope<Point2> {
  const points = [...group.elements(words).values()].map(({ element }) =>
    group.geom.apply(element, group.basePoint),
  );
  return fromVertices2(group.geom, points);
}

/**
 * The convex hull of the TILE IMAGES a word list denotes (its semantics,
 * stated): tiles are convex, so the hull of their union is the hull of
 * their vertices. Vertices shared between adjacent tiles are deduplicated
 * by a fine quantization before hulling. Same 2D machinery and the same
 * hemisphere refusal as `hullOfWords`.
 */
export function hullOfTiles(
  group: CoxeterGroup<Point2, Isometry2>,
  words: readonly (readonly number[])[],
): Polytope<Point2> {
  const points: Point2[] = [];
  const seen = new Set<string>();
  for (const tile of group.tilesFor(words)) {
    for (const v of tile.polytope.vertices) {
      const k = `${Math.round(v[0] / 1e-9)},${Math.round(v[1] / 1e-9)},${Math.round(v[2] / 1e-9)}`;
      if (!seen.has(k)) {
        seen.add(k);
        points.push(v);
      }
    }
  }
  return fromVertices2(group.geom, points);
}
