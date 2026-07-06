import type { Camera, PathList, ViewSize } from './types';

/**
 * The SVG serializer (README): the path list through the SAME affine
 * viewport as the Canvas painter — sx = cx + s·uₓ, sy = cy − s·u_y (screen y
 * down) — so the exported figure is geometrically identical to the screen BY
 * CONSTRUCTION. A pure string builder, no DOM: one <path> per RenderPath
 * (its contours joined into one d, filled together under the even-odd rule,
 * exactly like the painter), the item id as data-id (one item may emit
 * several paths, so not id), coordinates at 2 decimals in px.
 */

const fmt = (v: number): string => String(Math.round(v * 100) / 100);

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function toSvg(paths: PathList, camera: Camera, size: ViewSize): string {
  const s = camera.scalePx;
  const [cx, cy] = camera.centerPx;

  let body = '';
  for (const path of paths) {
    let d = '';
    for (const contour of path.contours) {
      if (contour.length < 4) continue;
      d += `M${fmt(cx + s * contour[0])} ${fmt(cy - s * contour[1])}`;
      for (let i = 2; i < contour.length; i += 2) {
        d += `L${fmt(cx + s * contour[i])} ${fmt(cy - s * contour[i + 1])}`;
      }
      d += 'Z';
    }
    if (d === '') continue;
    const opacity = path.opacity === 1 ? '' : ` fill-opacity="${fmt(path.opacity)}"`;
    body += `  <path data-id="${escapeAttr(path.id)}" fill="${escapeAttr(path.color)}"${opacity} fill-rule="evenodd" d="${d}"/>\n`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.widthPx}" height="${size.heightPx}" ` +
    `viewBox="0 0 ${size.widthPx} ${size.heightPx}">\n${body}</svg>\n`
  );
}
