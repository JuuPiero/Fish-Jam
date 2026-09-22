'use strict';

import { ModuleMapper, MapperContext } from './types';
import { mapMain } from './main';
import { mapEmission } from './emission';
import { mapShape } from './shape';
import { mapVelocityOverLifetime } from './velocity-over-lifetime';
import { mapLimitVelocity } from './limit-velocity';
import { mapForceOverLifetime } from './force-over-lifetime';
import { mapColorOverLifetime } from './color-over-lifetime';
import { mapSizeOverLifetime } from './size-over-lifetime';
import { mapRotationOverLifetime } from './rotation-over-lifetime';
import { mapTextureSheet } from './texture-sheet';
import { mapTrails } from './trails';
import { mapRenderer } from './renderer';
import { createSkipMapper } from './skip-warn';
import { isModuleEnabled } from '../utils/json-helpers';

const registry: Record<string, ModuleMapper> = {
    mainModule: mapMain,
    emissionModule: mapEmission,
    shapeModule: mapShape,
    velocityOverLifetimeModule: mapVelocityOverLifetime,
    limitVelocityOverLifetimeModule: mapLimitVelocity,
    inheritVelocityModule: createSkipMapper('Inherit Velocity', 'not supported in Cocos Creator'),
    forceOverLifetimeModule: mapForceOverLifetime,
    colorOverLifetimeModule: mapColorOverLifetime,
    sizeOverLifetimeModule: mapSizeOverLifetime,
    sizeBySpeedModule: createSkipMapper('Size by Speed', 'not supported in Cocos Creator'),
    rotationOverLifetimeModule: mapRotationOverLifetime,
    rotationBySpeedModule: createSkipMapper('Rotation by Speed', 'not supported in Cocos Creator'),
    noiseModule: createSkipMapper('Noise', 'not supported in Cocos Creator'),
    collisionModule: createSkipMapper('Collision', 'not supported in Cocos Creator'),
    subEmittersModule: createSkipMapper('Sub Emitters', 'not supported in Cocos Creator'),
    textureSheetAnimationModule: mapTextureSheet,
    trailModule: mapTrails,
    rendererModule: mapRenderer,
};

export const ALL_MODULE_KEYS = Object.keys(registry);

export function mapAllModules(
    psJson: Record<string, any>,
    ctx: MapperContext
): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};

    // When renderer is disabled, kill emission so Cocos doesn't spawn invisible particles
    const rendererJson = psJson['rendererModule'];
    const rendererDisabled = rendererJson && rendererJson['enabled'] === false;

    for (const [key, mapper] of Object.entries(registry)) {
        const moduleJson = psJson[key];
        if (!moduleJson) continue;

        if (key !== 'mainModule' && key !== 'rendererModule' && !isModuleEnabled(moduleJson)) continue;

        result[key] = mapper(moduleJson, ctx);
    }

    if (rendererDisabled) {
        delete result['emissionModule'];
    }

    return result;
}

export function mapModule(
    moduleName: string,
    moduleJson: Record<string, any>,
    ctx: MapperContext
): Record<string, any> | null {
    const mapper = registry[moduleName];
    if (!mapper) {
        ctx.warnings.push(`Unknown module "${moduleName}" -- skipped`);
        return null;
    }
    return mapper(moduleJson, ctx);
}
