'use strict';

import { MapperContext } from './types';
import { getString } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

export function mapForceOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    return {
        x: convertCurve(json['x']),
        y: convertCurve(json['y']),
        z: convertCurve(json['z']),
        space: getString(json, 'space', 'local') === 'world' ? 1 : 0,
    };
}
