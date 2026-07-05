import type { Camera, PathList } from './types';

/**
 * The Canvas2D painter (README): immediate mode. Every path is already a
 * plain fill in render coordinates; painting is exactly the affine viewport
 * V — sx = cx + s·uₓ, sy = cy − s·u_y (screen y is down) — applied to each
 * contour, filled under the even-odd rule (a stroked circle's two offset
 * loops make an annulus). No retained state: callers rebuild the path list
 * and repaint on every change.
 */
export function paint(g: CanvasRenderingContext2D, paths: PathList, camera: Camera): void {
  const s = camera.scalePx;
  const [cx, cy] = camera.centerPx;
  for (const path of paths) {
    g.beginPath();
    for (const contour of path.contours) {
      if (contour.length < 4) continue;
      g.moveTo(cx + s * contour[0], cy - s * contour[1]);
      for (let i = 2; i < contour.length; i += 2) {
        g.lineTo(cx + s * contour[i], cy - s * contour[i + 1]);
      }
      g.closePath();
    }
    g.fillStyle = path.color;
    g.globalAlpha = path.opacity;
    g.fill('evenodd');
  }
  g.globalAlpha = 1;
}
