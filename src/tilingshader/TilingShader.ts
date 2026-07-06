import type { GeometryKind, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import type { RealizedPolygon } from '@/coxeter/solve';
import type { Camera } from '@/render2d/types';
import type { TilingStyle } from './types';
import { chartId, edgeThreshold, kappaOf, packVec3s, vertexThreshold } from './uniforms';
import { DEFAULT_MAX_FOLDS, FRAG_SRC, MAX_VERTS, MAX_WALLS, VERT_SRC } from './shader';

/**
 * The GPU painter (README): owns a WebGL2 context on its canvas and draws
 * the anonymous tiling field per README's backward view formula. Immediate
 * mode like render2d's paint(): `draw` sets every uniform and repaints; the
 * class retains only the compiled program and the current polygon/chart.
 * The caller owns the camera (one camera, two painters) and canvas sizing —
 * the Camera's pixel space is the canvas backing store, as everywhere.
 */
export class TilingShader {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private loc: Map<string, WebGLUniformLocation | null>;
  private poly: RealizedPolygon | null = null;
  private chart = -1;
  private chartKind: GeometryKind | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Premultiplied alpha out of the shader; AA is in-shader (fwidth).
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!gl) throw new Error('tilingshader: WebGL2 is unavailable');
    this.gl = gl;
    this.program = linkProgram(gl, VERT_SRC, FRAG_SRC);
    // Bufferless fullscreen triangle still needs a bound VAO on some drivers.
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('tilingshader: failed to create a vertex array');
    this.vao = vao;
    this.loc = new Map();
    const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(this.program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      this.loc.set(name, gl.getUniformLocation(this.program, info.name));
    }
  }

  /** The realized polygon: κ, walls, chamber vertices (checked capacity). */
  setPolygon(poly: RealizedPolygon): void {
    if (poly.walls.length > MAX_WALLS || poly.chamber.vertices.length > MAX_VERTS) {
      throw new Error(
        `tilingshader: polygon exceeds capacity (${poly.walls.length} walls, ` +
          `${poly.chamber.vertices.length} vertices; max ${MAX_WALLS}/${MAX_VERTS})`,
      );
    }
    this.poly = poly;
  }

  /** The chart; flat 2D models only (chartId throws otherwise). */
  setChart(model: Model<Point2>): void {
    this.chart = chartId(model);
    this.chartKind = model.kind;
  }

  draw(camera: Camera, style: TilingStyle): void {
    const { gl, poly } = this;
    if (!poly || this.chart < 0) {
      throw new Error('tilingshader: setPolygon and setChart before draw');
    }
    if (this.chartKind !== poly.geometry) {
      throw new Error(
        `tilingshader: chart is ${this.chartKind} but the polygon is ${poly.geometry}`,
      );
    }
    const kappa = kappaOf(poly.geometry);
    const viewInv = poly.geom.inverse(camera.view); // float64 upstairs

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const u = (name: string) => this.loc.get(name) ?? null;
    gl.uniform2f(u('uResolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u('uScalePx'), camera.scalePx);
    gl.uniform2f(u('uCenterPx'), camera.centerPx[0], camera.centerPx[1]);
    // Row-major float64 → column-major float32 via transpose=true (WebGL2).
    gl.uniformMatrix3fv(u('uViewInv'), true, Float32Array.from(viewInv));
    gl.uniform1i(u('uChart'), this.chart);
    gl.uniform1f(u('uKappa'), kappa);
    gl.uniform1i(u('uNWalls'), poly.walls.length);
    gl.uniform3fv(u('uWalls'), packVec3s(poly.walls.map((w) => w.covector), MAX_WALLS));
    gl.uniform1i(u('uNVerts'), poly.chamber.vertices.length);
    gl.uniform3fv(u('uVerts'), packVec3s(poly.chamber.vertices, MAX_VERTS));
    gl.uniform1f(u('uEdgeSin'), edgeThreshold(kappa, style.edgeHalfWidth));
    gl.uniform1f(u('uVertQ'), vertexThreshold(kappa, style.vertexRadius));
    gl.uniform4f(u('uColorEven'), ...style.even);
    gl.uniform4f(u('uColorOdd'), ...style.odd);
    gl.uniform4f(u('uColorEdge'), ...style.edge);
    gl.uniform4f(u('uColorVertex'), ...style.vertex);
    gl.uniform1i(u('uMaxFolds'), style.maxFolds ?? DEFAULT_MAX_FOLDS);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}

function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('tilingshader: failed to create a shader');
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`tilingshader: shader compile failed:\n${log}`);
    }
    return shader;
  };
  const vert = compile(gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('tilingshader: failed to create a program');
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`tilingshader: program link failed:\n${log}`);
  }
  return program;
}
