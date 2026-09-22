'use strict';

import { MapperContext } from './types';
import { getFloat, getArr } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

export function mapEmission(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const bursts = getArr(json, 'bursts').map((b: any) => {
        const cycles = b.cycles ?? 1;
        const repeatCount = cycles === 0 ? 999999 : cycles;
        return {
            time: getFloat(b, 'time', 0),
            repeatCount,
            repeatInterval: getFloat(b, 'interval', 0.01),
            count: convertCurve(b['count']),
        };
    });

    return {
        rateOverTime: convertCurve(json['rateOverTime']),
        rateOverDistance: convertCurve(json['rateOverDistance']),
        bursts,
    };
}
