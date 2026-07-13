import { build } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The library bundle (PLAN §7.6 P6, §7.8): src/app/index.ts → ONE
// self-contained IIFE `viewer.js` exposing `window.coxeterViz`, built plus
// its page template STRAIGHT into the Python package at the repo root
// (`src/coxeter_groups/viz/_static/`, committed) — the only destination
// that matters; Python is the product interface (user ruling 2026-07-11).
// Usage: npm run build:bundle  (from renderer/)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // renderer/
const outDir = path.resolve(root, '..', 'src/coxeter_groups/viz/_static'); // repo root

await build({
  configFile: false,
  root,
  logLevel: 'info',
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  build: {
    lib: {
      entry: path.resolve(root, 'src/app/index.ts'),
      name: 'coxeterViz',
      formats: ['iife'],
      fileName: () => 'viewer.js',
    },
    outDir,
    emptyOutDir: true,
  },
});

copyFileSync(path.resolve(root, 'src/app/template.html'), path.resolve(outDir, 'template.html'));
console.log('→ src/coxeter_groups/viz/_static/{viewer.js, template.html}');
