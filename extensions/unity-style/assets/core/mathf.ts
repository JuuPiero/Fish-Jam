/**
 * Unity's Mathf: the same names and behaviour (written from the documented
 * behaviour, no 'cc' import). Angles are in degrees where Unity uses degrees.
 */

/** A by-reference number for SmoothDamp's currentVelocity (TypeScript has no `ref`). */
export interface Ref<T> {
    value: T;
}

/** Ken Perlin's reference permutation (public domain). */
const PERM: number[] = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180];
const P: number[] = [];
for (let i = 0; i < 512; i++) P.push(PERM[i & 255]);

function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad2(h: number, x: number, y: number): number {
    switch (h & 7) {
        case 0: return x + y;
        case 1: return -x + y;
        case 2: return x - y;
        case 3: return -x - y;
        case 4: return x;
        case 5: return -x;
        case 6: return y;
        default: return -y;
    }
}

export class Mathf {
    static readonly PI = Math.PI;
    static readonly Infinity = Infinity;
    static readonly NegativeInfinity = -Infinity;
    static readonly Deg2Rad = Math.PI / 180;
    static readonly Rad2Deg = 180 / Math.PI;
    /** The smallest positive float32 (as Unity's Mathf.Epsilon). */
    static readonly Epsilon = 1.401298e-45;

    /** The default deltaTime of SmoothDamp (Time.deltaTime once the engine side is loaded). */
    static deltaTime: () => number = () => 1 / 60;

    static Abs(f: number): number { return Math.abs(f); }
    static Sin(f: number): number { return Math.sin(f); }
    static Cos(f: number): number { return Math.cos(f); }
    static Tan(f: number): number { return Math.tan(f); }
    static Asin(f: number): number { return Math.asin(f); }
    static Acos(f: number): number { return Math.acos(f); }
    static Atan(f: number): number { return Math.atan(f); }
    static Atan2(y: number, x: number): number { return Math.atan2(y, x); }
    static Sqrt(f: number): number { return Math.sqrt(f); }
    static Pow(f: number, p: number): number { return Math.pow(f, p); }
    static Exp(f: number): number { return Math.exp(f); }
    /** Natural log, or log in `base`. */
    static Log(f: number, base?: number): number { return base === undefined ? Math.log(f) : Math.log(f) / Math.log(base); }
    static Log10(f: number): number { return Math.log(f) / Math.LN10; }
    static Floor(f: number): number { return Math.floor(f); }
    static Ceil(f: number): number { return Math.ceil(f); }
    static FloorToInt(f: number): number { return Math.floor(f); }
    static CeilToInt(f: number): number { return Math.ceil(f); }

    /** Rounds half to even, as Unity does (2.5 -> 2, 3.5 -> 4). */
    static Round(f: number): number {
        const r = Math.round(f);
        if (Math.abs(f % 1) === 0.5 && r % 2 !== 0) return r - 1;
        return r;
    }

    static RoundToInt(f: number): number { return Mathf.Round(f); }

    /** 1 for zero and positive values, -1 for negative ones. */
    static Sign(f: number): number { return f >= 0 ? 1 : -1; }

    /** Min(a, b), Min(a, b, c...) up to six values, or Min([values]). */
    static Min(a: number | number[], b?: number, c?: number, d?: number, e?: number, f?: number): number {
        const v = Array.isArray(a) ? a : [a, b, c, d, e, f];
        let m = Infinity;
        let any = false;
        for (let i = 0; i < v.length; i++) {
            if (typeof v[i] !== 'number') continue;
            any = true;
            if ((v[i] as number) < m) m = v[i] as number;
        }
        return any ? m : 0;
    }

    static Max(a: number | number[], b?: number, c?: number, d?: number, e?: number, f?: number): number {
        const v = Array.isArray(a) ? a : [a, b, c, d, e, f];
        let m = -Infinity;
        let any = false;
        for (let i = 0; i < v.length; i++) {
            if (typeof v[i] !== 'number') continue;
            any = true;
            if ((v[i] as number) > m) m = v[i] as number;
        }
        return any ? m : 0;
    }

    static Clamp(value: number, min: number, max: number): number {
        return value < min ? min : value > max ? max : value;
    }

    static Clamp01(value: number): number {
        return value < 0 ? 0 : value > 1 ? 1 : value;
    }

    static Lerp(a: number, b: number, t: number): number {
        return a + (b - a) * Mathf.Clamp01(t);
    }

