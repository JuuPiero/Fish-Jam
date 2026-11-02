// Turns a posed skeleton into one vertex/index buffer plus draw batches
// (texture + blend mode), for either runtime. No engine dependencies: the
// component, the preview panel and the tests all use it.
import type { S42, S43 } from './spine-libs';
import { spine42, spine43, RuntimeVersion } from './spine-libs';

/** x, y, z, u, v, light color (RGBA8), dark color (RGBA8). */
export const FLOATS_PER_VERTEX = 7;
export const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;
/** 16 bit indices into one shared vertex buffer. */
export const MAX_VERTICES = 65535;

export enum BlendMode {
    Normal = 0,
    Additive = 1,
    Multiply = 2,
    Screen = 3,
}

export interface MeshBatch {
    /** The atlas page texture object (whatever was given to page.setTexture). */
    texture: any;
    blendMode: BlendMode;
    firstIndex: number;
    indexCount: number;
}

export interface MeshOptions {
    /** Texture has premultiplied alpha: colors are premultiplied and dark alpha is 1. */
    pma: boolean;
    /** Extra tint (0..1), e.g. the component color times UI opacity. */
    r: number;
    g: number;
    b: number;
    a: number;
    /** Spacing between slots along Z (Unity's Z Spacing), usually 0. */
    zSpacing: number;
    /** Apply clipping attachments. */
    clipping: boolean;
}

export const defaultMeshOptions = (): MeshOptions => ({ pma: false, r: 1, g: 1, b: 1, a: 1, zSpacing: 0, clipping: true });

export class SpineMesh {
    vertices = new Float32Array(FLOATS_PER_VERTEX * 256);
    colors = new Uint32Array(this.vertices.buffer);
    indices = new Uint16Array(768);
    vertexCount = 0;
    indexCount = 0;
    readonly batches: MeshBatch[] = [];
    batchCount = 0;
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
    /** Set when the skeleton needed more than MAX_VERTICES (the rest was dropped). */
    overflow = false;

    reset(): void {
        this.vertexCount = 0;
        this.indexCount = 0;
        this.batchCount = 0;
        this.minX = this.minY = Infinity;
        this.maxX = this.maxY = -Infinity;
        this.overflow = false;
    }

    /** Bounds are empty (nothing drawn). */
    get empty(): boolean {
        return this.vertexCount === 0;
    }

    reserve(vertices: number, indices: number): void {
        const vNeed = (this.vertexCount + vertices) * FLOATS_PER_VERTEX;
        if (vNeed > this.vertices.length) {
            let size = this.vertices.length;
            while (size < vNeed) size *= 2;
            const v = new Float32Array(size);
            v.set(this.vertices.subarray(0, this.vertexCount * FLOATS_PER_VERTEX));
            this.vertices = v;
            this.colors = new Uint32Array(v.buffer);
        }
        const iNeed = this.indexCount + indices;
        if (iNeed > this.indices.length) {
            let size = this.indices.length;
            while (size < iNeed) size *= 2;
            const i = new Uint16Array(size);
            i.set(this.indices.subarray(0, this.indexCount));
            this.indices = i;
        }
    }

    /** Starts a new batch unless the last one has the same texture and blend mode. */
    private batchFor(texture: any, blendMode: BlendMode): void {
        const last = this.batchCount ? this.batches[this.batchCount - 1] : null;
        if (last && last.texture === texture && last.blendMode === blendMode) return;
        let b = this.batches[this.batchCount];
        if (!b) b = this.batches[this.batchCount] = { texture: null, blendMode: BlendMode.Normal, firstIndex: 0, indexCount: 0 };
        b.texture = texture;
        b.blendMode = blendMode;
        b.firstIndex = this.indexCount;
        b.indexCount = 0;
        this.batchCount++;
    }

