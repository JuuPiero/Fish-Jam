'use strict';

import { MapperContext } from './types';

/** Creates a mapper that skips the module and logs a warning */
export function createSkipMapper(moduleName: string, reason: string) {
    return function skipMapper(_moduleJson: Record<string, any>, ctx: MapperContext): Record<string, any> {
        ctx.warnings.push(`Node "${ctx.nodeName}": ${moduleName} (${reason})`);
        return { _skipped: true, moduleName, reason };
    };
}
