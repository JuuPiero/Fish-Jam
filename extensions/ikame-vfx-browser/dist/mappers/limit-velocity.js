'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapLimitVelocity = mapLimitVelocity;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
function mapLimitVelocity(json, ctx) {
    const result = {
        speed: (0, curve_converter_1.convertCurve)(json['speed']),
        dampen: (0, json_helpers_1.getFloat)(json, 'dampen', 0),
        separateAxes: (0, json_helpers_1.getBool)(json, 'separateAxes', false),
    };
    if (result.separateAxes) {
        result.speedX = (0, curve_converter_1.convertCurve)(json['speedX']);
        result.speedY = (0, curve_converter_1.convertCurve)(json['speedY']);
        result.speedZ = (0, curve_converter_1.convertCurve)(json['speedZ']);
    }
    return result;
}
//# sourceMappingURL=limit-velocity.js.map