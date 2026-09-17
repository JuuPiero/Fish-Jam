'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapMain = mapMain;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
const gradient_converter_1 = require("../utils/gradient-converter");
function mapMain(json, ctx) {
    const result = {
        duration: (0, json_helpers_1.getFloat)(json, 'duration', 5),
        loop: (0, json_helpers_1.getBool)(json, 'looping', true),
        playOnAwake: (0, json_helpers_1.getBool)(json, 'playOnAwake', true),
        capacity: (0, json_helpers_1.getInt)(json, 'maxParticles', 1000),
        startDelay: (0, curve_converter_1.convertCurve)(json['startDelay']),
        startLifetime: (0, curve_converter_1.convertCurve)(json['startLifetime']),
        startSpeed: (0, curve_converter_1.convertCurve)(json['startSpeed']),
        startSize: (0, curve_converter_1.convertCurve)(json['startSize']),
        startColor: (0, gradient_converter_1.convertGradient)(json['startColor']),
        gravityModifier: (0, curve_converter_1.convertCurve)(json['gravityModifier']),
        simulationSpace: mapSimulationSpace((0, json_helpers_1.getString)(json, 'simulationSpace', 'local')),
        scaleSpace: mapScaleMode((0, json_helpers_1.getString)(json, 'scalingMode', 'Local')),
    };
    if ((0, json_helpers_1.getBool)(json, 'startSize3D', false)) {
        result.startSizeX = (0, curve_converter_1.convertCurve)(json['startSizeX']);
        result.startSizeY = (0, curve_converter_1.convertCurve)(json['startSizeY']);
        result.startSizeZ = (0, curve_converter_1.convertCurve)(json['startSizeZ']);
    }
    if ((0, json_helpers_1.getBool)(json, 'startRotation3D', false)) {
        result.startRotationX = (0, curve_converter_1.convertCurve)(json['startRotationX']);
        result.startRotationY = (0, curve_converter_1.convertCurve)(json['startRotationY']);
        result.startRotationZ = (0, curve_converter_1.convertCurve)(json['startRotationZ']);
    }
    else {
        result.startRotationZ = (0, curve_converter_1.convertCurve)(json['startRotation']);
    }
    return result;
}
function mapSimulationSpace(space) {
    switch (space) {
        case 'world': return 1;
        case 'local': return 0;
        default: return 0;
    }
}
function mapScaleMode(mode) {
    switch (mode) {
        case 'Local': return 0;
        case 'Hierarchy': return 1;
        case 'Shape': return 2;
        default: return 0;
    }
}
//# sourceMappingURL=main.js.map