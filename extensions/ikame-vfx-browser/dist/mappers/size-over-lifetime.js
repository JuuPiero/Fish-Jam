'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSizeOverLifetime = mapSizeOverLifetime;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
function mapSizeOverLifetime(json, ctx) {
    const result = {
        separateAxes: (0, json_helpers_1.getBool)(json, 'separateAxes', false),
        size: (0, curve_converter_1.convertCurve)(json['size']),
    };
    if (result.separateAxes) {
        result.x = (0, curve_converter_1.convertCurve)(json['x']);
        result.y = (0, curve_converter_1.convertCurve)(json['y']);
        result.z = (0, curve_converter_1.convertCurve)(json['z']);
    }
    return result;
}
//# sourceMappingURL=size-over-lifetime.js.map