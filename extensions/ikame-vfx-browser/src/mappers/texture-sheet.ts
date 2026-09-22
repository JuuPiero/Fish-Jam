'use strict';

import { MapperContext } from './types';
import { getString, getInt } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

export function mapTextureSheet(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const mode = getString(json, 'mode', 'grid');

    const result: Record<string, any> = {
        mode: 0, // always output grid mode for Cocos
        frameOverTime: convertCurve(json['frameOverTime']),
        cycleCount: getInt(json, 'cycleCount', 1),
        startFrame: convertCurve(json['startFrame']),
    };

    if (mode === 'grid') {
        result.numTilesX = getInt(json, 'numTilesX', 1);
        result.numTilesY = getInt(json, 'numTilesY', 1);
    } else {
        // Sprites mode → convert to grid by analyzing sprite rects in atlas
        const spriteNames: string[] = json['sprites'] || [];
        const gridInfo = spritesToGrid(spriteNames, ctx);
        result.numTilesX = gridInfo.numTilesX;
        result.numTilesY = gridInfo.numTilesY;
        if (gridInfo.textureGuid) {
            result.overrideTextureGuid = gridInfo.textureGuid;
        }
        if (gridInfo.warning) {
            ctx.warnings.push(`Node "${ctx.nodeName}": ${gridInfo.warning}`);
        }
    }

    return result;
}

function spritesToGrid(
    spriteNames: string[],
    ctx: MapperContext
): { numTilesX: number; numTilesY: number; textureGuid: string; warning: string } {
    if (!spriteNames.length || !ctx.texturesDict) {
        return { numTilesX: 1, numTilesY: 1, textureGuid: '', warning: 'TSA sprites mode: no sprite names — fallback 1x1 grid' };
    }

    // Case 1: check if sprites are sub-sprites in an atlas (Multiple sprite mode)
    for (const [guid, texInfo] of Object.entries(ctx.texturesDict)) {
        const info = texInfo as any;
        const sprites: any[] = info.sprites || [];
        if (!sprites.length) continue;

        const spriteMap = new Map<string, any>();
        for (const s of sprites) {
            spriteMap.set(s.name, s);
        }

        const matched = spriteNames.filter(n => spriteMap.has(n));
        if (matched.length === 0) continue;

        // Compute actual atlas size from sprite rects — tex.width may be
        // scaled down by Unity's maxTextureSize while rects keep original coords
        let atlasW = info.width || 1;
        let atlasH = info.height || 1;
        for (const s of sprites) {
            const r = s.rect;
            if (r) {
                atlasW = Math.max(atlasW, Math.ceil(r.x + r.width));
                atlasH = Math.max(atlasH, Math.ceil(r.y + r.height));
            }
        }

        const firstSprite = spriteMap.get(matched[0]);
        const cellW = firstSprite?.rect?.width || atlasW;
        const cellH = firstSprite?.rect?.height || atlasH;
        const numTilesX = Math.max(1, Math.round(atlasW / cellW));
        const numTilesY = Math.max(1, Math.round(atlasH / cellH));

        let warning = '';
        if (matched.length < spriteNames.length) {
            warning = `TSA sprites mode: ${spriteNames.length - matched.length} sprites not found in atlas — converted to ${numTilesX}x${numTilesY} grid`;
        }
        return { numTilesX, numTilesY, textureGuid: guid, warning };
    }

    // Case 2: sprites are individual textures (Single sprite mode) — match by texture name
    const firstSprite = spriteNames[0];
    for (const [guid, texInfo] of Object.entries(ctx.texturesDict)) {
        const info = texInfo as any;
        if (info.name === firstSprite) {
            return { numTilesX: 1, numTilesY: 1, textureGuid: guid, warning: '' };
        }
    }

    return { numTilesX: 1, numTilesY: 1, textureGuid: '', warning: `TSA sprites mode: texture "${firstSprite}" not found — fallback 1x1 grid` };
}
