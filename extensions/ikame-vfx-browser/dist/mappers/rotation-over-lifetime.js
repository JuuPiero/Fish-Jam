'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRotationOverLifetime = mapRotationOverLifetime;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
function mapRotationOverLifetime(json, ctx) {
    const result = {
        separateAxes: (0, json_helpers_1.getBool)(json, 'separateAxes', false),
        z: (0, curve_converter_1.convertCurve)(json['angularVelocity']),
    };
    if (result.separateAxes) {
        result.x = (0, curve_converter_1.convertCurve)(json['x']);
        result.y = (0, curve_converter_1.convertCurve)(json['y']);
        result.z = (0, curve_converter_1.convertCurve)(json['z']);
    }
    return result;
}
//# sourceMappingURL=rotation-over-lifetime.js.map