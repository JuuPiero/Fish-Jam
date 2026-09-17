'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradientMode = void 0;
exports.convertGradient = convertGradient;
exports.gradientToConstantColor = gradientToConstantColor;
const json_helpers_1 = require("./json-helpers");
/**
 * Gradient mode constants matching Cocos Creator's GradientRange.mode values.
 */
exports.GradientMode = {
    Color: 0,
    Gradient: 1,
    TwoColors: 2,
    TwoGradients: 3,
    RandomColor: 4,
};
/**
 * Converts a Unity MinMaxGradient JSON object into a serializable
 * Cocos GradientRange descriptor.
 */
function convertGradient(json) {
    if (!json || typeof json !== 'object') {
        return { mode: exports.GradientMode.Color, color: { r: 255, g: 255, b: 255, a: 255 } };
    }
    const mode = (0, json_helpers_1.getString)(json, 'mode', 'color');
    switch (mode) {
        case 'color':
            return {
                mode: exports.GradientMode.Color,
                color: toCocos255((0, json_helpers_1.getColor)(json, 'value')),
            };
        case 'gradient':
            return {
                mode: exports.GradientMode.Gradient,
                gradient: convertGradientObj(json['gradient']),
            };
        case 'randomBetweenTwoColors':
            return {
                mode: exports.GradientMode.TwoColors,
                colorMin: toCocos255((0, json_helpers_1.getColor)(json, 'min')),
                colorMax: toCocos255((0, json_helpers_1.getColor)(json, 'max')),
            };
        case 'randomBetweenTwoGradients':
            return {
                mode: exports.GradientMode.TwoGradients,
                gradientMin: convertGradientObj(json['gradientMin']),
                gradientMax: convertGradientObj(json['gradientMax']),
            };
        case 'randomColor':
            return {
                mode: exports.GradientMode.RandomColor,
                gradient: convertGradientObj(json['gradient']),
            };
        default:
            return { mode: exports.GradientMode.Color, color: { r: 255, g: 255, b: 255, a: 255 } };
    }
}
/**
 * Converts a Unity Gradient JSON into Cocos-compatible gradient descriptor.
 * Unity format: { colorKeys: [[time, [r,g,b,a]], ...], alphaKeys: [[time, alpha], ...] }
 * Cocos format: { colorKeys: [{ time, color: {r,g,b,a} }], alphaKeys: [{ time, alpha }] }
 */
function convertGradientObj(gradJson) {
    if (!gradJson || typeof gradJson !== 'object') {
        return {
            colorKeys: [{ time: 0, color: { r: 255, g: 255, b: 255, a: 255 } }],
            alphaKeys: [{ time: 0, alpha: 255 }],
        };
    }
    const colorKeysRaw = (0, json_helpers_1.getArr)(gradJson, 'colorKeys');
    const alphaKeysRaw = (0, json_helpers_1.getArr)(gradJson, 'alphaKeys');
    const colorKeys = colorKeysRaw.map((ck) => {
        var _a;
        if (!Array.isArray(ck) || ck.length < 2) {
            return { time: 0, color: { r: 255, g: 255, b: 255, a: 255 } };
        }
        const time = ck[0] || 0;
        const c = Array.isArray(ck[1]) ? ck[1] : [1, 1, 1, 1];
        return {
            time,
            color: {
                r: Math.round((c[0] || 0) * 255),
                g: Math.round((c[1] || 0) * 255),
                b: Math.round((c[2] || 0) * 255),
                a: Math.round(((_a = c[3]) !== null && _a !== void 0 ? _a : 1) * 255),
            },
        };
    });
    const alphaKeys = alphaKeysRaw.map((ak) => {
        var _a;
        if (!Array.isArray(ak) || ak.length < 2) {
            return { time: 0, alpha: 255 };
        }
        return {
            time: ak[0] || 0,
            alpha: Math.round(((_a = ak[1]) !== null && _a !== void 0 ? _a : 1) * 255),
        };
    });
    return {
        colorKeys: colorKeys.length > 0 ? colorKeys : [{ time: 0, color: { r: 255, g: 255, b: 255, a: 255 } }],
        alphaKeys: alphaKeys.length > 0 ? alphaKeys : [{ time: 0, alpha: 255 }],
    };
}
/**
 * Converts a Unity color (0-1 range) to Cocos color (0-255 range).
 */
function toCocos255(c) {
    return {
        r: Math.round(c.r * 255),
        g: Math.round(c.g * 255),
        b: Math.round(c.b * 255),
        a: Math.round(c.a * 255),
    };
}
/**
 * Shortcut: extract a constant color from a MinMaxGradient JSON.
 */
function gradientToConstantColor(json) {
    if (!json || typeof json !== 'object')
        return { r: 255, g: 255, b: 255, a: 255 };
    const mode = (0, json_helpers_1.getString)(json, 'mode', 'color');
    if (mode === 'color') {
        return toCocos255((0, json_helpers_1.getColor)(json, 'value'));
    }
    return { r: 255, g: 255, b: 255, a: 255 };
}
//# sourceMappingURL=gradient-converter.js.map