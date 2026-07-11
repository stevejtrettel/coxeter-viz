import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Self-contained sample pages from the figure fixtures (PLAN §7.6 P6):
// dist/lib/{template.html, viewer.js} + tests/fixtures/figures/*.json →
// dist/samples/*.html. This script is ALSO the executable specification of
// what the Python save('.html') does — the same two vendored files, the
// same three function-form string replacements (title / quoted figure
// token / bundle comment token), the same <-escape on the JSON.
// Usage: npm run build:bundle && node scripts/make-samples.mjs

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(path.join(root, 'dist/lib/template.html'), 'utf8');
const viewer = readFileSync(path.join(root, 'dist/lib/viewer.js'), 'utf8');
const outDir = path.join(root, 'dist/samples');
mkdirSync(outDir, { recursive: true });

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fixtureDir = path.join(root, 'tests/fixtures/figures');
for (const file of readdirSync(fixtureDir).filter((f) => f.endsWith('.json'))) {
  const figure = JSON.parse(readFileSync(path.join(fixtureDir, file), 'utf8'));
  figure.title ??= `coxeter-viz — ${file.replace('.json', '')}`;
  const json = JSON.stringify(figure).replace(/</g, '\\u003c');
  const html = template
    .replace('__COXETER_VIZ_TITLE__', () => escapeHtml(figure.title))
    .replace('"__COXETER_VIZ_FIGURE__"', () => json)
    .replace('/*__COXETER_VIZ_BUNDLE__*/', () => viewer);
  writeFileSync(path.join(outDir, file.replace('.json', '.html')), html);
  console.log(`dist/samples/${file.replace('.json', '.html')}`);
}
