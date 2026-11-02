// The official spine-core runtimes, 4.2 and 4.3, bundled as CommonJS by
// scripts/build-libs.js. Both are needed: each one only reads its own export
// format (4.3 keeps ik / transform / path / physics in one "constraints" list).
import type * as S42 from 'spine-core-42';
import type * as S43 from 'spine-core-43';
// CommonJS bundles without typings (the types come from the npm packages
// above). Cocos only guesses the .ts extension, so .js imports spell it out.
// @ts-ignore
import * as lib42 from '../lib/spine-core-4.2.js';
// @ts-ignore
import * as lib43 from '../lib/spine-core-4.3.js';

function unwrap<T>(mod: any): T {
    // Cocos may hand CommonJS modules over as a namespace or under `default`.
    return (mod && mod.SkeletonJson ? mod : mod && mod.default) as T;
}

export const spine42 = unwrap<typeof S42>(lib42);
export const spine43 = unwrap<typeof S43>(lib43);

export type { S42, S43 };

/** The runtimes this extension ships. */
export type RuntimeVersion = '4.2' | '4.3';

export interface VersionInfo {
    /** Editor version written in the export, e.g. "4.3.26" ('' if unknown). */
    exported: string;
    /** Runtime used to read it, or null when the format isn't supported (3.x). */
    runtime: RuntimeVersion | null;
}

function runtimeFor(version: string): RuntimeVersion | null {
    const m = /^(\d+)\.(\d+)/.exec(version);
    if (!m) return null;
    const major = +m[1];
    const minor = +m[2];
    if (major === 4 && minor >= 3) return '4.3';
    if (major === 4) return '4.2';
    if (major > 4) return '4.3';
    return null;
}

function readVarint(b: Uint8Array, p: { i: number }): number {
    let result = 0;
    let shift = 0;
    for (let n = 0; n < 5 && p.i < b.length; n++) {
        const byte = b[p.i++];
        result |= (byte & 0x7f) << shift;
        if (!(byte & 0x80)) break;
        shift += 7;
    }
    return result >>> 0;
}

function readString(b: Uint8Array, p: { i: number }): string | null {
    const count = readVarint(b, p);
    if (count === 0) return null;
    if (count - 1 > 64 || p.i + count - 1 > b.length) return null;
    let s = '';
    for (let n = 0; n < count - 1; n++) s += String.fromCharCode(b[p.i++]);
    return s;
}

/** Version of a binary (.skel) export: 4.x starts with an 8 byte hash, 3.x with a hash string. */
export function binaryVersion(bytes: Uint8Array): string {
    const looksLikeVersion = (s: string | null) => !!s && /^\d+\.\d+/.test(s);
    let p = { i: 8 };
    let v = readString(bytes, p);
    if (looksLikeVersion(v)) return v!;
    p = { i: 0 };
    readString(bytes, p);
    v = readString(bytes, p);
    return looksLikeVersion(v) ? v! : '';
}

/** Which runtime reads this export (JSON object/string or binary bytes). */
export function detectVersion(json: any, binary: Uint8Array | null): VersionInfo {
    let exported = '';
    if (json) {
        const obj = typeof json === 'string' ? JSON.parse(json) : json;
        exported = String(obj?.skeleton?.spine ?? '');
    } else if (binary) {
        exported = binaryVersion(binary);
    }
    return { exported, runtime: runtimeFor(exported) };
}
