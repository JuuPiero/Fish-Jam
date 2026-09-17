'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRenderer = mapRenderer;
const json_helpers_1 = require("../utils/json-helpers");
function mapRenderer(json, ctx) {
    var _a, _b;
    const renderMode = mapRenderMode((0, json_helpers_1.getString)(json, 'renderMode', 'Billboard'));
    const meshId = (0, json_helpers_1.getString)(json, 'meshId', '');
    const result = {
        renderMode: renderMode.cocosMode,
        velocityScale: (0, json_helpers_1.getFloat)(json, 'velocityScale', 0),
        lengthScale: (0, json_helpers_1.getFloat)(json, 'lengthScale', 2),
        sortingFudge: (0, json_helpers_1.getFloat)(json, 'sortingFudge', 0),
    };
    if (renderMode.cocosMode === 4 && meshId) {
        const meshData = (_a = ctx.meshDataMap) === null || _a === void 0 ? void 0 : _a.get(meshId);
        if (meshData) {
            result.meshData = meshData;
        }
        else {
            ctx.warnings.push(`Node "${ctx.nodeName}": Mesh data for "${(0, json_helpers_1.getString)(json, 'meshName', '')}" not found`);
        }
        const meshUuid = (_b = ctx.meshUuidMap) === null || _b === void 0 ? void 0 : _b.get(meshId);
        if (meshUuid)
            result.meshUuid = meshUuid;
    }
    if (renderMode.warning) {
        ctx.warnings.push(`Node "${ctx.nodeName}": RenderMode "${(0, json_helpers_1.getString)(json, 'renderMode', '')}" -> ${renderMode.warning}`);
    }
    return result;
}
function mapRenderMode(mode) {
    switch (mode) {
        case 'Billboard': return { cocosMode: 0 };
        case 'Stretch': return { cocosMode: 1 };
        case 'HorizontalBillboard': return { cocosMode: 2 };
        case 'VerticalBillboard': return { cocosMode: 3 };
        case 'Mesh': return { cocosMode: 4 };
        case 'None': return { cocosMode: 0, warning: 'fallback to Billboard' };
        default: return { cocosMode: 0, warning: `fallback to Billboard (unknown: ${mode})` };
    }
}
//# sourceMappingURL=renderer.js.map