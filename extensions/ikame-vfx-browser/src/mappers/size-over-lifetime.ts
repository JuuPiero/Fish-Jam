'use strict';

import { MapperContext } from './types';
import { getBool } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

export function mapSizeOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const result: Record<string, any> = {
        separateAxes: getBool(json, 'separateAxes', false),
        size: convertCurve(json['size']),
    };

    if (result.separateAxes) {
        result.x = convertCurve(json['x']);
        result.y = convertCurve(json['y']);
        result.z = convertCurve(json['z']);
    }

    return result;
}
