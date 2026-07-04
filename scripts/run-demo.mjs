import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

// Usage:
//   npm run dev <demo> [<demo> ...]      one Vite dev server per demo, on
//                                        consecutive ports (5173, 5174, …), so
//                                        several demos run at once. Demo pages are
//                                        synthesized by the demoPages() plugin —
//                                        there are no index.html files on disk.
//   npm run build <demo> [<demo> ...]    build each into dist/<demo> (sequential)
//   npm run preview <demo> [<demo> ...]  preview each built demo, one port each

const [, , mode, ...demos] = process.argv;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!demos.length) {
  console.error(`Usage: npm run ${mode ?? '<dev|build|preview>'} <demo> [<demo> ...]`);
  process.exit(1);
}
for (const demo of demos) {
  if (!existsSync(path.join(root, 'demos', demo, 'main.ts'))) {
    console.error(`Demo not found: demos/${demo}/main.ts`);
    process.exit(1);
  }
}

const BASE_PORT = 5173;

/** Is `port` free? Bind on all interfaces so an IPv6 (::1) holder is also detected. */
function isFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port); // no host → all interfaces (catches both 127.0.0.1 and ::1)
  });
}

/** Find `count` free ports at or above `start`, skipping any already in use. */
async function findFreePorts(count, start) {
  const ports = [];
  for (let p = start; ports.length < count && p < start + 500; p++) {
    if (await isFree(p)) ports.push(p);
  }
  return ports;
}

async function serve() {
  const ports = await findFreePorts(demos.length, BASE_PORT);
  const children = demos.map((demo, i) => {
    const port = ports[i];
    const open = `/demos/${demo}/`;
    // No --strictPort: the found port is a hint; if it's taken at bind time
    // (a race, or our check missed it) Vite quietly moves to the next free one
    // and prints the real URL itself.
    const viteArgs =
      mode === 'preview'
        ? ['preview', '--outDir', `dist/${demo}`, '--port', String(port), '--open', open]
        : ['--port', String(port), '--open', open];
    console.log(`  ${demo}  →  http://localhost:${port}${open}  (see Vite output for the final URL)`);
    return spawn('npx', ['vite', ...viteArgs], { stdio: 'inherit', cwd: root });
  });
  const killAll = () => children.forEach((c) => c.kill('SIGINT'));
  process.on('SIGINT', killAll);
  process.on('SIGTERM', killAll);
}

/**
 * Build each demo into dist/<demo>. Vite's build entry is a root index.html, so
 * we write a throwaway one pointing at the demo's main.ts, build, and delete it
 * — keeping the working tree free of index.html files.
 */
async function build() {
  const indexPath = path.join(root, 'index.html');
  for (const demo of demos) {
    writeFileSync(
      indexPath,
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${demo}</title>` +
        `<style>body{margin:0;overflow:hidden;background:#f7f5f0}</style></head>` +
        `<body><script type="module" src="/demos/${demo}/main.ts"></script></body></html>\n`,
    );
    try {
      const code = await new Promise((resolve) => {
        spawn('npx', ['vite', 'build', '--outDir', `dist/${demo}`], { stdio: 'inherit', cwd: root }).on('exit', resolve);
      });
      if (code) process.exit(code);
    } finally {
      rmSync(indexPath, { force: true });
    }
  }
}

if (mode === 'build') build();
else serve();
