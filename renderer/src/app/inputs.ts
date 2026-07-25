/**
 * Variable fields — the engine side of "leave a field open" (Python's
 * `cx.variable` / `Figure.specify`). A figure document may leave ANY field a
 * VARIABLE, recorded in place as a hole `{ "variable": <kind>, "default"? }`.
 * The `.html` explorer turns each hole into a live input and, on every edit,
 * fills the holes back in to get an ordinary CONCRETE document, which it
 * renders the ordinary way.
 *
 * So the render path (`checkFigure` → `assemble` → `render`) never learns
 * about holes: they are resolved UPSTREAM, here, exactly as Python's `.specify`
 * resolves them upstream of the document. These are pure data transforms — no
 * DOM, no rendering — the counterpart the page script calls.
 *
 * A hole may sit anywhere: the whole `group`, or a nested field like a layer's
 * `extent.depth`. `kind` is the one vocabulary shared with the page (how to
 * render/parse the input) and with `build` below (how a value becomes the
 * concrete field). Adding a field kind is adding one KINDS entry (+ the page's
 * parser).
 */

/** A hole in the document: a field left variable, optionally with a default. */
interface Hole {
  variable: string;
  default?: unknown;
}

function asHole(v: unknown): Hole | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'variable' in v
    ? (v as Hole)
    : null;
}

/**
 * The field kinds: for each, how it reads on screen (`label`) and how an input
 * value becomes the concrete field value (`build`). The page owns the inverse
 * (text → value); these two must agree on the value's shape.
 *   - `polygon` — a vertex-order sequence; the value is the group presentation.
 *   - `depth`   — a word-length; the value is the number itself.
 */
const KINDS: Record<string, { label: string; build: (value: unknown) => unknown }> = {
  polygon: { label: 'polygon', build: (value) => ({ polygon: value }) },
  depth: { label: 'depth', build: (value) => value },
};

type Path = (string | number)[];
interface Located {
  path: Path;
  kind: string;
  default?: unknown;
}

/** Every hole in the tree, in document order, with its path. A hole is a leaf:
 * we record it and do NOT recurse into it (its `default` is a value, not more
 * document). */
function findHoles(node: unknown, path: Path, out: Located[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => findHoles(child, [...path, i], out));
    return;
  }
  if (typeof node === 'object' && node !== null) {
    const hole = asHole(node);
    if (hole !== null) {
      out.push({ path, kind: hole.variable, default: hole.default });
      return;
    }
    for (const [key, child] of Object.entries(node)) findHoles(child, [...path, key], out);
  }
}

function setAtPath(root: Record<string, unknown>, path: Path, value: unknown): void {
  let node: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]] as Record<string, unknown>;
  node[path[path.length - 1]] = value;
}

/** One open field of a document — a single input in the explorer. */
export interface InputField {
  /** The field this input fills, as a dotted path id (`"group"`, `"layers.0.extent.depth"`). */
  id: string;
  /** The value's kind — how the page renders and parses the input. */
  kind: string;
  /** A short human label for the input. */
  label: string;
  /** The starting value, if the hole carries a default. */
  default?: unknown;
}

const idOf = (path: Path): string => path.join('.');

/**
 * The document's open fields, in document order — what the page builds its
 * inputs from. An ordinary (fully specified) document has none, so a page for
 * it behaves exactly as before.
 */
export function figureInputs(figure: unknown): InputField[] {
  const holes: Located[] = [];
  findHoles(figure, [], holes);
  return holes.map((h) => ({
    id: idOf(h.path),
    kind: h.kind,
    label: KINDS[h.kind]?.label ?? h.kind,
    default: h.default,
  }));
}

/**
 * Fill the open fields with `values` (keyed by field id) → a concrete document
 * to render. A field absent from `values` falls back to its default; a field
 * with neither stays open (and `render` will refuse it, surfacing the reason).
 *
 * Filling every hole yields an ordinary document, so the version drops from the
 * parametric `"0.3"` back to `"0.2"` (views) / `"0.1"` — what `checkFigure`
 * reads. The input is left untouched; a fresh document is returned.
 */
export function resolveFigure(figure: unknown, values: Record<string, unknown>): unknown {
  if (typeof figure !== 'object' || figure === null || Array.isArray(figure)) return figure;
  const out = JSON.parse(JSON.stringify(figure)) as Record<string, unknown>;

  const holes: Located[] = [];
  findHoles(out, [], holes);
  for (const h of holes) {
    const value = idOf(h.path) in values ? values[idOf(h.path)] : h.default;
    if (value !== undefined && KINDS[h.kind] !== undefined) {
      setAtPath(out, h.path, KINDS[h.kind].build(value));
    }
  }

  // Only a fully concrete document is no longer parametric: report the version
  // the render path knows. Any hole left open keeps '0.3' (render refuses it).
  const remaining: Located[] = [];
  findHoles(out, [], remaining);
  if (remaining.length === 0 && out.version === '0.3') {
    out.version = out.views !== undefined ? '0.2' : '0.1';
  }
  return out;
}
