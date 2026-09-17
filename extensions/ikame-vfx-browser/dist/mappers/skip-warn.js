'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSkipMapper = createSkipMapper;
/** Creates a mapper that skips the module and logs a warning */
function createSkipMapper(moduleName, reason) {
    return function skipMapper(_moduleJson, ctx) {
        ctx.warnings.push(`Node "${ctx.nodeName}": ${moduleName} (${reason})`);
        return { _skipped: true, moduleName, reason };
    };
}
//# sourceMappingURL=skip-warn.js.map