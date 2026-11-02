/**
 * Just enough of 'cc' to run assets/AdvancedInspector.ts (and the demo
 * component) outside the editor: Component, a few value types, and
 * ccclass/property doing what the engine does with the class cache.
 */
const CACHE_KEY = '__ccclassCache__';

export class Node {
    isValid = true;
    constructor(public name = 'Node', public uuid = 'node-uuid') {}
}

export class Component {
    isValid = true;
    node: Node | null = null;
}

export class Asset {
    isValid = true;
    constructor(public name = 'asset', public uuid = 'asset-uuid') {}
}

export class SpriteFrame extends Asset {}

export class Vec2 {
    constructor(public x = 0, public y = 0) {}
}

export class Vec3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
}

export class Vec4 {
    constructor(public x = 0, public y = 0, public z = 0, public w = 0) {}
}

export class Quat {
    constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
}

export class Size {
    constructor(public width = 0, public height = 0) {}
}

export class Rect {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
}

export class Color {
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
}

export const js = {
    getClassName(obj: any): string {
        const ctor = typeof obj === 'function' ? obj : obj?.constructor;
        return ctor?.__cid__ || ctor?.name || '';
    },
};

export const CCInteger = 'Integer';

export function Enum<T>(e: T): T {
    (e as any).__enums__ = true;
    return e;
}

export function BitMask<T>(e: T): T {
    (e as any).__bitmask__ = true;
    return e;
}

export interface PropertyStash {
    type?: unknown;
}

function cache(ctor: any) {
    return ctor[CACHE_KEY] || (ctor[CACHE_KEY] = {});
}

function stash(target: any, key: string, options: PropertyStash) {
    const c = cache(target.constructor);
    const proto = c.proto || (c.proto = {});
    const props = proto.properties || (proto.properties = {});
    props[key] = options;
}

/** `@property`, `@property(Type)` or `@property({ type })`. */
export function property(...args: any[]): any {
    if (args.length >= 2 && typeof args[1] === 'string') {
        stash(args[0], args[1], {});
        return args[2];
    }
    const a = args[0];
    const options: PropertyStash = a && typeof a === 'object' && !Array.isArray(a) && 'type' in a ? a : a !== undefined ? { type: a } : {};
    return (target: any, key: string, descriptor?: any) => {
        stash(target, key, options);
        return descriptor;
    };
}

/** Declared properties of each class, in order (base classes first). */
export const declared = new Map<any, Record<string, PropertyStash>>();

export function ccclass(name: string) {
    return (ctor: any) => {
        ctor.__cid__ = name;
        const base = declared.get(Object.getPrototypeOf(ctor)) || {};
        declared.set(ctor, { ...base, ...(ctor[CACHE_KEY]?.proto?.properties || {}) });
        ctor[CACHE_KEY] = undefined;
        return ctor;
    };
}

export const _decorator = { ccclass, property };
