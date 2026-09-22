'use strict';

import { getString, getArr, getColor } from './json-helpers';

/**
 * Gradient mode constants matching Cocos Creator's GradientRange.mode values.
 */
export const GradientMode = {
    Color: 0,
    Gradient: 1,
    TwoColors: 2,
    TwoGradients: 3,
    RandomColor: 4,
} as const;

/**
 * Converts a Unity MinMaxGradient JSON object into a serializable
 * Cocos GradientRange descriptor.
 */
export function convertGradient(json: Record<string, any>): Record<string, any> {
    if (!json || typeof json !== 'object') {
        return { mode: GradientMode.Color, color: { r: 255, g: 255, b: 255, a: 255 } };
    }

    const mode = getString(json, 'mode', 'color');

    switch (mode) {
        case 'color':
            return {
                mode: GradientMode.Color,
                color: toCocos255(getColor(json, 'value')),
            };

        case 'gradient':
            return {
                mode: GradientMode.Gradient,
                gradient: convertGradientObj(json['gradient']),
            };

        case 'randomBetweenTwoColors':
            return {
                mode: GradientMode.TwoColors,
                colorMin: toCocos255(getColor(json, 'min')),
                colorMax: toCocos255(getColor(json, 'max')),
            };

        case 'randomBetweenTwoGradients':
            return {
                mode: GradientMode.TwoGradients,
                gradientMin: convertGradientObj(json['gradientMin']),
                gradientMax: convertGradientObj(json['gradientMax']),
            };

        case 'randomColor':
            return {
                mode: GradientMode.RandomColor,
                gradient: convertGradientObj(json['gradient']),
            };

        default:
            return { mode: GradientMode.Color, color: { r: 255, g: 255, b: 255, a: 255 } };
    }
}

/**
 * Converts a Unity Gradient JSON into Cocos-compatible gradient descriptor.
 * Unity format: { colorKeys: [[time, [r,g,b,a]], ...], alphaKeys: [[time, alpha], ...] }
 * Cocos format: { colorKeys: [{ time, color: {r,g,b,a} }], alphaKeys: [{ time, alpha }] }
 */
function convertGradientObj(gradJson: any): Record<string, any> {
    if (!gradJson || typeof gradJson !== 'object') {
        return {
            colorKeys: [{ time: 0, color: { r: 255, g: 255, b: 255, a: 255 } }],
            alphaKeys: [{ time: 0, alpha: 255 }],
        };
    }

    const colorKeysRaw = getArr(gradJson, 'colorKeys');
    const alphaKeysRaw = getArr(gradJson, 'alphaKeys');

    const colorKeys = colorKeysRaw.map((ck: any) => {
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
                a: Math.round((c[3] ?? 1) * 255),
            },
        };
    });

    const alphaKeys = alphaKeysRaw.map((ak: any) => {
        if (!Array.isArray(ak) || ak.length < 2) {
            return { time: 0, alpha: 255 };
        }
        return {
            time: ak[0] || 0,
            alpha: Math.round((ak[1] ?? 1) * 255),
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
function toCocos255(c: { r: number; g: number; b: number; a: number }): { r: number; g: number; b: number; a: number } {
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
export function gradientToConstantColor(json: Record<string, any>): { r: number; g: number; b: number; a: number } {
    if (!json || typeof json !== 'object') return { r: 255, g: 255, b: 255, a: 255 };
    const mode = getString(json, 'mode', 'color');
    if (mode === 'color') {
        return toCocos255(getColor(json, 'value'));
    }
    return { r: 255, g: 255, b: 255, a: 255 };
}
