/**
 * Unspecified fields — the engine side of the "leave a field open" idea
 * (Python's `cx.unspecified` / `Figure.specify`). A figure document may leave
 * a field OPEN, recorded as a hole `{ "unspecified": <kind>, "default"? }`;
 * the `.html` explorer turns each hole into a live input and, on every edit,
 * fills the holes back in to get an ordinary CONCRETE document, which it
 * renders the ordinary way.
 *
 * So the render path (`checkFigure` → `assemble` → `render`) never learns
 * about holes: the hole is resolved UPSTREAM, here, exactly as Python's
 * `.specify` resolves it upstream of the document. These are pure data
 * transforms — no DOM, no rendering — the counterpart the page script calls.
 *
 * Today only the top-level `group` is openable (kind `"polygon"`); the shape
 * generalizes to any field we later open.
 */

/** A hole in the document: a field left unspecified, optionally with a default. */
interface Hole {
  unspecified: string;
  default?: unknown;
}

function asHole(v: unknown): Hole | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'unspecified' in v
    ? (v as Hole)
    : null;
}

/** One open field of a document — a single input in the explorer. */
export interface InputField {
  /** The field this input fills (today only `"group"`). */
  id: string;
  /** The value's kind — how the page renders and parses the input. */
  kind: 'polygon';
  /** A short human label for the input. */
  label: string;
  /** The starting value, if the hole carries a default. */
  default?: unknown;
}

/**
 * The document's open fields, in a stable order — what the page builds its
 * inputs from. An ordinary (fully specified) document has none, so a page for
 * it behaves exactly as before.
 */
export function figureInputs(figure: unknown): InputField[] {
  const fields: InputField[] = [];
  if (typeof figure === 'object' && figure !== null && 'group' in figure) {
    const hole = asHole((figure as { group: unknown }).group);
    if (hole !== null && hole.unspecified === 'polygon') {
      fields.push({ id: 'group', kind: 'polygon', label: 'polygon', default: hole.default });
    }
  }
  return fields;
}

/**
 * Fill the open fields with `values` (keyed by field id) → a concrete document
 * to render. A field absent from `values` falls back to its default; a field
 * with neither stays open (and `render` will refuse it, surfacing the reason).
 *
 * Filling a hole yields an ordinary document, so the version drops from the
 * parametric `"0.3"` back to `"0.2"` (views) / `"0.1"` — what `checkFigure`
 * reads. The input is left untouched; a fresh object is returned.
 */
export function resolveFigure(figure: unknown, values: Record<string, unknown>): unknown {
  if (typeof figure !== 'object' || figure === null || Array.isArray(figure)) return figure;
  const out: Record<string, unknown> = { ...(figure as Record<string, unknown>) };

  let filledAny = false;
  const hole = asHole(out.group);
  if (hole !== null && hole.unspecified === 'polygon') {
    const value = 'group' in values ? values.group : hole.default;
    if (value !== undefined) {
      out.group = { polygon: value };
      filledAny = true;
    }
  }

  // A concrete document is no longer parametric: report the version the render
  // path knows. (Only reachable once every hole this call fills is concrete.)
  if (filledAny && out.version === '0.3') {
    out.version = out.views !== undefined ? '0.2' : '0.1';
  }
  return out;
}
