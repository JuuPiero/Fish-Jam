'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let _importReviewData = null;
const EFFECT_FILES = ['ikame-particle.effect'];
const EFFECTS_DST_DIR = 'db://assets/effects';
function ensureEffectsInstalled() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const staticDir = path.join(__dirname, '..', 'static', 'effects');
        const projectPath = ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
        for (const file of EFFECT_FILES) {
            const srcPath = path.join(staticDir, file);
            if (!fs.existsSync(srcPath)) {
                console.warn(`[IKame VFX] Effect source not found: ${srcPath}`);
                continue;
            }
            const dstDir = path.join(projectPath, 'assets', 'effects');
            const dstPath = path.join(dstDir, file);
            fs.mkdirSync(dstDir, { recursive: true });
            // Always overwrite with latest version from extension
            const srcContent = fs.readFileSync(srcPath, 'utf-8');
            const dstExists = fs.existsSync(dstPath);
            const dstContent = dstExists ? fs.readFileSync(dstPath, 'utf-8') : '';
            if (srcContent === dstContent) {
                console.log(`[IKame VFX] Effect up to date: ${file}`);
                continue;
            }
            fs.copyFileSync(srcPath, dstPath);
            console.log(`[IKame VFX] ${dstExists ? 'Updated' : 'Installed'} effect: ${file}`);
            // Refresh asset-db so Cocos picks up the change
            try {
                yield Editor.Message.request('asset-db', 'refresh-asset', `${EFFECTS_DST_DIR}/${file}`);
            }
            catch ( /* asset-db may not be ready at startup */_b) { /* asset-db may not be ready at startup */ }
        }
    });
}
exports.methods = {
    openBrowser() {
        Editor.Panel.open('ikame-vfx-browser.browser');
    },
    openImportReview(data) {
        _importReviewData = data;
        Editor.Panel.open('ikame-vfx-browser.import-review');
    },
    getImportReviewData() {
        return _importReviewData;
    },
    startImport(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { VFXImporter } = require('./services/importer');
            const importer = new VFXImporter();
            try {
                const result = yield importer.execute(data);
                Editor.Message.send('ikame-vfx-browser', 'import-complete', result);
                return result;
            }
            catch (err) {
                const errorMsg = `Import failed: ${err.message}`;
                console.error(errorMsg);
                return { success: false, error: errorMsg };
            }
        });
    },
};
function load() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('[IKame VFX Browser] Extension loaded');
        yield ensureEffectsInstalled();
    });
}
function unload() {
    console.log('[IKame VFX Browser] Extension unloaded');
    _importReviewData = null;
}
//# sourceMappingURL=main.js.map