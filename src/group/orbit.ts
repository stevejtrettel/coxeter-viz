/**
 * Enumerating a finitely-generated group of isometries: breadth-first search
 * over words, deduplicated (folder README). Generic over the element type `I`
 * and free-standing — the engine needs only identity / compose / key, nothing
 * Coxeter.
 *
 * Dedup is GEOMETRIC: elements are equal iff their quantized matrix entries
 * agree. Not a combinatorial normal form (no Coxeter automaton); in H the
 * entries grow like cosh(distance), so an absolute quantum can split deep
 * elements — fine at Milestone-1 depths (README, "documented limitation").
 */

export interface GroupOps<I> {
  identity(): I;
  /** The product g·h (h applied first). */
  compose(g: I, h: I): I;
  /** A stable string key identifying an element up to quantization. */
  key(g: I): string;
}

/** An enumerated element: shortest BFS word (left-to-right) + the isometry. */
export interface OrbitElement<I> {
  word: number[];
  element: I;
}

/**
 * All elements reachable by words of length ≤ `maxWord` over `generators`,
 * breadth-first: each element appears once, with the first word that reached
 * it — shortest, ties broken by generator order. `maxCount` is a hard stop
 * (the last shell may come back truncated mid-depth).
 *
 * Appending a letter i to a word applies R_i LAST, so the child of g is
 * compose(generators[i], g) — the new generator on the LEFT (README, "Words
 * and composition").
 */
export function orbit<I>(
  ops: GroupOps<I>,
  generators: I[],
  maxWord: number,
  maxCount = 5000,
): OrbitElement<I>[] {
  const id: OrbitElement<I> = { word: [], element: ops.identity() };
  const seen = new Map<string, OrbitElement<I>>([[ops.key(id.element), id]]);

  let frontier = [id];
  for (let depth = 1; depth <= maxWord && frontier.length > 0; depth++) {
    const next: OrbitElement<I>[] = [];
    for (const e of frontier) {
      for (let i = 0; i < generators.length; i++) {
        const h = ops.compose(generators[i], e.element);
        const k = ops.key(h);
        if (seen.has(k)) continue;
        const child: OrbitElement<I> = { word: [...e.word, i], element: h };
        seen.set(k, child);
        next.push(child);
        if (seen.size >= maxCount) return [...seen.values()];
      }
    }
    frontier = next; // empties when the group is exhausted at this depth
  }
  return [...seen.values()];
}

/**
 * The quantized-entry dedup key for a flat row-major matrix: entries rounded
 * to `quantum`, joined. Larger quantum merges more aggressively. (Template
 * interpolation renders a rounded −0 as "0", so the key is sign-stable at
 * zero.)
 */
export function matrixKey(m: Float64Array, quantum = 1e-5): string {
  let s = '';
  for (let i = 0; i < m.length; i++) s += `${Math.round(m[i] / quantum)},`;
  return s;
}
