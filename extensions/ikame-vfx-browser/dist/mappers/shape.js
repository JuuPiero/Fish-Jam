'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapShape = mapShape;
const json_helpers_1 = require("../utils/json-helpers");
function mapShape(json, ctx) {
    var _a;
    const unityShape = (0, json_helpers_1.getString)(json, 'shapeType', 'Cone');
    const mapped = mapShapeType(unityShape);
    if (mapped.warning) {
        ctx.warnings.push(`Node "${ctx.nodeName}": Shape "${unityShape}" -> ${mapped.warning}`);
    }
    return {
        shapeType: mapped.cocosType,
        emitFrom: mapped.emitFrom,
        radius: (0, json_helpers_1.getFloat)(json, 'radius', 1),
        radiusThickness: (_a = mapped.radiusThickness) !== null && _a !== void 0 ? _a : (0, json_helpers_1.getFloat)(json, 'radiusThickness', 1),
        angle: (0, json_helpers_1.getFloat)(json, 'angle', 25),
        arc: (0, json_helpers_1.getFloat)(json, 'arc', 360),
        arcMode: mapArcMode((0, json_helpers_1.getString)(json, 'arcMode', 'Random')),
        length: (0, json_helpers_1.getFloat)(json, 'length', 5),
        position: (0, json_helpers_1.getVec3)(json, 'position'),
        rotation: (0, json_helpers_1.getVec3)(json, 'rotation'),
        scale: (0, json_helpers_1.getVec3)(json, 'scale'),
        alignToDirection: (0, json_helpers_1.getBool)(json, 'alignToDirection', false),
    };
}
function mapShapeType(unityType) {
    switch (unityType) {
        // Box
        case 'Box': return { cocosType: 0, emitFrom: 0 };
        case 'BoxShell': return { cocosType: 0, emitFrom: 0, warning: 'BoxShell -> Box (no shell in Cocos)' };
        case 'BoxEdge': return { cocosType: 0, emitFrom: 0, warning: 'BoxEdge -> Box (no edge in Cocos)' };
        // Circle
        case 'Circle': return { cocosType: 1, emitFrom: 0 };
        case 'CircleEdge': return { cocosType: 1, emitFrom: 0, radiusThickness: 0 };
        // Cone
        case 'Cone': return { cocosType: 2, emitFrom: 0 };
        case 'ConeShell': return { cocosType: 2, emitFrom: 1 };
        case 'ConeVolume': return { cocosType: 2, emitFrom: 2 };
        case 'ConeVolumeShell': return { cocosType: 2, emitFrom: 2, radiusThickness: 0 };
        // Sphere
        case 'Sphere': return { cocosType: 3, emitFrom: 0 };
        case 'SphereShell': return { cocosType: 3, emitFrom: 0, radiusThickness: 0 };
        // Hemisphere
        case 'Hemisphere': return { cocosType: 4, emitFrom: 0 };
        case 'HemisphereShell': return { cocosType: 4, emitFrom: 0, radiusThickness: 0 };
        // Fallbacks
        case 'Donut': return { cocosType: 1, emitFrom: 0, warning: 'Donut -> Circle' };
        case 'Edge':
        case 'SingleSidedEdge': return { cocosType: 0, emitFrom: 0, warning: 'Edge -> Box' };
        case 'Rectangle': return { cocosType: 0, emitFrom: 0, warning: 'Rectangle -> Box' };
        case 'Mesh':
        case 'MeshRenderer':
        case 'SkinnedMeshRenderer': return { cocosType: 0, emitFrom: 0, warning: 'Mesh -> Box' };
        case 'Sprite':
        case 'SpriteRenderer': return { cocosType: 0, emitFrom: 0, warning: 'Sprite -> Box' };
        default: return { cocosType: 2, emitFrom: 0, warning: `Unknown "${unityType}" -> Cone` };
    }
}
function mapArcMode(mode) {
    switch (mode) {
        case 'Random': return 0;
        case 'Loop': return 1;
        case 'PingPong': return 2;
        case 'BurstSpread': return 0;
        default: return 0;
    }
}
//# sourceMappingURL=shape.js.map