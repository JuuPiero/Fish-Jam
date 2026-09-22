'use strict';

import { MapperContext } from './types';
import { convertGradient } from '../utils/gradient-converter';

export function mapColorOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    return {
        color: convertGradient(json['color']),
    };
}
