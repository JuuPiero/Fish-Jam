'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_MODULE_KEYS = void 0;
exports.mapAllModules = mapAllModules;
exports.mapModule = mapModule;
const main_1 = require("./main");
const emission_1 = require("./emission");
const shape_1 = require("./shape");
const velocity_over_lifetime_1 = require("./velocity-over-lifetime");
const limit_velocity_1 = require("./limit-velocity");
const force_over_lifetime_1 = require("./force-over-lifetime");
const color_over_lifetime_1 = require("./color-over-lifetime");
const size_over_lifetime_1 = require("./size-over-lifetime");
const rotation_over_lifetime_1 = require("./rotation-over-lifetime");
const texture_sheet_1 = require("./texture-sheet");
const trails_1 = require("./trails");
const renderer_1 = require("./renderer");
const skip_warn_1 = require("./skip-warn");
const json_helpers_1 = require("../utils/json-helpers");
const registry = {
    mainModule: main_1.mapMain,
    emissionModule: emission_1.mapEmission,
    shapeModule: shape_1.mapShape,
    velocityOverLifetimeModule: velocity_over_lifetime_1.mapVelocityOverLifetime,
    limitVelocityOverLifetimeModule: limit_velocity_1.mapLimitVelocity,
    inheritVelocityModule: (0, skip_warn_1.createSkipMapper)('Inherit Velocity', 'not supported in Cocos Creator'),
    forceOverLifetimeModule: force_over_lifetime_1.mapForceOverLifetime,
    colorOverLifetimeModule: color_over_lifetime_1.mapColorOverLifetime,
    sizeOverLifetimeModule: size_over_lifetime_1.mapSizeOverLifetime,
    sizeBySpeedModule: (0, skip_warn_1.createSkipMapper)('Size by Speed', 'not supported in Cocos Creator'),
    rotationOverLifetimeModule: rotation_over_lifetime_1.mapRotationOverLifetime,
    rotationBySpeedModule: (0, skip_warn_1.createSkipMapper)('Rotation by Speed', 'not supported in Cocos Creator'),
    noiseModule: (0, skip_warn_1.createSkipMapper)('Noise', 'not supported in Cocos Creator'),
    collisionModule: (0, skip_warn_1.createSkipMapper)('Collision', 'not supported in Cocos Creator'),
    subEmittersModule: (0, skip_warn_1.createSkipMapper)('Sub Emitters', 'not supported in Cocos Creator'),
    textureSheetAnimationModule: texture_sheet_1.mapTextureSheet,
    trailModule: trails_1.mapTrails,
    rendererModule: renderer_1.mapRenderer,
};
exports.ALL_MODULE_KEYS = Object.keys(registry);
function mapAllModules(psJson, ctx) {
    const result = {};
    // When renderer is disabled, kill emission so Cocos doesn't spawn invisible particles
    const rendererJson = psJson['rendererModule'];
    const rendererDisabled = rendererJson && rendererJson['enabled'] === false;
    for (const [key, mapper] of Object.entries(registry)) {
        const moduleJson = psJson[key];
        if (!moduleJson)
            continue;
        if (key !== 'mainModule' && key !== 'rendererModule' && !(0, json_helpers_1.isModuleEnabled)(moduleJson))
            continue;
        result[key] = mapper(moduleJson, ctx);
    }
    if (rendererDisabled) {
        delete result['emissionModule'];
    }
    return result;
}
function mapModule(moduleName, moduleJson, ctx) {
    const mapper = registry[moduleName];
    if (!mapper) {
        ctx.warnings.push(`Unknown module "${moduleName}" -- skipped`);
        return null;
    }
    return mapper(moduleJson, ctx);
}
//# sourceMappingURL=index.js.map