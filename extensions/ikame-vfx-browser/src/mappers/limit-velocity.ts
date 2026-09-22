'use strict';

import { MapperContext } from './types';
import { getFloat, getBool } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

export function mapLimitVelocity(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const result: Record<string, any> = {
        speed: convertCurve(json['speed']),
        dampen: getFloat(json, 'dampen', 0),
        separateAxes: getBool(json, 'separateAxes', false),
    };

    if (result.separateAxes) {
        result.speedX = convertCurve(json['speedX']);
        result.speedY = convertCurve(json['speedY']);
        result.speedZ = convertCurve(json['speedZ']);
    }

    return result;
}
