'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapVelocityOverLifetime = mapVelocityOverLifetime;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
function mapVelocityOverLifetime(json, ctx) {
    const orbX = (0, curve_converter_1.curveToConstant)(json['orbitalX']);
    const orbY = (0, curve_converter_1.curveToConstant)(json['orbitalY']);
    const orbZ = (0, curve_converter_1.curveToConstant)(json['orbitalZ']);
    if (orbX !== 0 || orbY !== 0 || orbZ !== 0) {
        ctx.warnings.push(`Node "${ctx.nodeName}": VelocityOverLifetime.orbital (not supported in Cocos Creator)`);
    }
    return {
        x: (0, curve_converter_1.convertCurve)(json['x']),
        y: (0, curve_converter_1.convertCurve)(json['y']),
        z: (0, curve_converter_1.convertCurve)(json['z']),
        space: (0, json_helpers_1.getString)(json, 'space', 'local') === 'world' ? 1 : 0,
    };
}
//# sourceMappingURL=velocity-over-lifetime.js.map