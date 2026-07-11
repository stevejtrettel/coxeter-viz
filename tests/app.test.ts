import { describe, expect, it } from 'vitest';
import { assemble } from '@/app/assemble';
import { figureToSvg } from '@/app/export';
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

  it('assembles tiles + hull (P4): named tiles, hull polygon, Gauss–Bonnet area', () => {
    const a = assemble(fixture('tiles-hull.json'), SIZE);
    expect(a.diagnostics.pending).toEqual([]);
    const ids = a.scene.map((i) => i.id);
    expect(ids).toContain('list:1:e'); // the identity's tile in the words list (layer 1)
    expect(ids).toContain('list:1:1.2.1');
    expect(ids).toContain('hull:2');
    expect(a.diagnostics.hullAreas).toHaveLength(1);
    expect(a.diagnostics.hullAreas[0]).toBeGreaterThan(0);
    // (2,3,7): the hull of the ⟨s₁,s₂⟩ orbit of x₀ is a hexagon
    const hull = a.scene.find((i) => i.id === 'hull:2');
    expect(hull && hull.kind === 'polygon' && hull.vertices.length).toBe(6);
  });

  it('assembles cosets (P4): tiles hued by the SHARED hashHue of the anchor image', () => {
    const a = assemble(fixture('cosets-pentagon.json'), SIZE);
    expect(a.diagnostics.pending).toEqual([]);
    expect(a.diagnostics.field).toBe(true); // cosets is field-paintable
    expect(a.field?.coset).toBeDefined();
    expect(a.overlay).not.toBeNull();
    // cosets of ⟨s₁,s₂⟩ (order 4): tiles in one coset share one color;
    // they are the field's vector twin, so they carry field:tile: ids
    const tiles = a.scene.filter((i) => i.kind === 'polygon' && i.id.startsWith('field:tile:'));
    expect(tiles.length).toBeGreaterThan(10);
    const colors = new Set(tiles.map((t) => t.kind === 'polygon' && t.style.fill?.color));
    expect(colors.size).toBeLessThan(tiles.length); // strictly fewer colors than tiles
    expect(colors.size).toBeGreaterThan(2);
  });

  it('assembles uniform (P4): Wythoff cells colored by type, regions field program', () => {
    const a = assemble(fixture('uniform.json'), SIZE);
    expect(a.diagnostics.pending).toEqual([]);
    expect(a.diagnostics.uniformCellCount).toBeGreaterThan(5);
    expect(a.field?.regions).toBeDefined();
    // (2,3,5) ringed at node 0: the DODECAHEDRON — 12 pentagonal faces
    const cells = a.scene.filter((i) => i.id.startsWith('field:tile:'));
    expect(cells).toHaveLength(12);
    for (const c of cells) expect(c.kind === 'polygon' && c.vertices.length).toBe(5);
  });

  it('the first field-paintable layer takes the GPU; the overlay drops its items', () => {
    const a = assemble(fixture('tessellation.json'), SIZE);
    expect(a.diagnostics.field).toBe(true);
    expect(a.field).not.toBeNull();
    expect(a.overlay).not.toBeNull();
    // overlay: no tile items (the field paints them), but the fd stays honest
    const overlayIds = (a.overlay ?? []).map((i) => i.id);
    expect(overlayIds).toContain('tile:e');
    expect(overlayIds.filter((id) => id.startsWith('tile:'))).toHaveLength(1);
    expect(overlayIds).toContain('wall:0'); // non-field layers stay in the overlay
    // the full scene still carries every tile — the SVG story
    expect(a.scene.filter((i) => i.id.startsWith('tile:')).length).toBe(a.diagnostics.tileCount);
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

  it('figureToSvg (P5): a raw document → an SVG string, pure, same ids', () => {
    const raw = Object.entries(fixtureModules).find(([p]) => p.endsWith('/tessellation.json'))![1];
    const r = figureToSvg(raw);
    expect(r.ok).toBe(true);
    const svg = r.ok ? r.value : '';
    expect(svg).toContain('<svg');
    expect(svg).toContain('data-id="wall:0"');
    expect(svg).toContain('data-id="tile:e"');
  });

  it('figureToSvg merges the field programs&apos; vector twins (cosets → one path per hue)', () => {
    const raw = Object.entries(fixtureModules).find(([p]) => p.endsWith('/cosets-pentagon.json'))![1];
    const r = figureToSvg(raw);
    expect(r.ok).toBe(true);
    const svg = r.ok ? r.value : '';
    expect(svg).toContain('data-id="field:tiles:0"'); // merged by color
    expect(svg).not.toContain('data-id="field:tile:e"'); // no per-tile paths survive
  });

  it('figureToSvg returns problems as values on a bad document', () => {
    const r = figureToSvg({ version: '9.9' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.length).toBeGreaterThan(0);
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
