'use strict';

import { MapperContext } from './types';
import { getString, getFloat, getBool, getVec3 } from '../utils/json-helpers';

export function mapShape(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const unityShape = getString(json, 'shapeType', 'Cone');
    const mapped = mapShapeType(unityShape);

    if (mapped.warning) {
        ctx.warnings.push(`Node "${ctx.nodeName}": Shape "${unityShape}" -> ${mapped.warning}`);
    }

    return {
        shapeType: mapped.cocosType,
        emitFrom: mapped.emitFrom,
        radius: getFloat(json, 'radius', 1),
        radiusThickness: mapped.radiusThickness ?? getFloat(json, 'radiusThickness', 1),
        angle: getFloat(json, 'angle', 25),
        arc: getFloat(json, 'arc', 360),
        arcMode: mapArcMode(getString(json, 'arcMode', 'Random')),
        length: getFloat(json, 'length', 5),
        position: getVec3(json, 'position'),
        rotation: getVec3(json, 'rotation'),
        scale: getVec3(json, 'scale'),
        alignToDirection: getBool(json, 'alignToDirection', false),
    };
}

// Cocos ShapeType: Box=0, Circle=1, Cone=2, Sphere=3, Hemisphere=4
// Cocos emitFrom (Cone only): Base=0, Shell=1, Volume=2
interface ShapeMapping {
    cocosType: number;
    emitFrom: number;
    radiusThickness?: number;
    warning?: string;
}

function mapShapeType(unityType: string): ShapeMapping {
    switch (unityType) {
        // Box
        case 'Box':                 return { cocosType: 0, emitFrom: 0 };
        case 'BoxShell':            return { cocosType: 0, emitFrom: 0, warning: 'BoxShell -> Box (no shell in Cocos)' };
        case 'BoxEdge':             return { cocosType: 0, emitFrom: 0, warning: 'BoxEdge -> Box (no edge in Cocos)' };

        // Circle
        case 'Circle':              return { cocosType: 1, emitFrom: 0 };
        case 'CircleEdge':          return { cocosType: 1, emitFrom: 0, radiusThickness: 0 };

        // Cone
        case 'Cone':                return { cocosType: 2, emitFrom: 0 };
        case 'ConeShell':           return { cocosType: 2, emitFrom: 1 };
        case 'ConeVolume':          return { cocosType: 2, emitFrom: 2 };
        case 'ConeVolumeShell':     return { cocosType: 2, emitFrom: 2, radiusThickness: 0 };

        // Sphere
        case 'Sphere':              return { cocosType: 3, emitFrom: 0 };
        case 'SphereShell':         return { cocosType: 3, emitFrom: 0, radiusThickness: 0 };

        // Hemisphere
        case 'Hemisphere':          return { cocosType: 4, emitFrom: 0 };
        case 'HemisphereShell':     return { cocosType: 4, emitFrom: 0, radiusThickness: 0 };

        // Fallbacks
        case 'Donut':               return { cocosType: 1, emitFrom: 0, warning: 'Donut -> Circle' };
        case 'Edge':
        case 'SingleSidedEdge':     return { cocosType: 0, emitFrom: 0, warning: 'Edge -> Box' };
        case 'Rectangle':           return { cocosType: 0, emitFrom: 0, warning: 'Rectangle -> Box' };
        case 'Mesh':
        case 'MeshRenderer':
        case 'SkinnedMeshRenderer': return { cocosType: 0, emitFrom: 0, warning: 'Mesh -> Box' };
        case 'Sprite':
        case 'SpriteRenderer':      return { cocosType: 0, emitFrom: 0, warning: 'Sprite -> Box' };

        default:                    return { cocosType: 2, emitFrom: 0, warning: `Unknown "${unityType}" -> Cone` };
    }
}

function mapArcMode(mode: string): number {
    switch (mode) {
        case 'Random':        return 0;
        case 'Loop':          return 1;
        case 'PingPong':      return 2;
        case 'BurstSpread':   return 0;
        default:              return 0;
    }
}
