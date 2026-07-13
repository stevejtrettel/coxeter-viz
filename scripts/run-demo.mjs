import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

// Usage:
//   npm run dev <demo> [<demo> ...]      one Vite dev server per demo, on
//                                        consecutive ports (5173, 5174, …), so
//                                        several demos run at once. Demo pages are
//                                        synthesized by the demoPages() plugin —
//                                        there are no index.html files on disk.
//
// Demos are DEV-SERVER-ONLY (PLAN §7.6, repo-identity cleanup): Python is the
// product interface; the only build is `npm run build:bundle`.

const [, , mode, ...demos] = process.argv;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (mode !== 'dev' || !demos.length) {
  console.error('Usage: npm run dev <demo> [<demo> ...]');
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

const ports = await findFreePorts(demos.length, BASE_PORT);
const children = demos.map((demo, i) => {
  const port = ports[i];
  const open = `/demos/${demo}/`;
  // No --strictPort: the found port is a hint; if it's taken at bind time
  // (a race, or our check missed it) Vite quietly moves to the next free one
  // and prints the real URL itself.
  console.log(`  ${demo}  →  http://localhost:${port}${open}  (see Vite output for the final URL)`);
  return spawn('npx', ['vite', '--port', String(port), '--open', open], { stdio: 'inherit', cwd: root });
});
const killAll = () => children.forEach((c) => c.kill('SIGINT'));
process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);
