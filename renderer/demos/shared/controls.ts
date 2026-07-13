/**
 * Control widgets and file download (`demos/shared`): the small buttons,
 * checkboxes, inputs, the k× selector, the status span, and the blob-download
 * dance every demo otherwise copies. App glue.
 */

/** A small house button. */
export function button(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'font-size:11px;padding:2px 9px;color:#666;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer';
  return b;
}

/** A labelled checkbox; the demo appends `label` and reads `input.checked`. */
export function checkbox(label: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'font-size:12px;color:#555;display:inline-flex;gap:4px;align-items:center';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  wrap.append(input, document.createTextNode(label));
  return { label: wrap, input };
}

/** A monospace text input of the given px width (orders / word entry). */
export function textInput(value: string, widthPx: number): HTMLInputElement {
  const input = document.createElement('input');
  input.value = value;
  input.style.cssText =
    `width:${widthPx}px;font:13px ui-monospace,monospace;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:#fff`;
  return input;
}

/** The export-resolution selector: 1× / 2× / 4× / 8×, default 2×. */
export function kSelect(): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.style.cssText = 'font-size:12px;padding:2px;border:1px solid #ccc;border-radius:3px;background:#fff';
  for (const k of [1, 2, 4, 8]) {
    const opt = document.createElement('option');
    opt.value = String(k);
    opt.textContent = `${k}×`;
    sel.appendChild(opt);
  }
  sel.value = '2';
  return sel;
}

/** The grey status/feedback span. */
export function statusText(): HTMLSpanElement {
  const s = document.createElement('span');
  s.style.cssText = 'font-size:12px;color:#777';
  return s;
}

/** Trigger a browser download of `blob` as `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Download an SVG string as a file. */
export function downloadSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename);
}

/** The "N × N px (M MP)" export-size readout for the k selector; '' at size 0. */
export function exportSizeLabel(sizePx: number, k: number): string {
  if (!sizePx) return '';
  const d = Math.round(sizePx * k);
  return `${d} × ${d} px (${((d * d) / 1e6).toFixed(1)} MP)`;
}