    static LerpUnclamped(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    static InverseLerp(a: number, b: number, value: number): number {
        return a !== b ? Mathf.Clamp01((value - a) / (b - a)) : 0;
    }

    /** Lerp the short way around, in degrees. */
    static LerpAngle(a: number, b: number, t: number): number {
        return a + Mathf.DeltaAngle(a, b) * Mathf.Clamp01(t);
    }

    static MoveTowards(current: number, target: number, maxDelta: number): number {
        if (Math.abs(target - current) <= maxDelta) return target;
        return current + Mathf.Sign(target - current) * maxDelta;
    }

    static MoveTowardsAngle(current: number, target: number, maxDelta: number): number {
        const d = Mathf.DeltaAngle(current, target);
        if (-maxDelta < d && d < maxDelta) return target;
        return Mathf.MoveTowards(current, current + d, maxDelta);
    }

    /** Shortest difference from current to target, in degrees (-180, 180]. */
    static DeltaAngle(current: number, target: number): number {
        let d = Mathf.Repeat(target - current, 360);
        if (d > 180) d -= 360;
        return d;
    }

    /** Hermite ease between from and to. */
    static SmoothStep(from: number, to: number, t: number): number {
        t = Mathf.Clamp01(t);
        t = -2 * t * t * t + 3 * t * t;
        return to * t + from * (1 - t);
    }

    /**
     * Critically damped spring toward target (Game Programming Gems 4, ch. 1.10).
     * currentVelocity is read and written: pass the same { value } each frame.
     */
    static SmoothDamp(current: number, target: number, currentVelocity: Ref<number>, smoothTime: number, maxSpeed = Infinity, deltaTime = Mathf.deltaTime()): number {
        smoothTime = Math.max(0.0001, smoothTime);
        const omega = 2 / smoothTime;
        const x = omega * deltaTime;
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const original = target;
        const maxChange = maxSpeed * smoothTime;
        let change = Mathf.Clamp(current - target, -maxChange, maxChange);
        target = current - change;
        const temp = (currentVelocity.value + omega * change) * deltaTime;
        currentVelocity.value = (currentVelocity.value - omega * temp) * exp;
        let out = target + (change + temp) * exp;
        if (original - current > 0 === out > original) {
            out = original;
            currentVelocity.value = deltaTime > 0 ? (out - original) / deltaTime : 0;
        }
        return out;
    }

    static SmoothDampAngle(current: number, target: number, currentVelocity: Ref<number>, smoothTime: number, maxSpeed = Infinity, deltaTime = Mathf.deltaTime()): number {
        target = current + Mathf.DeltaAngle(current, target);
        return Mathf.SmoothDamp(current, target, currentVelocity, smoothTime, maxSpeed, deltaTime);
    }

    /** Wraps t into [0, length). */
    static Repeat(t: number, length: number): number {
        return Mathf.Clamp(t - Math.floor(t / length) * length, 0, length);
    }

    /** Bounces t between 0 and length. */
    static PingPong(t: number, length: number): number {
        t = Mathf.Repeat(t, length * 2);
        return length - Math.abs(t - length);
    }

    static Approximately(a: number, b: number): boolean {
        return Math.abs(b - a) < Math.max(0.000001 * Math.max(Math.abs(a), Math.abs(b)), 1.1920929e-7 * 8);
    }

    static IsPowerOfTwo(v: number): boolean {
        return v > 0 && (v & (v - 1)) === 0;
    }

    static NextPowerOfTwo(v: number): number {
        if (v <= 0) return 0;
        let p = 1;
        while (p < v) p *= 2;
        return p;
    }

    static ClosestPowerOfTwo(v: number): number {
        if (v <= 0) return 0;
        const hi = Mathf.NextPowerOfTwo(v);
        const lo = hi / 2;
        return hi - v <= v - lo ? hi : lo;
    }

    /** Smooth 2D noise in about [0, 1] (classic improved Perlin noise, remapped). */
    static PerlinNoise(x: number, y: number): number {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const u = fade(xf);
        const v = fade(yf);
        const aa = P[P[X] + Y];
        const ab = P[P[X] + Y + 1];
        const ba = P[P[X + 1] + Y];
        const bb = P[P[X + 1] + Y + 1];
        const x1 = Mathf.LerpUnclamped(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
        const x2 = Mathf.LerpUnclamped(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
        const n = Mathf.LerpUnclamped(x1, x2, v);
        return Mathf.Clamp01((n + 1) / 2);
    }
}
