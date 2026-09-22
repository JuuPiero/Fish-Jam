'use strict';

import { getString, getFloat, getArr } from './json-helpers';

/**
 * Curve mode constants matching Cocos Creator's CurveRange.mode values.
 */
export const CurveMode = {
    Constant: 0,
    Curve: 1,
    TwoCurves: 2,
    TwoConstants: 3,
} as const;

/**
 * Converts a Unity MinMaxCurve JSON object into a serializable
 * Cocos CurveRange descriptor.
 *
 * Input format (from ParticleJsonExporter.cs):
 *   constant:                    { mode: "constant", value: N }
 *   curve:                       { mode: "curve", curve: [[t,v],...], multiplier: N }
 *   randomBetweenTwoConstants:   { mode: "randomBetweenTwoConstants", min: N, max: N }
 *   randomBetweenTwoCurves:      { mode: "randomBetweenTwoCurves", curveMin: [[t,v],...], curveMax: [[t,v],...], multiplier: N }
 */
export function convertCurve(json: Record<string, any>): Record<string, any> {
    if (!json || typeof json !== 'object') {
        return { mode: CurveMode.Constant, constant: 0 };
    }

    const mode = getString(json, 'mode', 'constant');

    switch (mode) {
        case 'constant':
            return {
                mode: CurveMode.Constant,
                constant: getFloat(json, 'value', 0),
            };

        case 'curve': {
            const keyframes = convertKeyframes(getArr(json, 'curve'));
            const multiplier = getFloat(json, 'multiplier', 1);
            return {
                mode: CurveMode.Curve,
                spline: { keyframes },
                multiplier,
            };
        }

        case 'randomBetweenTwoConstants':
            return {
                mode: CurveMode.TwoConstants,
                constantMin: getFloat(json, 'min', 0),
                constantMax: getFloat(json, 'max', 0),
            };

        case 'randomBetweenTwoCurves': {
            const keyframesMin = convertKeyframes(getArr(json, 'curveMin'));
            const keyframesMax = convertKeyframes(getArr(json, 'curveMax'));
            const multiplier = getFloat(json, 'multiplier', 1);
            return {
                mode: CurveMode.TwoCurves,
                splineMin: { keyframes: keyframesMin },
                splineMax: { keyframes: keyframesMax },
                multiplier,
            };
        }

        default:
            return { mode: CurveMode.Constant, constant: 0 };
    }
}

/**
 * Converts Unity keyframe array [[time, value], ...] into
 * Cocos-compatible keyframe objects { time, value, inTangent, outTangent }.
 * Unity export has no tangent data, so we use 0 (linear-ish).
 */
function convertKeyframes(arr: any[]): Array<{ time: number; value: number; inTangent: number; outTangent: number }> {
    if (!Array.isArray(arr) || arr.length === 0) {
        return [{ time: 0, value: 0, inTangent: 0, outTangent: 0 }];
    }
    return arr.map((kf: any) => {
        const time = Array.isArray(kf) ? (kf[0] || 0) : 0;
        const value = Array.isArray(kf) ? (kf[1] || 0) : 0;
        return { time, value, inTangent: 0, outTangent: 0 };
    });
}

const RAD2DEG = 180 / Math.PI;

/**
 * Convert a Unity MinMaxCurve from radians to degrees.
 * Unity exports startRotation and rotationOverLifetime in radians;
 * Cocos Creator expects degrees.
 */
export function convertRotationCurve(json: Record<string, any>): Record<string, any> {
    const curve = convertCurve(json);
    switch (curve.mode) {
        case CurveMode.Constant:
            curve.constant = (curve.constant ?? 0) * RAD2DEG;
            break;
        case CurveMode.TwoConstants:
            curve.constantMin = (curve.constantMin ?? 0) * RAD2DEG;
            curve.constantMax = (curve.constantMax ?? 0) * RAD2DEG;
            break;
        case CurveMode.Curve:
            if (curve.spline?.keyframes) {
                for (const kf of curve.spline.keyframes) kf.value *= RAD2DEG;
            }
            break;
        case CurveMode.TwoCurves:
            if (curve.splineMin?.keyframes) {
                for (const kf of curve.splineMin.keyframes) kf.value *= RAD2DEG;
            }
            if (curve.splineMax?.keyframes) {
                for (const kf of curve.splineMax.keyframes) kf.value *= RAD2DEG;
            }
            break;
    }
    return curve;
}

/**
 * Shortcut: extract a constant float from a MinMaxCurve JSON.
 * If the curve is not constant mode, returns the value/constantMax/first keyframe value.
 */
export function curveToConstant(json: Record<string, any>): number {
    if (!json || typeof json !== 'object') return 0;
    const mode = getString(json, 'mode', 'constant');
    switch (mode) {
        case 'constant':
            return getFloat(json, 'value', 0);
        case 'randomBetweenTwoConstants':
            return getFloat(json, 'max', 0);
        case 'curve': {
            const curve = getArr(json, 'curve');
            if (curve.length > 0 && Array.isArray(curve[0])) {
                return (curve[0][1] || 0) * getFloat(json, 'multiplier', 1);
            }
            return 0;
        }
        default:
            return 0;
    }
}