    /**
     * Appends one attachment: `positions` / `uvs` are x,y pairs (`stride` floats
     * per position), `triangles` index them.
     */
    add(
        texture: any, blendMode: BlendMode,
        positions: ArrayLike<number>, stride: number, uvs: ArrayLike<number>, count: number,
        triangles: ArrayLike<number>, triangleCount: number,
        z: number, light: number, dark: number,
    ): void {
        if (!count || !triangleCount) return;
        if (this.vertexCount + count > MAX_VERTICES) {
            this.overflow = true;
            return;
        }
        this.reserve(count, triangleCount);
        this.batchFor(texture, blendMode);
        const v = this.vertices;
        const c = this.colors;
        const base = this.vertexCount;
        let o = base * FLOATS_PER_VERTEX;
        let minX = this.minX;
        let minY = this.minY;
        let maxX = this.maxX;
        let maxY = this.maxY;
        for (let i = 0, p = 0, t = 0; i < count; i++, p += stride, t += 2, o += FLOATS_PER_VERTEX) {
            const x = positions[p];
            const y = positions[p + 1];
            v[o] = x;
            v[o + 1] = y;
            v[o + 2] = z;
            v[o + 3] = uvs[t];
            v[o + 4] = uvs[t + 1];
            c[o + 5] = light;
            c[o + 6] = dark;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
        const idx = this.indices;
        let k = this.indexCount;
        for (let i = 0; i < triangleCount; i++) idx[k++] = triangles[i] + base;
        this.vertexCount += count;
        this.indexCount = k;
        this.batches[this.batchCount - 1].indexCount += triangleCount;
    }
}

const QUAD = [0, 1, 2, 2, 3, 0];

function byte(v: number): number {
    return v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0;
}

function rgba(r: number, g: number, b: number, a: number): number {
    return (byte(r) | (byte(g) << 8) | (byte(b) << 16) | (byte(a) << 24)) >>> 0;
}

interface ColorLike {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** Light and dark vertex colors, the way the official two color tint shader expects them. */
function slotColors(
    o: MeshOptions, skel: ColorLike, slot: ColorLike, att: ColorLike, dark: ColorLike | null, out: number[],
): void {
    const a = o.a * skel.a * slot.a * att.a;
    let r = o.r * skel.r * slot.r * att.r;
    let g = o.g * skel.g * slot.g * att.g;
    let b = o.b * skel.b * slot.b * att.b;
    if (o.pma) {
        r *= a;
        g *= a;
        b *= a;
    }
    out[0] = rgba(r, g, b, a);
    if (!dark) out[1] = rgba(0, 0, 0, 1);
    else if (o.pma) out[1] = rgba(dark.r * a, dark.g * a, dark.b * a, 1);
    else out[1] = rgba(dark.r, dark.g, dark.b, 0);
}

/** Reusable scratch state for building meshes. */
export class MeshBuilder {
    private world = new Float32Array(1024);
    private colors = [0, 0];
    private clipper42: S42.SkeletonClipping | null = null;
    private clipper43: S43.SkeletonClipping | null = null;

    private worldFor(floats: number): Float32Array {
        if (this.world.length < floats) this.world = new Float32Array(Math.max(floats, this.world.length * 2));
        return this.world;
    }

    build(version: RuntimeVersion, skeleton: any, options: MeshOptions, out: SpineMesh): SpineMesh {
        out.reset();
        if (version === '4.3') this.build43(skeleton, options, out);
        else this.build42(skeleton, options, out);
        if (out.empty) out.minX = out.minY = out.maxX = out.maxY = 0;
        return out;
    }

