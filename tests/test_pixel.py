"""P9 pixel-coincidence: the GPU field and the SVG vector twin paint the
SAME picture — the house cross-painter honesty claim, automated.

For one document we produce (a) the PNG (GPU field + vector overlay) and
(b) the SVG (pure CPU paths), rasterize both in the same headless page,
FLATTEN BOTH OVER WHITE, and diff per pixel. Flattening matters: abutting
SVG polygons leave half-covered boundary pixels semi-transparent (the
classic adjacent-polygon seam) while the GPU paints them opaque — an
alpha-representation artifact, not a disagreement; over a background it
vanishes. Perfect equality is still impossible (antialiasing, and the
field paints sub-ε tiles at the rim that the vector export honestly
omits), so the pins are: few badly-different pixels, tiny mean difference.
Both documents use opacity 1 (the GPU field programs paint opaque).
"""

import pytest

pytest.importorskip("playwright.sync_api")

import coxeter_groups as cx  # noqa: E402
from coxeter_groups.viz import _export  # noqa: E402

M237 = [[1, 2, 7], [2, 1, 3], [7, 3, 1]]
SIZE = 360

DIFF_JS = """
async (a) => {
  const size = { widthPx: a.size, heightPx: a.size };
  const pngR = await coxeterViz.figureToPng(a.doc, 1, { size });
  if (!pngR.ok) return { error: JSON.stringify(pngR.problems) };
  const svgR = coxeterViz.figureToSvg(a.doc, { size });
  if (!svgR.ok) return { error: JSON.stringify(svgR.problems) };

  const bitmap = await createImageBitmap(pngR.value);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('svg raster failed'));
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgR.value)));
  });

  const pixels = (source) => {
    const c = document.createElement('canvas');
    c.width = a.size; c.height = a.size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#ffffff';               // flatten over white
    g.fillRect(0, 0, a.size, a.size);
    g.drawImage(source, 0, 0);
    return g.getImageData(0, 0, a.size, a.size).data;
  };
  const A = pixels(bitmap);
  const B = pixels(img);

  // Interior mask: a pixel is comparable when its 3×3 neighborhood is FLAT
  // in BOTH images (antialiased edge pixels legitimately differ; interiors
  // must agree — that is the mathematical claim).
  const n = a.size;
  const flatAt = (P, x, y) => {
    for (let c = 0; c < 3; c++) {
      let lo = 255, hi = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = P[((y + dy) * n + (x + dx)) * 4 + c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (hi - lo > 8) return false;
    }
    return true;
  };

  let comparable = 0, bad = 0, sum = 0;
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      if (!flatAt(A, x, y) || !flatAt(B, x, y)) continue;
      comparable++;
      const i = (y * n + x) * 4;
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[i + c] - B[i + c]));
      sum += d;
      if (d > 32) bad++;
    }
  }
  return {
    comparable: comparable / (n * n),
    mismatch: comparable ? bad / comparable : 1,
    mean: comparable ? sum / comparable : 255,
  };
}
"""


def coincidence(document: dict) -> dict:
    return _export._page().evaluate(DIFF_JS, {"doc": document, "size": SIZE})


def assert_coincides(stats: dict) -> None:
    assert "error" not in stats, stats
    assert stats["comparable"] > 0.5, stats  # the interiors dominate: not vacuous
    assert stats["mismatch"] < 0.005, stats  # interiors agree essentially everywhere
    assert stats["mean"] < 3, stats


def test_parity_field_coincides_with_the_vector_twin():
    doc = cx.figure(M237).tessellation(color="parity", opacity=1.0).walls(width=0.05).document()
    assert_coincides(coincidence(doc))


def test_hue_field_coincides_bit_exactly_in_law():
    # hue = hashHue of the base-point image: the SHARED convention — the GPU
    # program and the CPU tiles must land on the SAME hues per element.
    doc = cx.figure(M237).tessellation(color="hue", opacity=1.0).document()
    assert_coincides(coincidence(doc))
