# `coxeter_groups.compute` — symbolic Coxeter computation

The research half of the package (PLAN §12): groups, elements, and word
lists as pure group theory. It does **no drawing** and imports nothing from
`viz`; the two halves meet only at plain data (a Coxeter matrix, word
lists).

## `rep.py` — the reflection representation and the element key

Elements are **words** (lists of generator indices), and they are
non-unique: many words spell the same element. The one thing we must decide
is **"are two words the same element?"** — the word problem. We answer it
representation-theoretically, via faithful matrices.

**The Tits reflection representation.** From the Coxeter matrix `M` (rank
`n`), build the symmetric bilinear form

    B[i][j] = −cos(π / M[i][j])

(the `−1` sentinel = ∞ gives `B = −cos 0 = −1`; the diagonal `M[i][i] = 1`
gives `B = −cos π = 1`, so the formula is uniform). Each generator acts on
`Rⁿ` (basis = the simple roots) by the reflection

    σᵢ(v) = v − 2·B(αᵢ, v)·αᵢ,

an `n×n` matrix that is the identity except in row `i`, which is
`row_i[j] = δᵢⱼ − 2·B[i][j]`. By **Tits' theorem this representation is
faithful** for every Coxeter group (spherical, Euclidean, hyperbolic
alike), so it decides the word problem correctly.

**word → matrix** composes the generators in the renderer's left-to-right
order — word `[i₀,…,i_k]` applies `σ_{i₀}` first, so its matrix is
`σ_{i_k}···σ_{i₀}` (`for i in word: g = σᵢ @ g`). This matches the
convention words carry across the seam to the renderer, so a word means the
same element on both sides.

**The key.** An element's identity is its matrix, **quantized** — each
entry rounded to a fixed number of decimals — so that two words for the
same element (whose matrices agree to float noise) produce the *same*
hashable key, while distinct elements (whose matrices differ by `O(1)`)
produce different keys. This is exactly the renderer's `matrixKey` idea, in
Python.

`key(word₁) == key(word₂)  ⟺  word₁ and word₂ are the same group element.`

Everything downstream is thin on top of this: `Element` (`==`/`hash` by
key, plus `len`/`descents`), `ball`/`sphere` (BFS deduped by key), and
`WordSet` set-operations.

## `group.py` — `CoxeterGroup`, the root

Built from a Coxeter matrix (validated: square, symmetric, diagonal 1,
off-diagonal `≥ 2` or `−1`). Holds the matrix, the rank, and the
`ReflectionRep`. It is the factory for elements (`g.element(word)`,
`g.identity()`, `g.generators`) and enumerates by **word length**:
`g.sphere(n)` (length exactly `n`) and `g.ball(n)` (length `≤ n`), a BFS
from the identity deduped by key — the combinatorial ball, distinct from
the renderer's geometric metric ball. (`g.words(…)` makes a `WordSet`.) Its
`coxeter_matrix` attribute is the seam handoff — `viz.figure(g)` reads it
(duck-typed, so `viz` never imports `compute`).

## `element.py` — `Element`, the rich atom

An element is a **word** plus its group, with the matrix and key cached. It
behaves like a group element and is hashable by its key, so Python `set`/
`dict` deduplicate elements for free.

- `a * b` — the product, defined so that **`g.element(u + v) == g.element(u)
  * g.element(v)`**: multiplication is word concatenation (matrix
  `b.matrix @ a.matrix`, since `word_matrix` reverses under concatenation).
- `a.inverse()` — the inverse, spelled by the reversed word.
- `a == b`, `hash(a)` — by key (same group + same key). Distinct spellings
  of one element are one element.
- `len(a)` — the word length `ℓ(a)` (of a *reduced* word, not the stored
  spelling): greedily strip right descents until the identity.
- `a.descents()` — the **right** descent set `{i : a·αᵢ is a negative
  root}` = `{i : column i of a's matrix is all ≤ 0}`. Descents are the
  gateway to length, reduced words, and (later) Bruhat order.

## `wordset.py` — `WordSet`, a set of elements

A light, immutable wrapper over a `frozenset[Element]` plus its group; every
method returns a new set. Made from `g.words(items)` (words or elements), or
returned by `g.ball`/`g.sphere`.

- `ws.invert()` — `{e⁻¹}`; `ws.shift(by)` — `{e·by}` (the set translated
  rigidly by the isometry `by`).
- `ws | other`, `ws & other`, `ws - other` — union / intersection /
  difference. **Exact**, because `Element` has real equality — the
  operations the word-list sugar could not do (e.g. `ball(3) − ball(2) ==
  sphere(3)`).
- `e in ws` (element or word), `len`, iteration.
- `ws.words()` — the plain `list[list[int]]` the renderer draws, in a
  deterministic order. The drawing ops accept a `WordSet` directly
  (`figure(g).tiles(ws)`), so this is mostly an escape hatch.

## Deliberate, revisitable choices

- **Float + tolerance, not exact** (user ruling 2026-07-13). `B` uses
  `math.cos`, so the key is a rounded float tuple. This is correct in
  practice but a known long-term liability: element equality can go wrong at
  a rounding boundary. The intended upgrade is exact arithmetic — integer
  matrices for the crystallographic angles (`m ∈ {2,3,4,6,∞}`), algebraic
  numbers / `ℤ[2cos(π/m)]` in general.
- **Pure stdlib, no numpy.** Matrices are tiny (rank 3–4) and are plain
  tuples of floats; this keeps the package dependency-free (like `viz`) and
  the rounded-tuple key is natural. Revisit if profiling or the exact-
  arithmetic upgrade wants a numeric library.