    private build42(skeleton: S42.Skeleton, o: MeshOptions, out: SpineMesh): void {
        const S = spine42;
        const clipper = this.clipper42 || (this.clipper42 = new S.SkeletonClipping());
        const drawOrder = skeleton.drawOrder;
        let z = 0;
        for (let i = 0, n = drawOrder.length; i < n; i++, z += o.zSpacing) {
            const slot = drawOrder[i];
            if (!slot.bone.active) {
                clipper.clipEndWithSlot(slot);
                continue;
            }
            const attachment = slot.getAttachment();
            if (!attachment) {
                clipper.clipEndWithSlot(slot);
                continue;
            }
            let world: Float32Array;
            let count: number;
            let uvs: ArrayLike<number>;
            let triangles: ArrayLike<number>;
            let texture: any;
            let color: S42.Color;
            if (attachment instanceof S.RegionAttachment) {
                color = attachment.color;
                world = this.worldFor(8);
                attachment.computeWorldVertices(slot, world, 0, 2);
                count = 4;
                uvs = attachment.uvs;
                triangles = QUAD;
                texture = attachment.region?.texture;
            } else if (attachment instanceof S.MeshAttachment) {
                color = attachment.color;
                world = this.worldFor(attachment.worldVerticesLength);
                attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, world, 0, 2);
                count = attachment.worldVerticesLength >> 1;
                uvs = attachment.uvs;
                triangles = attachment.triangles;
                texture = attachment.region?.texture;
            } else if (attachment instanceof S.ClippingAttachment) {
                if (o.clipping) clipper.clipStart(slot, attachment);
                continue;
            } else {
                clipper.clipEndWithSlot(slot);
                continue;
            }
            if (!texture || slot.color.a === 0 || color.a === 0) {
                clipper.clipEndWithSlot(slot);
                continue;
            }
            slotColors(o, skeleton.color, slot.color, color, slot.darkColor, this.colors);
            const blend = slot.data.blendMode as number as BlendMode;
            if (clipper.isClipping()) {
                clipper.clipTrianglesUnpacked(world, triangles as any, triangles.length, uvs as any);
                const cv = clipper.clippedVertices;
                out.add(texture, blend, cv, 2, clipper.clippedUVs, cv.length >> 1,
                    clipper.clippedTriangles, clipper.clippedTriangles.length, z, this.colors[0], this.colors[1]);
            } else {
                out.add(texture, blend, world, 2, uvs, count, triangles, triangles.length, z, this.colors[0], this.colors[1]);
            }
            clipper.clipEndWithSlot(slot);
        }
        clipper.clipEnd();
    }

    private build43(skeleton: S43.Skeleton, o: MeshOptions, out: SpineMesh): void {
        const S = spine43;
        const clipper = this.clipper43 || (this.clipper43 = new S.SkeletonClipping());
        const drawOrder = skeleton.drawOrder.appliedPose;
        let z = 0;
        for (let i = 0, n = drawOrder.length; i < n; i++, z += o.zSpacing) {
            const slot = drawOrder[i];
            if (!slot.bone.active) {
                clipper.clipEnd(slot);
                continue;
            }
            const pose = slot.appliedPose;
            const attachment = pose.attachment;
            if (!attachment) {
                clipper.clipEnd(slot);
                continue;
            }
            let world: Float32Array;
            let count: number;
            let uvs: ArrayLike<number>;
            let triangles: ArrayLike<number>;
            let texture: any;
            let color: S43.Color;
            if (attachment instanceof S.RegionAttachment) {
                color = attachment.color;
                const sequence = attachment.sequence;
                const index = sequence.resolveIndex(pose);
                world = this.worldFor(8);
                attachment.computeWorldVertices(slot, attachment.getOffsets(pose), world, 0, 2);
                count = 4;
                uvs = sequence.getUVs(index);
                triangles = QUAD;
                texture = sequence.regions[index]?.texture;
            } else if (attachment instanceof S.MeshAttachment) {
                color = attachment.color;
                world = this.worldFor(attachment.worldVerticesLength);
                attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, world, 0, 2);
                count = attachment.worldVerticesLength >> 1;
                const sequence = attachment.sequence;
                const index = sequence.resolveIndex(pose);
                uvs = sequence.getUVs(index);
                triangles = attachment.triangles;
                texture = sequence.regions[index]?.texture;
            } else if (attachment instanceof S.ClippingAttachment) {
                clipper.clipEnd(slot);
                if (o.clipping) clipper.clipStart(skeleton, slot, attachment);
                continue;
            } else {
                clipper.clipEnd(slot);
                continue;
            }
            if (!texture || pose.color.a === 0 || color.a === 0) {
                clipper.clipEnd(slot);
                continue;
            }
            slotColors(o, skeleton.color, pose.color, color, pose.darkColor, this.colors);
            const blend = slot.data.blendMode as number as BlendMode;
            if (clipper.isClipping()) {
                clipper.clipTrianglesUnpacked(world, 0, triangles as any, triangles.length, uvs as any, 2);
                const vc = clipper.clippedVerticesLength >> 1;
                out.add(texture, blend, clipper.clippedVerticesTyped, 2, clipper.clippedUVsTyped, vc,
                    clipper.clippedTrianglesTyped, clipper.clippedTrianglesLength, z, this.colors[0], this.colors[1]);
            } else {
                out.add(texture, blend, world, 2, uvs, count, triangles, triangles.length, z, this.colors[0], this.colors[1]);
            }
            clipper.clipEnd(slot);
        }
        clipper.clipEnd();
    }
}
