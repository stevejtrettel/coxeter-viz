import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { figureToSvg } from '@/app/export';
import { figureFixtures } from './helpers';

/**
 * GOLDEN SVG FIXTURES (PLAN §7.6 P9): every fixture document's SVG export,
 * byte-for-byte. A published package's pictures must not drift silently —
 * any change to sampling, stroking, culling, merging, ids, or the solver
 * shows up here as a diff to READ, not a surprise in a paper figure.
 *
 * Goldens render at 240 px (compact files, same full pipeline). After an
 * INTENDED change: UPDATE_GOLDEN=1 npm run test — then read the diff.
 *
 * (Byte-stability is per-platform: Math.cos etc. are not bit-pinned across
 * JS engines. These goldens pin THIS machine's toolchain, which is what
 * releases are cut from.)
 */

const GOLDEN_SIZE = { widthPx: 240, heightPx: 240 };
const goldenDir = fileURLToPath(new URL('./fixtures/golden', import.meta.url));

const goldens = import.meta.glob('./fixtures/golden/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const goldenFor = (name: string): string | undefined =>
  Object.entries(goldens).find(([p]) => p.endsWith(`/${name}`))?.[1];

describe('golden SVG exports (P9)', () => {
  it.each(figureFixtures.map(([name]) => [name] as const))('%s matches its golden SVG', (name) => {
    const doc = figureFixtures.find(([n]) => n === name)![1];
    const r = figureToSvg(doc, { size: GOLDEN_SIZE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const goldenName = name.replace('.json', '.svg');
    if (process.env.UPDATE_GOLDEN) {
      mkdirSync(goldenDir, { recursive: true });
      writeFileSync(path.join(goldenDir, goldenName), r.value);
      return;
    }
    const golden = goldenFor(goldenName);
    expect(golden, `${goldenName} missing — run UPDATE_GOLDEN=1 npm run test`).toBeDefined();
    expect(r.value).toBe(golden);
  });
});
