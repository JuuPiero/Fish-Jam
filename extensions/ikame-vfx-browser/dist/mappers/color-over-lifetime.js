'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapColorOverLifetime = mapColorOverLifetime;
const gradient_converter_1 = require("../utils/gradient-converter");
function mapColorOverLifetime(json, ctx) {
    return {
        color: (0, gradient_converter_1.convertGradient)(json['color']),
    };
}
//# sourceMappingURL=color-over-lifetime.js.map