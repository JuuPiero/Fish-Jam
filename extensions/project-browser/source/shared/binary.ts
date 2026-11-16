/**
 * Small binary formats the asset packages need, with no dependency besides
 * node's zlib: CRC-32, a zip reader / writer (stored and deflate, no zip64,
 * no encryption) and a PNG encoder for the drag icon. Tested in node.
 */
import * as zlib from 'zlib';

// ------------------------------------------------------------------ CRC-32

let crcTable: Uint32Array | null = null;

export function crc32(buf: Uint8Array, seed = 0): number {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let c = (seed ^ 0xffffffff) >>> 0;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ zip

export interface ZipEntry {
    /** Path inside the archive, '/' separated; folders end with '/'. */
    name: string;
    data: Buffer;
}

function dosTime(d: Date): { time: number; date: number } {
    const year = Math.max(1980, d.getFullYear());
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

/** A zip archive of the entries (deflated when that is smaller). Names are stored as UTF-8. */
export function zipWrite(entries: ZipEntry[], when = new Date()): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    const t = dosTime(when);
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
        const raw = e.data || Buffer.alloc(0);
        const isDir = /\/$/.test(e.name);
        let method = 0;
        let body = raw;
        if (!isDir && raw.length > 64) {
            const d = zlib.deflateRawSync(raw);
            if (d.length < raw.length) {
                method = 8;
                body = d;
            }
        }
        const crc = crc32(raw);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(t.time, 10);
        local.writeUInt16LE(t.date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(t.time, 12);
        central.writeUInt16LE(t.date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(isDir ? 0x10 : 0, 38); // external attributes: MS-DOS directory bit
        central.writeUInt32LE(offset, 42);
        locals.push(local, name, body);
        centrals.push(central, name);
        offset += local.length + name.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat(locals.concat([cd, end]));
}

/** Entry names of a zip archive (central directory only, nothing is inflated). */
export function zipList(buf: Buffer): string[] {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken zip directory');
        const nlen = buf.readUInt16LE(p + 28);
        const flags = buf.readUInt16LE(p + 8);
        const nameBuf = buf.slice(p + 46, p + 46 + nlen);
        out.push((flags & 0x0800 ? nameBuf.toString('utf8') : nameBuf.toString('latin1')).replace(/\\/g, '/'));
        p += 46 + nlen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    }
    return out;
}

/** The entries of a zip archive (stored or deflated). Throws on anything else. */
export function zipRead(buf: Buffer): ZipEntry[] {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const out: ZipEntry[] = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken zip directory');
        const flags = buf.readUInt16LE(p + 8);
        const method = buf.readUInt16LE(p + 10);
        const csize = buf.readUInt32LE(p + 20);
        const nlen = buf.readUInt16LE(p + 28);
        const xlen = buf.readUInt16LE(p + 30);
        const clen = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const nameBuf = buf.slice(p + 46, p + 46 + nlen);
        // names are UTF-8 when flagged; Windows tools often write the OEM code page, read as latin1 then
        const name = (flags & 0x0800 ? nameBuf.toString('utf8') : /[^\x00-\x7f]/.test(nameBuf.toString('latin1')) ? nameBuf.toString('utf8') : nameBuf.toString('latin1')).replace(/\\/g, '/');
        p += 46 + nlen + xlen + clen;
        if (flags & 1) throw new Error('Encrypted zip entries are not supported: ' + name);
        if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Broken zip entry: ' + name);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const body = buf.slice(start, start + csize);
        let data: Buffer;
        if (method === 0) data = Buffer.from(body);
        else if (method === 8) data = zlib.inflateRawSync(body);
        else throw new Error('Unsupported zip compression (' + method + '): ' + name);
        out.push({ name, data });
    }
    return out;
}

// ------------------------------------------------------------------ PNG

/** A PNG file of RGBA pixels (8 bits per channel, no filter). */
export function pngEncode(width: number, height: number, rgba: Uint8Array): Buffer {
    const chunk = (type: string, data: Buffer) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(td), 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * The 32 px drag icon: a page with a folded corner ('files'), or a box
 * ('package'), with a count badge stripe when several items are dragged.
 */
export function dragIconPixels(kind: 'files' | 'package', count: number, size = 32): Uint8Array {
    const px = new Uint8Array(size * size * 4);
    const set = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const i = (y * size + x) * 4;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = a;
    };
    const s = size / 32;
    if (kind === 'package') {
        // a brown box with a lighter lid band and a tape stripe
        for (let y = Math.round(8 * s); y < Math.round(28 * s); y++)
            for (let x = Math.round(4 * s); x < Math.round(28 * s); x++) {
                const edge = y === Math.round(8 * s) || y === Math.round(28 * s) - 1 || x === Math.round(4 * s) || x === Math.round(28 * s) - 1;
                const lid = y < Math.round(13 * s);
                const tape = Math.abs(x - size / 2) < 2 * s;
                if (edge) set(x, y, 90, 62, 30);
                else if (tape) set(x, y, 214, 190, 140);
                else if (lid) set(x, y, 196, 148, 88);
                else set(x, y, 170, 122, 66);
            }
    } else {
        // a light page with a folded top-right corner
        const l = Math.round(7 * s);
        const r = Math.round(25 * s);
        const t = Math.round(4 * s);
        const b = Math.round(28 * s);
        const fold = Math.round(6 * s);
        for (let y = t; y < b; y++)
            for (let x = l; x < r; x++) {
                const cx = x - (r - fold);
                const cy = y - t;
                if (cx >= 0 && cy < fold && cx > cy) continue; // cut corner
                const edge = y === t || y === b - 1 || x === l || x === r - 1 || (cx >= 0 && cy < fold && cx === cy);
                const inFold = cx >= 0 && cy < fold && cx <= cy;
                if (edge) set(x, y, 70, 70, 70);
                else if (inFold) set(x, y, 200, 200, 200);
                else set(x, y, 236, 236, 236);
            }
        // text lines
        for (let k = 0; k < 4; k++) {
            const y = Math.round((13 + k * 4) * s);
            for (let x = Math.round(10 * s); x < Math.round(22 * s); x++) set(x, y, 150, 150, 150);
        }
    }
    if (count > 1) {
        // a blue stripe at the bottom right: "several"
        for (let y = Math.round(24 * s); y < size; y++) for (let x = Math.round(18 * s); x < size; x++) set(x, y, 58, 121, 187);
        // one white dot per item, up to 4
        for (let k = 0; k < Math.min(4, count); k++) for (let y = Math.round(27 * s); y < Math.round(29 * s); y++) for (let x = Math.round((20 + k * 3) * s); x < Math.round((22 + k * 3) * s); x++) set(x, y, 255, 255, 255);
    }
    return px;
}
