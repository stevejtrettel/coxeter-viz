import type { ItemId, Scene } from '@/viz2d/render/types';
import { hitTestCanonical } from '@/viz2d/render/interact';
import { Spherical2 } from '@/geometry/Spherical';
import { SpherePerspective, sphereUnprojector } from './projection';
import type { SphereCamera } from './types';

/**
 * Front-sheet hover for the globe (P3): unproject the cursor to the VISIBLE
 * sheet (what it touches), pull back by the view isometry, and reuse
 * render2d's canonical hit test — the per-kind tests are chart-free. The px
 * slop maps through the perspective scale s = d/(d − p₀) at the grabbed
 * point. Null outside the silhouette. Back-sheet content is not hoverable —
 * honest: it is behind the globe.
 */
export function sphereHitTest(
  scene: Scene,
  camera: SphereCamera,
  px: readonly [number, number],
  slopPx = 4,
): ItemId | null {
  const d = camera.eyeDistance;
  const persp = new SpherePerspective(d);
  const a = sphereUnprojector(persp)(camera, px);
  if (!a) return null;
  const geom = new Spherical2();
  const q = geom.apply(geom.inverse(camera.view), a);
  return hitTestCanonical(scene, geom, q, slopPx / (camera.scalePx * (d / (d - a[0]))));
}
