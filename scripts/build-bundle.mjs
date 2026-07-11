import { build } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The library bundle (PLAN §7.6 P6, §7.8): src/app/index.ts → ONE
// self-contained IIFE `dist/lib/viewer.js` exposing `window.coxeterViz`,
// plus the page template beside it — AND both vendored into the Python
// package (`python/src/coxeter_viz/_static/`, committed), so the repo is
// always pip-installable. Usage: npm run build:bundle

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, 'dist/lib');

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

// Vendor into the Python package (the wheel ships these two files).
const staticDir = path.resolve(root, 'python/src/coxeter_viz/_static');
mkdirSync(staticDir, { recursive: true });
for (const f of ['viewer.js', 'template.html']) {
  copyFileSync(path.resolve(outDir, f), path.resolve(staticDir, f));
}
console.log('→ dist/lib/{viewer.js, template.html} → python/src/coxeter_viz/_static/');
