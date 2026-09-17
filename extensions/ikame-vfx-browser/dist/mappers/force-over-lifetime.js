'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapForceOverLifetime = mapForceOverLifetime;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
function mapForceOverLifetime(json, ctx) {
    return {
        x: (0, curve_converter_1.convertCurve)(json['x']),
        y: (0, curve_converter_1.convertCurve)(json['y']),
        z: (0, curve_converter_1.convertCurve)(json['z']),
        space: (0, json_helpers_1.getString)(json, 'space', 'local') === 'world' ? 1 : 0,
    };
}
//# sourceMappingURL=force-over-lifetime.js.map