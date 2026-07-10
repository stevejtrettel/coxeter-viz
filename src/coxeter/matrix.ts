import { classifyPolygon, validatePolygon, type Decoration, type RealizationSpec } from './spec';

/**
 * The inference layer (README, PLAN §7.3): from the abstract group alone —
 * the Coxeter matrix, the public/Python seam — to a RealizationSpec, or a
 * refusal that says why not. A refusal is an ANSWER (a value the caller can
 * report), never a throw; only genuine bugs throw.
 *
 * Acceptance rule: the graph of FINITE entries (walls that meet) is a
 * single n-cycle through all n generators (n = 3: all entries finite — K₃
 * is the 3-cycle). Geometric realizability, not irreducibility, is the
 * criterion: (2,2,m) is a fine compact spherical triangle and is accepted.
 */

/** Symmetric integer matrix, M_ii = 1, orders ≥ 2, −1 the sentinel for ∞ (JSON-safe). */
export type CoxeterMatrix = readonly (readonly number[])[];

export type RefusalReason =
  | 'invalid-matrix'
  | 'rank-too-small'
  | 'non-compact'
  | 'free-product'
  | 'not-2d';

export type MatrixClassification =
  | { kind: 'polygon'; spec: RealizationSpec }
  | { kind: 'refused'; reason: RefusalReason; detail: string };

const INF = -1;

const refuse = (reason: RefusalReason, detail: string): MatrixClassification => ({
  kind: 'refused',
  reason,
  detail,
});

export function classifyCoxeterMatrix(M: CoxeterMatrix): MatrixClassification {
  // — a Coxeter matrix at all? (defensive: the input crosses the JSON seam) —
  if (!Array.isArray(M) || M.length === 0 || M.some((row) => !Array.isArray(row) || row.length !== M.length)) {
    return refuse('invalid-matrix', 'not a (non-empty) square matrix.');
  }
  const n = M.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const m = M[i][j];
      if (typeof m !== 'number' || !Number.isInteger(m)) {
        return refuse('invalid-matrix', `entry M[${i}][${j}] = ${m} is not an integer.`);
      }
      if (i === j && m !== 1) {
        return refuse('invalid-matrix', `M[${i}][${i}] = ${m}: generators are involutions, so the diagonal is 1.`);
      }
      if (i !== j && m !== INF && m < 2) {
        return refuse('invalid-matrix', `M[${i}][${j}] = ${m}: orders are integers ≥ 2, with −1 the sentinel for ∞.`);
      }
      if (M[j][i] !== m) {
        return refuse('invalid-matrix', `asymmetric: M[${i}][${j}] = ${m} but M[${j}][${i}] = ${M[j][i]}.`);
      }
    }
  }

  if (n < 3) {
    return refuse(
      'rank-too-small',
      n === 1
        ? 'rank 1: the chamber of a single reflection is a half-space, not a compact polygon.'
        : 'rank 2: the chamber of a dihedral group is a wedge (a lune on S²), not a compact polygon.',
    );
  }

  // — the finite graph: an edge where the walls meet (2 ≤ M_ij < ∞) —
  const nbrs: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (M[i][j] !== INF) {
        nbrs[i].push(j);
        nbrs[j].push(i);
      }
    }
  }

  // connected components (a disconnected finite graph = a free product)
  const comp = new Array<number>(n).fill(-1);
  let ncomp = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    comp[s] = ncomp;
    const stack = [s];
    while (stack.length > 0) {
      const v = stack.pop()!;
      for (const w of nbrs[v]) {
        if (comp[w] === -1) {
          comp[w] = ncomp;
          stack.push(w);
        }
      }
    }
    ncomp++;
  }
  if (ncomp > 1) {
    const blocks = Array.from(
      { length: ncomp },
      (_, c) => `{${comp.flatMap((cc, i) => (cc === c ? [i] : [])).join(',')}}`,
    );
    return refuse(
      'free-product',
      `the finite-order graph is disconnected: generators split into the blocks ${blocks.join(' ∗ ')} ` +
        'with no relation between them (every cross order ∞) — a free product; walls in different ' +
        'blocks never meet, so there is no compact chamber.',
    );
  }

  // a wall meeting ≥ 3 others cannot bound a polygon
  const branch = nbrs.findIndex((a) => a.length > 2);
  if (branch !== -1) {
    const allFinite = nbrs.every((a) => a.length === n - 1);
    return refuse(
      'not-2d',
      allFinite && n >= 4
        ? `all ${n} walls pairwise meet (every order finite): the chamber of a rank-${n} group has ` +
          'dimension ≥ 3 — not yet implemented.'
        : `wall ${branch} carries finite orders with ${nbrs[branch].length} other walls ` +
          `(${nbrs[branch].join(', ')}), but a polygon wall meets exactly its two neighbors — ` +
          'not a 2D compact chamber.',
    );
  }

  // connected, all degrees ≤ 2: a single cycle or an open chain
  const ends = nbrs.flatMap((a, i) => (a.length < 2 ? [i] : []));
  if (ends.length > 0) {
    return refuse(
      'non-compact',
      `the finite-order graph is an open chain, not a cycle: walls ${ends.join(' and ')} have no ` +
        'finite relation closing the polygon (order ∞ = an ideal vertex or walls that never meet) — ' +
        'a non-compact chamber, deferred in v1.',
    );
  }

  // — the n-cycle: walk it to read off the cyclic wall order —
  const cyclicOrder: number[] = [0];
  let prev = -1;
  let cur = 0;
  while (cyclicOrder.length < n) {
    const next = nbrs[cur].find((w) => w !== prev)!;
    cyclicOrder.push(next);
    prev = cur;
    cur = next;
  }

  const decorations: Decoration[] = cyclicOrder.map((a, k) => {
    const b = cyclicOrder[(k + 1) % n];
    return { walls: [a, b] as [number, number], order: M[a][b] };
  });
  const geometry = classifyPolygon(decorations.map((d) => d.order));
  const spec: RealizationSpec = {
    geometry,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder },
    decorations,
  };
  validatePolygon(spec); // by construction; kept as an executable postcondition (a throw here is a bug)
  return { kind: 'polygon', spec };
}
