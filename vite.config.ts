import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const root = __dirname;
const demosDir = path.resolve(root, 'demos');

const isDemo = (name: string): boolean => fs.existsSync(path.join(demosDir, name, 'main.ts'));

/** The HTML shell for a demo: a full-window canvas loading demos/<name>/main.ts. */
function demoHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — coxeter-viz</title>
  <style>body { margin: 0; overflow: hidden; background: #f7f5f0; }</style>
</head>
<body>
  <script type="module" src="/demos/${name}/main.ts"></script>
</body>
</html>`;
}

/**
 * Serves each demo at /demos/<name>/ without any index.html files on disk — the
 * page is synthesized from demos/<name>/main.ts. The root / shows a clickable
 * index of all demos. `npm run dev <name>` just opens /demos/<name>/.
 */
function demoPages(): Plugin {
  return {
    name: 'demo-pages',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '/').split('?')[0];
        const send = async (html: string) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml(url, html, req.originalUrl));
        };

        if (url === '/' || url === '/index.html') {
          const names = fs.readdirSync(demosDir).filter(isDemo).sort();
          const items = names.map((n) => `<li><a href="/demos/${n}/">${n}</a></li>`).join('');
          await send(
            `<!DOCTYPE html><meta charset="UTF-8"><title>demos</title>` +
              `<body style="font-family:system-ui,sans-serif;background:#f7f5f0;color:#2c2c2c;padding:2rem">` +
              `<h1>coxeter-viz demos</h1><ul style="font-size:1.2rem;line-height:1.8">${items}</ul>`,
          );
          return;
        }

        const m = url.match(/^\/demos\/([^/]+)\/(?:index\.html)?$/);
        if (m && isDemo(m[1])) {
          await send(demoHtml(m[1]));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Relative base so each demo can be hosted at a non-root subpath.
  base: './',
  resolve: {
    alias: { '@': path.resolve(root, './src') },
  },
  plugins: [demoPages()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: 'index.[ext]',
      },
    },
  },
});
