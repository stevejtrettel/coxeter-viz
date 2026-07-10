import { describe, expect, it } from 'vitest';
import { assemble } from '@/app/assemble';
import { checkFigure } from '@/schema/validate';
import type { Figure } from '@/schema/types';
import type { ViewSize } from '@/viz2d/render/types';

const fixtureModules = import.meta.glob('./fixtures/figures/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const checked = (doc: unknown): Figure => {
  const r = checkFigure(doc);
  if (!r.ok) throw new Error(`fixture does not validate: ${JSON.stringify(r.problems)}`);
  return r.figure;
};
const fixture = (name: string): Figure => {
  const entry = Object.entries(fixtureModules).find(([p]) => p.endsWith(`/${name}`));
  if (!entry) throw new Error(`no fixture ${name}`);
  return checked(entry[1]);
};

const SIZE: ViewSize = { widthPx: 800, heightPx: 800 };

describe('app/assemble (P3): checked figure → scene + camera', () => {
  it('assembles the (2,3,7) tessellation fixture: tiles + walls, camera auto-fit', () => {
    const a = assemble(fixture('tessellation.json'), SIZE);
    expect(a.diagnostics.geometry).toBe('hyperbolic');
    expect(a.diagnostics.pending).toEqual([]);
    expect(a.diagnostics.tileCount).toBeGreaterThan(50);
    const ids = a.scene.map((i) => i.id);
    expect(ids.filter((id) => id.startsWith('tile:'))).toHaveLength(a.diagnostics.tileCount);
    expect(ids).toContain('wall:0');
    expect(ids).toContain('wall:2');
    expect(new Set(ids).size).toBe(ids.length); // the id scheme stays collision-free
    expect(a.camera.centerPx).toEqual([400, 400]);
    expect(a.camera.scalePx).toBeGreaterThan(0);
  });

  it('assembles the (2,4,4) cayley fixture: generator-labelled edges + nodes', () => {
    const a = assemble(fixture('cayley.json'), SIZE);
    expect(a.diagnostics.geometry).toBe('euclidean');
    expect(a.diagnostics.cayleyNodeCount).toBeGreaterThan(10);
    const ids = a.scene.map((i) => i.id);
    expect(ids.some((id) => id.startsWith('cay:'))).toBe(true);
    expect(ids.some((id) => id.startsWith('cayedge:'))).toBe(true);
  });

  it('collects unwired ops as pending — assembly never throws on a checked document', () => {
    const a = assemble(fixture('tiles-hull.json'), SIZE);
    expect(a.diagnostics.pending).toEqual(['tiles', 'hull']);
    expect(a.diagnostics.tileCount).toBeGreaterThan(0); // the depth-10 tessellation still assembled
  });

  it('an omitted extent covers the frame (the adaptive coverage radius)', () => {
    const a = assemble(
      checked({
        version: '0.1',
        group: { coxeterMatrix: [[1, 2, 7], [2, 1, 3], [7, 3, 1]] },
        layers: [{ type: 'tessellation' }],
      }),
      SIZE,
    );
    expect(a.diagnostics.tileCount).toBeGreaterThan(100);
  });

  it('an omitted extent exhausts a spherical group: (2,3,5) has exactly 120 tiles', () => {
    const a = assemble(
      checked({
        version: '0.1',
        group: { coxeterMatrix: [[1, 2, 5], [2, 1, 3], [5, 3, 1]] },
        layers: [{ type: 'tessellation' }],
      }),
      SIZE,
    );
    expect(a.diagnostics.tileCount).toBe(120);
  });

  it('honors the domain fill and a constant tile color', () => {
    const a = assemble(
      checked({
        version: '0.1',
        group: { coxeterMatrix: [[1, 2, 7], [2, 1, 3], [7, 3, 1]] },
        layers: [
          { type: 'domain', fill: '#123456' },
          { type: 'tessellation', extent: { depth: 2 }, color: { constant: '#abcdef' } },
        ],
      }),
      SIZE,
    );
    const domain = a.scene.find((i) => i.kind === 'domain');
    expect(domain && domain.kind === 'domain' && domain.style.fill?.color).toBe('#123456');
    const tile = a.scene.find((i) => i.kind === 'polygon');
    expect(tile && tile.kind === 'polygon' && tile.style.fill?.color).toBe('#abcdef');
  });
});
