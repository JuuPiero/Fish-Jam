'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTextureSheet = mapTextureSheet;
const json_helpers_1 = require("../utils/json-helpers");
const curve_converter_1 = require("../utils/curve-converter");
function mapTextureSheet(json, ctx) {
    const mode = (0, json_helpers_1.getString)(json, 'mode', 'grid');
    const result = {
        mode: 0, // always output grid mode for Cocos
        frameOverTime: (0, curve_converter_1.convertCurve)(json['frameOverTime']),
        cycleCount: (0, json_helpers_1.getInt)(json, 'cycleCount', 1),
        startFrame: (0, curve_converter_1.convertCurve)(json['startFrame']),
    };
    if (mode === 'grid') {
        result.numTilesX = (0, json_helpers_1.getInt)(json, 'numTilesX', 1);
        result.numTilesY = (0, json_helpers_1.getInt)(json, 'numTilesY', 1);
    }
    else {
        // Sprites mode → convert to grid by analyzing sprite rects in atlas
        const spriteNames = json['sprites'] || [];
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
function spritesToGrid(spriteNames, ctx) {
    var _a, _b;
    if (!spriteNames.length || !ctx.texturesDict) {
        return { numTilesX: 1, numTilesY: 1, textureGuid: '', warning: 'TSA sprites mode: no sprite names — fallback 1x1 grid' };
    }
    // Case 1: check if sprites are sub-sprites in an atlas (Multiple sprite mode)
    for (const [guid, texInfo] of Object.entries(ctx.texturesDict)) {
        const info = texInfo;
        const sprites = info.sprites || [];
        if (!sprites.length)
            continue;
        const spriteMap = new Map();
        for (const s of sprites) {
            spriteMap.set(s.name, s);
        }
        const matched = spriteNames.filter(n => spriteMap.has(n));
        if (matched.length === 0)
            continue;
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
        const cellW = ((_a = firstSprite === null || firstSprite === void 0 ? void 0 : firstSprite.rect) === null || _a === void 0 ? void 0 : _a.width) || atlasW;
        const cellH = ((_b = firstSprite === null || firstSprite === void 0 ? void 0 : firstSprite.rect) === null || _b === void 0 ? void 0 : _b.height) || atlasH;
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
        const info = texInfo;
        if (info.name === firstSprite) {
            return { numTilesX: 1, numTilesY: 1, textureGuid: guid, warning: '' };
        }
    }
    return { numTilesX: 1, numTilesY: 1, textureGuid: '', warning: `TSA sprites mode: texture "${firstSprite}" not found — fallback 1x1 grid` };
}
//# sourceMappingURL=texture-sheet.js.map