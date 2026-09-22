'use strict';

/** Safely get a string value from a JSON object */
export function getString(obj: Record<string, any>, key: string, fallback: string = ''): string {
    const val = obj[key];
    return typeof val === 'string' ? val : fallback;
}

/** Safely get a number value from a JSON object */
export function getFloat(obj: Record<string, any>, key: string, fallback: number = 0): number {
    const val = obj[key];
    return typeof val === 'number' ? val : fallback;
}

/** Safely get an integer value from a JSON object */
export function getInt(obj: Record<string, any>, key: string, fallback: number = 0): number {
    const val = obj[key];
    return typeof val === 'number' ? Math.round(val) : fallback;
}

/** Safely get a boolean value from a JSON object */
export function getBool(obj: Record<string, any>, key: string, fallback: boolean = false): boolean {
    const val = obj[key];
    return typeof val === 'boolean' ? val : fallback;
}

/** Safely get a nested object from a JSON object */
export function getObj(obj: Record<string, any>, key: string): Record<string, any> | null {
    const val = obj[key];
    return val && typeof val === 'object' && !Array.isArray(val) ? val : null;
}

/** Safely get an array from a JSON object */
export function getArr(obj: Record<string, any>, key: string): any[] {
    const val = obj[key];
    return Array.isArray(val) ? val : [];
}

/** Get a Vec3 from a JSON array [x,y,z] */
export function getVec3(obj: Record<string, any>, key: string): { x: number; y: number; z: number } {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 3) {
        return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0 };
    }
    return { x: 0, y: 0, z: 0 };
}

/** Get a Quaternion from a JSON array [x,y,z,w] */
export function getQuat(obj: Record<string, any>, key: string): { x: number; y: number; z: number; w: number } {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 4) {
        return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0, w: arr[3] || 1 };
    }
    return { x: 0, y: 0, z: 0, w: 1 };
}

/** Get a Color from a JSON array [r,g,b,a] (0-1 range) */
export function getColor(obj: Record<string, any>, key: string): { r: number; g: number; b: number; a: number } {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 4) {
        return { r: arr[0] || 0, g: arr[1] || 0, b: arr[2] || 0, a: arr[3] || 1 };
    }
    return { r: 1, g: 1, b: 1, a: 1 };
}

/** Check if a module JSON has enabled: true */
export function isModuleEnabled(obj: Record<string, any>): boolean {
    return getBool(obj, 'enabled', false);
}
