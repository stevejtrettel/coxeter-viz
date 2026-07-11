import { build } from 'vite';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The library bundle (PLAN §7.6 P6): src/app/index.ts → ONE self-contained
// IIFE `dist/lib/viewer.js` exposing `window.coxeterViz`, plus the page
// template beside it — exactly the two files the Python package vendors.
// Usage: npm run build:bundle

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
console.log('→ dist/lib/viewer.js + dist/lib/template.html');
