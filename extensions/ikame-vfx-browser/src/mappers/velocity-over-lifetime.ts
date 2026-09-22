'use strict';

import { MapperContext } from './types';
import { getString } from '../utils/json-helpers';
import { convertCurve, curveToConstant } from '../utils/curve-converter';

export function mapVelocityOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const orbX = curveToConstant(json['orbitalX']);
    const orbY = curveToConstant(json['orbitalY']);
    const orbZ = curveToConstant(json['orbitalZ']);
    if (orbX !== 0 || orbY !== 0 || orbZ !== 0) {
        ctx.warnings.push(`Node "${ctx.nodeName}": VelocityOverLifetime.orbital (not supported in Cocos Creator)`);
    }

    return {
        x: convertCurve(json['x']),
        y: convertCurve(json['y']),
        z: convertCurve(json['z']),
        space: getString(json, 'space', 'local') === 'world' ? 1 : 0,
    };
}
