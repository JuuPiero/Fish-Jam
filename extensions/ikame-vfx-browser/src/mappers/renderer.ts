'use strict';

import { MapperContext } from './types';
import { getString, getFloat } from '../utils/json-helpers';

export function mapRenderer(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const renderMode = mapRenderMode(getString(json, 'renderMode', 'Billboard'));
    const meshId = getString(json, 'meshId', '');

    const result: Record<string, any> = {
        renderMode: renderMode.cocosMode,
        velocityScale: getFloat(json, 'velocityScale', 0),
        lengthScale: getFloat(json, 'lengthScale', 2),
        sortingFudge: getFloat(json, 'sortingFudge', 0),
    };

    if (renderMode.cocosMode === 4 && meshId) {
        const meshData = ctx.meshDataMap?.get(meshId);
        if (meshData) {
            result.meshData = meshData;
        } else {
            ctx.warnings.push(`Node "${ctx.nodeName}": Mesh data for "${getString(json, 'meshName', '')}" not found`);
        }
        const meshUuid = ctx.meshUuidMap?.get(meshId);
        if (meshUuid) result.meshUuid = meshUuid;
    }

    if (renderMode.warning) {
        ctx.warnings.push(`Node "${ctx.nodeName}": RenderMode "${getString(json, 'renderMode', '')}" -> ${renderMode.warning}`);
    }

    return result;
}

function mapRenderMode(mode: string): { cocosMode: number; warning?: string } {
    switch (mode) {
        case 'Billboard':            return { cocosMode: 0 };
        case 'Stretch':              return { cocosMode: 1 };
        case 'HorizontalBillboard':  return { cocosMode: 2 };
        case 'VerticalBillboard':    return { cocosMode: 3 };
        case 'Mesh':                 return { cocosMode: 4 };
        case 'None':                 return { cocosMode: 0, warning: 'fallback to Billboard' };
        default:                     return { cocosMode: 0, warning: `fallback to Billboard (unknown: ${mode})` };
    }
}
