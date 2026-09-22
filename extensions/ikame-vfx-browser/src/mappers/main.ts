'use strict';

import { MapperContext } from './types';
import { getFloat, getBool, getString, getInt } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';
import { convertGradient } from '../utils/gradient-converter';

export function mapMain(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const result: Record<string, any> = {
        duration: getFloat(json, 'duration', 5),
        loop: getBool(json, 'looping', true),
        playOnAwake: getBool(json, 'playOnAwake', true),
        capacity: getInt(json, 'maxParticles', 1000),
        startDelay: convertCurve(json['startDelay']),
        startLifetime: convertCurve(json['startLifetime']),
        startSpeed: convertCurve(json['startSpeed']),
        startSize: convertCurve(json['startSize']),
        startColor: convertGradient(json['startColor']),
        gravityModifier: convertCurve(json['gravityModifier']),
        simulationSpace: mapSimulationSpace(getString(json, 'simulationSpace', 'local')),
        scaleSpace: mapScaleMode(getString(json, 'scalingMode', 'Local')),
    };

    if (getBool(json, 'startSize3D', false)) {
        result.startSizeX = convertCurve(json['startSizeX']);
        result.startSizeY = convertCurve(json['startSizeY']);
        result.startSizeZ = convertCurve(json['startSizeZ']);
    }

    if (getBool(json, 'startRotation3D', false)) {
        result.startRotationX = convertCurve(json['startRotationX']);
        result.startRotationY = convertCurve(json['startRotationY']);
        result.startRotationZ = convertCurve(json['startRotationZ']);
    } else {
        result.startRotationZ = convertCurve(json['startRotation']);
    }

    return result;
}

function mapSimulationSpace(space: string): number {
    switch (space) {
        case 'world': return 1;
        case 'local': return 0;
        default: return 0;
    }
}

function mapScaleMode(mode: string): number {
    switch (mode) {
        case 'Local': return 0;
        case 'Hierarchy': return 1;
        case 'Shape': return 2;
        default: return 0;
    }
}
