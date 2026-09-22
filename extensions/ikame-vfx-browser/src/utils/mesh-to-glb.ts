'use strict';

export interface FlatMesh {
    positions: number[];
    indices: number[];
    normals: number[];
    uvs: number[];
}

export function meshToGlb(mesh: FlatMesh, name: string = 'Mesh'): Buffer {
    const vertexCount = mesh.positions.length / 3;
    const indexCount = mesh.indices.length;
    const useUint32 = vertexCount > 65535;

    const posBuf = float32Array(mesh.positions);
    const normBuf = mesh.normals.length > 0 ? float32Array(mesh.normals) : null;
    const uvBuf = mesh.uvs.length > 0 ? float32Array(mesh.uvs) : null;
    const idxBuf = useUint32 ? uint32Array(mesh.indices) : uint16Array(mesh.indices);

    let binOffset = 0;
    const bufferViews: any[] = [];
    const accessors: any[] = [];
    const attributes: Record<string, number> = {};

    // POSITION
    const posAccessorIdx = accessors.length;
    attributes['POSITION'] = posAccessorIdx;
    bufferViews.push({ buffer: 0, byteOffset: binOffset, byteLength: posBuf.length, target: 34962 });
    const bounds = computeBounds(mesh.positions);
    accessors.push({
        bufferView: bufferViews.length - 1, componentType: 5126,
        count: vertexCount, type: 'VEC3', max: bounds.max, min: bounds.min,
    });
    binOffset += alignTo4(posBuf.length);

    // NORMAL
    if (normBuf) {
        const normAccessorIdx = accessors.length;
        attributes['NORMAL'] = normAccessorIdx;
        bufferViews.push({ buffer: 0, byteOffset: binOffset, byteLength: normBuf.length, target: 34962 });
        accessors.push({
            bufferView: bufferViews.length - 1, componentType: 5126,
            count: vertexCount, type: 'VEC3',
        });
        binOffset += alignTo4(normBuf.length);
    }

    // TEXCOORD_0
    if (uvBuf) {
        const uvAccessorIdx = accessors.length;
        attributes['TEXCOORD_0'] = uvAccessorIdx;
        bufferViews.push({ buffer: 0, byteOffset: binOffset, byteLength: uvBuf.length, target: 34962 });
        accessors.push({
            bufferView: bufferViews.length - 1, componentType: 5126,
            count: vertexCount, type: 'VEC2',
        });
        binOffset += alignTo4(uvBuf.length);
    }

    // INDICES
    const idxAccessorIdx = accessors.length;
    bufferViews.push({ buffer: 0, byteOffset: binOffset, byteLength: idxBuf.length, target: 34963 });
    accessors.push({
        bufferView: bufferViews.length - 1,
        componentType: useUint32 ? 5125 : 5123,
        count: indexCount, type: 'SCALAR',
    });
    binOffset += alignTo4(idxBuf.length);

    const totalBinLength = binOffset;

    const gltfJson: Record<string, any> = {
        asset: { version: '2.0', generator: 'ikame-vfx-browser' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name }],
        meshes: [{
            name,
            primitives: [{ attributes, indices: idxAccessorIdx, mode: 4 }],
        }],
        accessors,
        bufferViews,
        buffers: [{ byteLength: totalBinLength }],
    };

    let jsonStr = JSON.stringify(gltfJson);
    // Pad JSON to 4-byte alignment with spaces
    while (jsonStr.length % 4 !== 0) jsonStr += ' ';
    const jsonBuf = Buffer.from(jsonStr, 'utf-8');

    // Assemble binary chunk
    const binBuf = Buffer.alloc(totalBinLength);
    let writeOffset = 0;
    writeOffset = copyAligned(binBuf, posBuf, writeOffset);
    if (normBuf) writeOffset = copyAligned(binBuf, normBuf, writeOffset);
    if (uvBuf) writeOffset = copyAligned(binBuf, uvBuf, writeOffset);
    copyAligned(binBuf, idxBuf, writeOffset);

    // GLB assembly
    const headerSize = 12;
    const jsonChunkHeaderSize = 8;
    const binChunkHeaderSize = 8;
    const totalSize = headerSize + jsonChunkHeaderSize + jsonBuf.length + binChunkHeaderSize + binBuf.length;

    const glb = Buffer.alloc(totalSize);
    let off = 0;

    // Header
    glb.writeUInt32LE(0x46546C67, off); off += 4; // magic "glTF"
    glb.writeUInt32LE(2, off); off += 4;           // version
    glb.writeUInt32LE(totalSize, off); off += 4;   // total length

    // JSON chunk
    glb.writeUInt32LE(jsonBuf.length, off); off += 4;
    glb.writeUInt32LE(0x4E4F534A, off); off += 4;  // "JSON"
    jsonBuf.copy(glb, off); off += jsonBuf.length;

    // BIN chunk
    glb.writeUInt32LE(binBuf.length, off); off += 4;
    glb.writeUInt32LE(0x004E4942, off); off += 4;  // "BIN\0"
    binBuf.copy(glb, off);

    return glb;
}

function float32Array(arr: number[]): Buffer {
    const buf = Buffer.alloc(arr.length * 4);
    for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
    return buf;
}

function uint16Array(arr: number[]): Buffer {
    const buf = Buffer.alloc(arr.length * 2);
    for (let i = 0; i < arr.length; i++) buf.writeUInt16LE(arr[i], i * 2);
    return buf;
}

function uint32Array(arr: number[]): Buffer {
    const buf = Buffer.alloc(arr.length * 4);
    for (let i = 0; i < arr.length; i++) buf.writeUInt32LE(arr[i], i * 4);
    return buf;
}

function alignTo4(n: number): number {
    return (n + 3) & ~3;
}

function copyAligned(dest: Buffer, src: Buffer, offset: number): number {
    src.copy(dest, offset);
    return offset + alignTo4(src.length);
}

function computeBounds(positions: number[]): { min: number[]; max: number[] } {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
        for (let j = 0; j < 3; j++) {
            if (positions[i + j] < min[j]) min[j] = positions[i + j];
            if (positions[i + j] > max[j]) max[j] = positions[i + j];
        }
    }
    if (positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
    return { min, max };
}
