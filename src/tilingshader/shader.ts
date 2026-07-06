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

out vec4 fragColor;

// The κ-quadratic form Q(v) = κv₀² + v₁² + v₂² of J = diag(κ,1,1).
float qform(vec3 v) { return uKappa * v.x * v.x + v.y * v.y + v.z * v.z; }

// Premultiplied src over dst.
vec4 over(vec4 dst, vec4 src) { return src + dst * (1.0 - src.a); }

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
  // each sweep against float32 drift off the locus.
  int folds = 0;
  for (int sweep = 0; sweep < uMaxFolds; sweep++) {
    bool moved = false;
    for (int i = 0; i < uNWalls; i++) {
      float s = dot(p, uWalls[i]);
      if (s > 0.0) {
        vec3 c = uWalls[i];
        p -= 2.0 * s * vec3(uKappa * c.x, c.y, c.z);
        folds++;
        moved = true;
      }
    }
    p = (uKappa == 0.0) ? p / p.x : p / sqrt(abs(qform(p)));
    if (!moved) break;
  }

  // Tiles by fold parity.
  vec4 fill = (folds % 2 == 0) ? uColorEven : uColorOdd;
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

  fragColor = color; // premultiplied; vec4(0) outside chart domains
}
`;
