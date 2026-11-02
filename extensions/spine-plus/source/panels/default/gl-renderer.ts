/**
 * Minimal WebGL renderer for the Preview panel: draws a SpineMesh with the
 * same two color tint shader and blend factors as the runtime component,
 * plus line overlays (bones, wireframe).
 */
import { BlendMode, BYTES_PER_VERTEX, SpineMesh } from '../../../assets/core/spine-mesh';

const VS = `
attribute vec3 a_position;
attribute vec2 a_texCoord;
attribute vec4 a_color;
attribute vec4 a_color2;
uniform mat3 u_matrix;
varying vec2 v_uv;
varying vec4 v_light;
varying vec4 v_dark;
void main () {
  v_uv = a_texCoord;
  v_light = a_color;
  v_dark = a_color2;
  vec3 p = u_matrix * vec3(a_position.xy, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec4 v_light;
varying vec4 v_dark;
void main () {
  vec4 tex = texture2D(u_texture, v_uv);
  gl_FragColor.a = tex.a * v_light.a;
  gl_FragColor.rgb = ((tex.a - 1.0) * v_dark.a + 1.0 - tex.rgb) * v_dark.rgb + tex.rgb * v_light.rgb;
}`;

const LINE_VS = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform mat3 u_matrix;
varying vec4 v_color;
void main () {
  v_color = a_color;
  vec3 p = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`;

const LINE_FS = `
precision mediump float;
varying vec4 v_color;
void main () { gl_FragColor = vec4(v_color.rgb * v_color.a, v_color.a); }`;

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
    const make = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
        return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link error');
    return p;
}

/** Skeleton space → clip space: zoom, pan, rotation (degrees) and offset of the "node". */
export interface View {
    width: number;
    height: number;
    /** Screen pixels per skeleton unit. */
    zoom: number;
    /** Screen position (pixels from the center) of the view origin. */
    panX: number;
    panY: number;
    /** The previewed node's transform, in skeleton units / degrees. */
    nodeX: number;
    nodeY: number;
    nodeRotation: number;
}

export function viewMatrix(v: View, out = new Float32Array(9)): Float32Array {
    const r = (v.nodeRotation * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const sx = (2 * v.zoom) / v.width;
    const sy = (2 * v.zoom) / v.height;
    // p' = S * (R * p + node) + pan
    out[0] = c * sx;
    out[1] = s * sy;
    out[2] = 0;
    out[3] = -s * sx;
    out[4] = c * sy;
    out[5] = 0;
    out[6] = v.nodeX * sx + (2 * v.panX) / v.width;
    out[7] = v.nodeY * sy + (2 * v.panY) / v.height;
    out[8] = 1;
    return out;
}

export class GLRenderer {
    readonly gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private lineProgram: WebGLProgram;
    private vbo: WebGLBuffer;
    private ibo: WebGLBuffer;
    private lineVbo: WebGLBuffer;
    private textures = new Map<any, WebGLTexture>();
    private matrix = new Float32Array(9);
    private lines = new Float32Array(4096);
    private lineColors = new Uint32Array(this.lines.buffer);
    private lineCount = 0;
    private loc: Record<string, any> = {};

    constructor(readonly canvas: HTMLCanvasElement) {
        const gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        if (!gl) throw new Error('WebGL is not available');
        this.gl = gl;
        this.program = compile(gl, VS, FS);
        this.lineProgram = compile(gl, LINE_VS, LINE_FS);
        this.vbo = gl.createBuffer()!;
        this.ibo = gl.createBuffer()!;
        this.lineVbo = gl.createBuffer()!;
        const p = this.program;
        const l = this.lineProgram;
        this.loc = {
            pos: gl.getAttribLocation(p, 'a_position'),
            uv: gl.getAttribLocation(p, 'a_texCoord'),
            light: gl.getAttribLocation(p, 'a_color'),
            dark: gl.getAttribLocation(p, 'a_color2'),
            matrix: gl.getUniformLocation(p, 'u_matrix'),
            texture: gl.getUniformLocation(p, 'u_texture'),
            lPos: gl.getAttribLocation(l, 'a_position'),
            lColor: gl.getAttribLocation(l, 'a_color'),
            lMatrix: gl.getUniformLocation(l, 'u_matrix'),
        };
    }

    /** GPU texture for an atlas page image (uploaded once). */
    texture(image: TexImageSource | null, pma: boolean): WebGLTexture | null {
        if (!image) return null;
        let t = this.textures.get(image);
        if (t) return t;
        const gl = this.gl;
        t = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.textures.set(image, t);
        void pma;
        return t;
    }

    clearTextures(): void {
        this.textures.forEach((t) => this.gl.deleteTexture(t));
        this.textures.clear();
    }

    resize(width: number, height: number): void {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    }

    begin(view: View, background: [number, number, number]): void {
        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(background[0], background[1], background[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        viewMatrix(view, this.matrix);
        this.lineCount = 0;
    }

    private blend(mode: BlendMode, pma: boolean): void {
        const gl = this.gl;
        gl.enable(gl.BLEND);
        switch (mode) {
            case BlendMode.Additive:
                gl.blendFuncSeparate(pma ? gl.ONE : gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
                break;
            case BlendMode.Multiply:
                gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                break;
            case BlendMode.Screen:
                gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_COLOR);
                break;
            default:
                gl.blendFuncSeparate(pma ? gl.ONE : gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
    }

    drawMesh(mesh: SpineMesh, pma: boolean): void {
        if (!mesh.vertexCount) return;
        const gl = this.gl;
        const L = this.loc;
        gl.useProgram(this.program);
        gl.uniformMatrix3fv(L.matrix, false, this.matrix);
        gl.uniform1i(L.texture, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices.subarray(0, mesh.vertexCount * (BYTES_PER_VERTEX / 4)), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices.subarray(0, mesh.indexCount), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(L.pos);
        gl.vertexAttribPointer(L.pos, 3, gl.FLOAT, false, BYTES_PER_VERTEX, 0);
        gl.enableVertexAttribArray(L.uv);
        gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 12);
        gl.enableVertexAttribArray(L.light);
        gl.vertexAttribPointer(L.light, 4, gl.UNSIGNED_BYTE, true, BYTES_PER_VERTEX, 20);
        gl.enableVertexAttribArray(L.dark);
        gl.vertexAttribPointer(L.dark, 4, gl.UNSIGNED_BYTE, true, BYTES_PER_VERTEX, 24);
        gl.activeTexture(gl.TEXTURE0);
        for (let i = 0; i < mesh.batchCount; i++) {
            const b = mesh.batches[i];
            const tex = this.texture(b.texture?.image ?? null, pma);
            if (!tex) continue;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            this.blend(b.blendMode, pma);
            gl.drawElements(gl.TRIANGLES, b.indexCount, gl.UNSIGNED_SHORT, b.firstIndex * 2);
        }
        gl.disableVertexAttribArray(L.light);
        gl.disableVertexAttribArray(L.dark);
        gl.disableVertexAttribArray(L.uv);
    }

    /** Queues a line in skeleton space (color 0xAABBGGRR). */
    line(x1: number, y1: number, x2: number, y2: number, color: number): void {
        if ((this.lineCount + 1) * 6 > this.lines.length) {
            const bigger = new Float32Array(this.lines.length * 2);
            bigger.set(this.lines);
            this.lines = bigger;
            this.lineColors = new Uint32Array(bigger.buffer);
        }
        const o = this.lineCount * 6;
        this.lines[o] = x1;
        this.lines[o + 1] = y1;
        this.lineColors[o + 2] = color;
        this.lines[o + 3] = x2;
        this.lines[o + 4] = y2;
        this.lineColors[o + 5] = color;
        this.lineCount++;
    }

    /** Draws the queued lines. With `screen` (its CSS size), coordinates are pixels from the canvas center. */
    flushLines(screen?: { width: number; height: number }): void {
        if (!this.lineCount) return;
        const gl = this.gl;
        const L = this.loc;
        gl.useProgram(this.lineProgram);
        const m = screen
            ? new Float32Array([2 / screen.width, 0, 0, 0, 2 / screen.height, 0, 0, 0, 1])
            : this.matrix;
        gl.uniformMatrix3fv(L.lMatrix, false, m);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.lines.subarray(0, this.lineCount * 6), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(L.lPos);
        gl.vertexAttribPointer(L.lPos, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(L.lColor);
        gl.vertexAttribPointer(L.lColor, 4, gl.UNSIGNED_BYTE, true, 12, 8);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, this.lineCount * 2);
        gl.disableVertexAttribArray(L.lColor);
        this.lineCount = 0;
    }

    dispose(): void {
        const gl = this.gl;
        this.clearTextures();
        gl.deleteBuffer(this.vbo);
        gl.deleteBuffer(this.ibo);
        gl.deleteBuffer(this.lineVbo);
        gl.deleteProgram(this.program);
        gl.deleteProgram(this.lineProgram);
    }
}

export function rgba(r: number, g: number, b: number, a = 255): number {
    return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}
