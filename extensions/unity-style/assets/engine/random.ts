import { Color, Quat, Vec2, Vec3 } from 'cc';

/** xorshift128 state (seeded from Math.random until InitState). */
const s = [0, 0, 0, 0];

function seed(n: number): void {
    // splitmix32 to spread the seed over the four words
    let x = n | 0;
    for (let i = 0; i < 4; i++) {
        x = (x + 0x9e3779b9) | 0;
        let z = x;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
        s[i] = (z ^ (z >>> 16)) | 0;
    }
    if (!(s[0] | s[1] | s[2] | s[3])) s[0] = 1;
}

seed((Math.random() * 0x7fffffff) | 0);

function nextU32(): number {
    let t = s[3];
    const w = s[0];
    s[3] = s[2];
    s[2] = s[1];
    s[1] = w;
    t ^= t << 11;
    t ^= t >>> 8;
    s[0] = t ^ w ^ (w >>> 19);
    return s[0] >>> 0;
}

/** [0, 1) */
function next01(): number {
    return nextU32() / 4294967296;
}

/**
 * Unity's Random, seedable with InitState.
 *
 * Range(min, max) is always a float in [min, max]: TypeScript cannot tell
 * Unity's int overload from the float one. Use RangeInt(min, max) for an
 * integer in [min, max) (max exclusive, as Unity's int Range).
 */
export class Random {
    static InitState(seedValue: number): void {
        seed(seedValue);
    }

    /** Float in [0, 1]. */
    static get value(): number {
        return nextU32() / 4294967295;
    }

    /** Float in [min, max]. */
    static Range(min: number, max: number): number {
        return min + (max - min) * Random.value;
    }

    /** Integer in [min, max) (max exclusive); min when max <= min. */
    static RangeInt(min: number, max: number): number {
        min = Math.ceil(min);
        max = Math.ceil(max);
        if (max <= min) return min;
        return min + Math.floor(next01() * (max - min));
    }

    static get insideUnitCircle(): Vec2 {
        const a = next01() * Math.PI * 2;
        const r = Math.sqrt(next01());
        return new Vec2(Math.cos(a) * r, Math.sin(a) * r);
    }

    static get onUnitSphere(): Vec3 {
        const z = next01() * 2 - 1;
        const a = next01() * Math.PI * 2;
        const r = Math.sqrt(1 - z * z);
        return new Vec3(Math.cos(a) * r, Math.sin(a) * r, z);
    }

    static get insideUnitSphere(): Vec3 {
        const v = Random.onUnitSphere;
        return v.multiplyScalar(Math.cbrt(next01()));
    }

    /** A uniformly random rotation. */
    static get rotation(): Quat {
        const u1 = next01();
        const u2 = next01() * Math.PI * 2;
        const u3 = next01() * Math.PI * 2;
        const a = Math.sqrt(1 - u1);
        const b = Math.sqrt(u1);
        return new Quat(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
    }

    /** A colour from HSV ranges (0..1 each). */
    static ColorHSV(hueMin = 0, hueMax = 1, saturationMin = 0, saturationMax = 1, valueMin = 0, valueMax = 1): Color {
        const h = Random.Range(hueMin, hueMax);
        const sat = Random.Range(saturationMin, saturationMax);
        const v = Random.Range(valueMin, valueMax);
        const c = new Color();
        c.fromHSV(h, sat, v);
        return c;
    }
}
