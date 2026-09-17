'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapEmission = mapEmission;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
function mapEmission(json, ctx) {
    const bursts = (0, json_helpers_1.getArr)(json, 'bursts').map((b) => {
        var _a;
        const cycles = (_a = b.cycles) !== null && _a !== void 0 ? _a : 1;
        const repeatCount = cycles === 0 ? 999999 : cycles;
        return {
            time: (0, json_helpers_1.getFloat)(b, 'time', 0),
            repeatCount,
            repeatInterval: (0, json_helpers_1.getFloat)(b, 'interval', 0.01),
            count: (0, curve_converter_1.convertCurve)(b['count']),
        };
    });
    return {
        rateOverTime: (0, curve_converter_1.convertCurve)(json['rateOverTime']),
        rateOverDistance: (0, curve_converter_1.convertCurve)(json['rateOverDistance']),
        bursts,
    };
}
//# sourceMappingURL=emission.js.map