'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTrails = mapTrails;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
const gradient_converter_1 = require("../utils/gradient-converter");
function mapTrails(json, ctx) {
    return {
        ratio: (0, curve_converter_1.convertCurve)(json['ratio']),
        lifetime: (0, curve_converter_1.convertCurve)(json['lifetime']),
        minVertexDistance: (0, json_helpers_1.getFloat)(json, 'minVertexDistance', 0.2),
        worldSpace: (0, json_helpers_1.getBool)(json, 'worldSpace', false),
        dieWithParticles: (0, json_helpers_1.getBool)(json, 'dieWithParticles', true),
        widthRatio: (0, curve_converter_1.convertCurve)(json['widthOverTrail']),
        colorOverTrail: (0, gradient_converter_1.convertGradient)(json['colorOverTrail']),
        colorOverLifetime: (0, gradient_converter_1.convertGradient)(json['colorOverLifetime']),
    };
}
//# sourceMappingURL=trails.js.map