/**
 * figure — the product layer's dev harness (PLAN §7.6 P3): the fixture
 * documents from tests/fixtures/figures rendered through the ONE public
 * entry point `render(container, figure)`. Hand-written JSON, no Python.
 * Includes a deliberately refused document to show problems-as-values.
 */

import { button, downloadBlob, downloadSvg, exportSizeLabel, kSelect, pageShell, statusText } from '../shared';
import { render, type RenderHandle } from '@/app/render';

const fixtureModules = import.meta.glob('../../tests/fixtures/figures/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const documents = new Map<string, unknown>(
  Object.entries(fixtureModules).map(([path, doc]) => [path.split('/').pop()!, doc]),
);
documents.set('REFUSED: ideal triangle (2,3,∞)', {
  version: '0.1',
  group: { coxeterMatrix: [[1, 2, -1], [2, 1, 3], [-1, 3, 1]] },
  layers: [{ type: 'tessellation' }],
});

pageShell('figure — render(container, figure) · all eight ops, GPU field live');

const row = document.createElement('div');
row.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:8px';
const select = document.createElement('select');
select.style.cssText = 'font-size:12px;padding:2px;border:1px solid #ccc;border-radius:3px;background:#fff';
for (const name of documents.keys()) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  select.appendChild(opt);
}
const svgBtn = button('SVG');
const pngBtn = button('PNG');
const kSel = kSelect();
const status = statusText();
row.append(select, svgBtn, pngBtn, kSel, status);
document.body.appendChild(row);

const layout = document.createElement('div');
layout.style.cssText = 'display:flex;gap:16px;align-items:flex-start';
const holder = document.createElement('div');
holder.style.cssText = 'width:800px;height:800px;background:#fff;border:1px solid #ddd';
const docView = document.createElement('pre');
docView.style.cssText =
  'font-size:11px;line-height:1.5;background:#fff;border:1px solid #ddd;padding:10px;margin:0;max-width:420px;max-height:800px;overflow:auto';
layout.append(holder, docView);
document.body.appendChild(layout);

let handle: RenderHandle | null = null;

function show(name: string): void {
  handle?.dispose();
  handle = null;
  holder.textContent = '';
  const doc = documents.get(name);
  docView.textContent = JSON.stringify(doc, null, 2);

  const result = render(holder, doc);
  if (!result.ok) {
    const report = document.createElement('pre');
    report.style.cssText = 'font-size:12px;color:#a03030;padding:14px;white-space:pre-wrap';
    report.textContent = result.problems.map((p) => `${p.path || '(document)'}\n  ${p.problem}`).join('\n\n');
    holder.appendChild(report);
    status.textContent = `${result.problems.length} problem(s) — a refusal is a value, not a crash`;
    return;
  }
  handle = result.handle;
  const d = result.handle.diagnostics;
  status.textContent =
    `${d.geometry} · ${d.tileCount} tiles · ${d.cayleyNodeCount} Cayley nodes` +
    (d.pending.length > 0 ? ` · pending (P4): ${d.pending.join(', ')}` : '');
}

const stem = (): string => select.value.replace(/\.json$/, '').replace(/[^a-z0-9-]+/gi, '-');
svgBtn.onclick = () => {
  if (handle) downloadSvg(handle.svg(), `${stem()}.svg`);
};
pngBtn.onclick = () => {
  const k = Number(kSel.value);
  void handle?.png(k).then((blob) => downloadBlob(blob, `${stem()}@${k}x.png`));
  status.textContent = exportSizeLabel(800, k);
};

select.onchange = () => show(select.value);
const requested = new URLSearchParams(location.search).get('doc');
if (requested && documents.has(requested)) select.value = requested;
show(select.value);
