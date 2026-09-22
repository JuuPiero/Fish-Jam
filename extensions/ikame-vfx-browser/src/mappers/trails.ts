'use strict';

import { MapperContext } from './types';
import { getFloat, getBool } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';
import { convertGradient } from '../utils/gradient-converter';

export function mapTrails(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    return {
        ratio: convertCurve(json['ratio']),
        lifetime: convertCurve(json['lifetime']),
        minVertexDistance: getFloat(json, 'minVertexDistance', 0.2),
        worldSpace: getBool(json, 'worldSpace', false),
        dieWithParticles: getBool(json, 'dieWithParticles', true),
        widthRatio: convertCurve(json['widthOverTrail']),
        colorOverTrail: convertGradient(json['colorOverTrail']),
        colorOverLifetime: convertGradient(json['colorOverLifetime']),
    };
}
