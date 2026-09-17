'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurveMode = void 0;
exports.convertCurve = convertCurve;
exports.convertRotationCurve = convertRotationCurve;
exports.curveToConstant = curveToConstant;
const json_helpers_1 = require("./json-helpers");
/**
 * Curve mode constants matching Cocos Creator's CurveRange.mode values.
 */
exports.CurveMode = {
    Constant: 0,
    Curve: 1,
    TwoCurves: 2,
    TwoConstants: 3,
};
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
function convertCurve(json) {
    if (!json || typeof json !== 'object') {
        return { mode: exports.CurveMode.Constant, constant: 0 };
    }
    const mode = (0, json_helpers_1.getString)(json, 'mode', 'constant');
    switch (mode) {
        case 'constant':
            return {
                mode: exports.CurveMode.Constant,
                constant: (0, json_helpers_1.getFloat)(json, 'value', 0),
            };
        case 'curve': {
            const keyframes = convertKeyframes((0, json_helpers_1.getArr)(json, 'curve'));
            const multiplier = (0, json_helpers_1.getFloat)(json, 'multiplier', 1);
            return {
                mode: exports.CurveMode.Curve,
                spline: { keyframes },
                multiplier,
            };
        }
        case 'randomBetweenTwoConstants':
            return {
                mode: exports.CurveMode.TwoConstants,
                constantMin: (0, json_helpers_1.getFloat)(json, 'min', 0),
                constantMax: (0, json_helpers_1.getFloat)(json, 'max', 0),
            };
        case 'randomBetweenTwoCurves': {
            const keyframesMin = convertKeyframes((0, json_helpers_1.getArr)(json, 'curveMin'));
            const keyframesMax = convertKeyframes((0, json_helpers_1.getArr)(json, 'curveMax'));
            const multiplier = (0, json_helpers_1.getFloat)(json, 'multiplier', 1);
            return {
                mode: exports.CurveMode.TwoCurves,
                splineMin: { keyframes: keyframesMin },
                splineMax: { keyframes: keyframesMax },
                multiplier,
            };
        }
        default:
            return { mode: exports.CurveMode.Constant, constant: 0 };
    }
}
/**
 * Converts Unity keyframe array [[time, value], ...] into
 * Cocos-compatible keyframe objects { time, value, inTangent, outTangent }.
 * Unity export has no tangent data, so we use 0 (linear-ish).
 */
function convertKeyframes(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return [{ time: 0, value: 0, inTangent: 0, outTangent: 0 }];
    }
    return arr.map((kf) => {
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
function convertRotationCurve(json) {
    var _a, _b, _c, _d, _e, _f;
    const curve = convertCurve(json);
    switch (curve.mode) {
        case exports.CurveMode.Constant:
            curve.constant = ((_a = curve.constant) !== null && _a !== void 0 ? _a : 0) * RAD2DEG;
            break;
        case exports.CurveMode.TwoConstants:
            curve.constantMin = ((_b = curve.constantMin) !== null && _b !== void 0 ? _b : 0) * RAD2DEG;
            curve.constantMax = ((_c = curve.constantMax) !== null && _c !== void 0 ? _c : 0) * RAD2DEG;
            break;
        case exports.CurveMode.Curve:
            if ((_d = curve.spline) === null || _d === void 0 ? void 0 : _d.keyframes) {
                for (const kf of curve.spline.keyframes)
                    kf.value *= RAD2DEG;
            }
            break;
        case exports.CurveMode.TwoCurves:
            if ((_e = curve.splineMin) === null || _e === void 0 ? void 0 : _e.keyframes) {
                for (const kf of curve.splineMin.keyframes)
                    kf.value *= RAD2DEG;
            }
            if ((_f = curve.splineMax) === null || _f === void 0 ? void 0 : _f.keyframes) {
                for (const kf of curve.splineMax.keyframes)
                    kf.value *= RAD2DEG;
            }
            break;
    }
    return curve;
}
/**
 * Shortcut: extract a constant float from a MinMaxCurve JSON.
 * If the curve is not constant mode, returns the value/constantMax/first keyframe value.
 */
function curveToConstant(json) {
    if (!json || typeof json !== 'object')
        return 0;
    const mode = (0, json_helpers_1.getString)(json, 'mode', 'constant');
    switch (mode) {
        case 'constant':
            return (0, json_helpers_1.getFloat)(json, 'value', 0);
        case 'randomBetweenTwoConstants':
            return (0, json_helpers_1.getFloat)(json, 'max', 0);
        case 'curve': {
            const curve = (0, json_helpers_1.getArr)(json, 'curve');
            if (curve.length > 0 && Array.isArray(curve[0])) {
                return (curve[0][1] || 0) * (0, json_helpers_1.getFloat)(json, 'multiplier', 1);
            }
            return 0;
        }
        default:
            return 0;
    }
}
//# sourceMappingURL=curve-converter.js.map