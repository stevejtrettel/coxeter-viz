/**
 * The GLSL sources (README: "the backward view formula", "folding into the
 * chamber", "the three coloring layers"). The fragment shader inverts the
 * render2d camera per pixel — V⁻¹ → chart unproject → view⁻¹ — then folds the
 * canonical point into the chamber with the κ-uniform reflection
 * p ← p − 2⟨p,c⟩·Jc, J = diag(κ,1,1), and colors by parity / edge bands /
 * vertex disks against CPU-precomputed thresholds. No geometry branch in the
 * fold; κ enters only through Jc and the quadratic form Q.
 */

/** Uniform-array capacities, baked into the GLSL source. */
export const MAX_WALLS = 16;
export const MAX_VERTS = 16;

/** Default fold-sweep cap (README, recorded limits). */
export const DEFAULT_MAX_FOLDS = 200;

/** Bufferless fullscreen triangle via gl_VertexID. */
export const VERT_SRC = `#version 300 es
void main() {
  vec2 xy = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(xy, 0.0, 1.0);
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uResolution;
uniform float uScalePx;
uniform vec2 uCenterPx;
uniform mat3 uViewInv;
uniform int uChart;
uniform float uKappa;
uniform int uNWalls;
uniform vec3 uWalls[${MAX_WALLS}];
uniform int uNVerts;
uniform vec3 uVerts[${MAX_VERTS}];
uniform float uEdgeSin;
uniform float uVertQ;
uniform vec4 uColorEven;
uniform vec4 uColorOdd;
uniform vec4 uColorEdge;
uniform vec4 uColorVertex;
uniform int uMaxFolds;

// ── Field programs (README §5.8) ──
uniform int uMode;                       // 0 parity, 1 coset hash, 2 regions
uniform vec3 uCosetAnchor;               // the W_S-fixed point v
uniform vec2 uCosetSL;                   // saturation, lightness
uniform int uNStar;                      // star bands (Cayley / uniform edges)
uniform vec3 uStarLine[${MAX_WALLS}];    // unit covector of anchor→foot geodesic
uniform vec3 uStarWallC[${MAX_WALLS}];   // the band's wall covector (segment clamp)
uniform float uStarMin[${MAX_WALLS}];    // ⟨anchor, wall⟩ — the anchor end of the clamp
uniform vec4 uStarColor[${MAX_WALLS}];
uniform float uStarSin;                  // sin_κ(star half-width)
uniform vec3 uNodeP;                     // node disk center (the star anchor)
uniform vec4 uNodeColor;
uniform float uNodeQ;                    // Q_r of the node radius (0 = off)
uniform vec3 uSplit[3];                  // region splitters (zero = degenerate)
uniform vec4 uRegionColor[3];
uniform vec3 uRegionSigns[3];            // expected signs per region row (0 = skip)

out vec4 fragColor;

// The κ-quadratic form Q(v) = κv₀² + v₁² + v₂² of J = diag(κ,1,1).
float qform(vec3 v) { return uKappa * v.x * v.x + v.y * v.y + v.z * v.z; }

// Premultiplied src over dst.
vec4 over(vec4 dst, vec4 src) { return src + dst * (1.0 - src.a); }

// CSS-hsl → rgb (matches the CPU hashHue consumers' hsl colors).
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c / 2.0;
  vec3 rgb = h < 1.0/6.0 ? vec3(c, x, 0.0)
           : h < 2.0/6.0 ? vec3(x, c, 0.0)
           : h < 3.0/6.0 ? vec3(0.0, c, x)
           : h < 4.0/6.0 ? vec3(0.0, x, c)
           : h < 5.0/6.0 ? vec3(x, 0.0, c)
           :               vec3(c, 0.0, x);
  return rgb + m;
}

// The shared coset-hue convention — bit pattern mirrored by hashHue (TS).
float hashHue(vec3 v) {
  vec2 hc = v.yz / (1.0 + abs(v.x));
  ivec2 q = ivec2(floor(hc * 4096.0));
  uint h = (uint(q.x) * 0x27d4eb2du) ^ (uint(q.y) * 0x9e3779b9u);
  h = h ^ (h >> 15u);
  h = h * 0x85ebca6bu;
  h = h ^ (h >> 13u);
  return float(h & 0xffffu) / 65536.0;
}

void main() {
  // V⁻¹: gl_FragCoord is bottom-up; the Camera lives in canvas pixels, y down.
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 u = vec2(px.x - uCenterPx.x, uCenterPx.y - px.y) / uScalePx;
  float r2 = dot(u, u);

  // Chart domain mask + unproject (README chart table).
  vec3 p;
  if (uChart == 0) {            // poincare-disk
    if (r2 >= 1.0) { fragColor = vec4(0.0); return; }
    p = vec3(1.0 + r2, 2.0 * u) / (1.0 - r2);
  } else if (uChart == 1) {     // klein-disk
    if (r2 >= 1.0) { fragColor = vec4(0.0); return; }
    p = vec3(1.0, u) / sqrt(1.0 - r2);
  } else if (uChart == 2) {     // cartesian
    p = vec3(1.0, u);
  } else if (uChart == 3) {     // stereographic
    p = vec3(1.0 - r2, 2.0 * u) / (1.0 + r2);
  } else {                      // gnomonic
    p = vec3(1.0, u) / sqrt(1.0 + r2);
  }

  p = uViewInv * p;

  // Fold into the chamber { ⟨p,c⟩ ≤ 0 }, counting reflections; renormalize
  // each sweep against float32 drift off the locus. Coset mode accumulates
  // the INVERSE product M⁻¹ (M⁻¹ ← M⁻¹·Rᵢ), so M⁻¹·anchor = g·anchor.
  int folds = 0;
  mat3 Minv = mat3(1.0);
  for (int sweep = 0; sweep < uMaxFolds; sweep++) {
    bool moved = false;
    for (int i = 0; i < uNWalls; i++) {
      float s = dot(p, uWalls[i]);
      if (s > 0.0) {
        vec3 c = uWalls[i];
        vec3 jc = vec3(uKappa * c.x, c.y, c.z);
        p -= 2.0 * s * jc;
        if (uMode == 1) Minv = Minv * (mat3(1.0) - 2.0 * outerProduct(jc, c));
        folds++;
        moved = true;
      }
    }
    p = (uKappa == 0.0) ? p / p.x : p / sqrt(abs(qform(p)));
    if (!moved) break;
  }

  // The fill: parity (0), coset hue (1), or Wythoff face regions (2).
  vec4 fill;
  if (uMode == 1) {
    vec3 v = Minv * uCosetAnchor;
    v = (uKappa == 0.0) ? v / v.x : v / sqrt(abs(qform(v)));
    fill = vec4(hsl2rgb(hashHue(v), uCosetSL.x, uCosetSL.y), 1.0);
  } else if (uMode == 2) {
    fill = vec4(0.0);
    for (int r = 2; r >= 0; r--) {
      bool ok = true;
      for (int k = 0; k < 3; k++) {
        float sgn = uRegionSigns[r][k];
        if (sgn != 0.0 && sgn * dot(p, uSplit[k]) < -1e-6) ok = false;
      }
      if (ok && uRegionColor[r].a > 0.0) fill = uRegionColor[r];
    }
  } else {
    fill = (folds % 2 == 0) ? uColorEven : uColorOdd;
  }
  vec4 color = vec4(fill.rgb * fill.a, fill.a);

  // Edges: |⟨p,cᵢ⟩| = sin_κ(dist to the wall image), tested against sin_κ(w).
  float minPair = 1e30;
  for (int i = 0; i < uNWalls; i++) minPair = min(minPair, abs(dot(p, uWalls[i])));
  float aaE = fwidth(minPair);
  float covE = 1.0 - smoothstep(uEdgeSin - aaE, uEdgeSin + aaE, minPair);
  color = over(color, vec4(uColorEdge.rgb, 1.0) * (uColorEdge.a * covE));

  // Vertices: Q(p−v), monotone in distance in all three geometries.
  float minQ = 1e30;
  for (int i = 0; i < uNVerts; i++) { vec3 d = p - uVerts[i]; minQ = min(minQ, qform(d)); }
  float aaV = fwidth(minQ);
  float covV = 1.0 - smoothstep(uVertQ - aaV, uVertQ + aaV, minQ);
  color = over(color, vec4(uColorVertex.rgb, 1.0) * (uColorVertex.a * covV));

  // Star bands: |⟨p,L⟩| < sin_κ(w) clamped to the anchor-side half-segment.
  for (int k = 0; k < uNStar; k++) {
    float band = abs(dot(p, uStarLine[k]));
    float aaS = fwidth(band);
    float cov = (1.0 - smoothstep(uStarSin - aaS, uStarSin + aaS, band))
              * step(uStarMin[k], dot(p, uStarWallC[k]));
    color = over(color, vec4(uStarColor[k].rgb, 1.0) * (uStarColor[k].a * cov));
  }

  // The node disk at the star anchor.
  if (uNodeQ > 0.0) {
    vec3 dn = p - uNodeP;
    float qn = qform(dn);
    float aaN = fwidth(qn);
    float covN = 1.0 - smoothstep(uNodeQ - aaN, uNodeQ + aaN, qn);
    color = over(color, vec4(uNodeColor.rgb, 1.0) * (uNodeColor.a * covN));
  }

  fragColor = color; // premultiplied; vec4(0) outside chart domains
}
`;
