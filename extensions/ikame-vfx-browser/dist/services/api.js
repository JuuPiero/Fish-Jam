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
exports.VFXApiClient = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
class VFXApiClient {
    constructor(serverUrl) {
        // Remove trailing slash
        this.serverUrl = serverUrl.replace(/\/+$/, '');
    }
    /** Fetch the full VFX catalog */
    fetchCatalog() {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.getJson(`${this.serverUrl}/api/vfx/catalog`);
            return data;
        });
    }
    /** Download particle.json for a VFX item */
    downloadParticleJson(vfxId) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.getJson(`${this.serverUrl}/api/vfx/${encodeURIComponent(vfxId)}/particle-json`);
            return data;
        });
    }
    /** Download asset binary (texture or mesh) */
    downloadAssetBinary(guid) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getBuffer(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}`);
        });
    }
    /** Download asset metadata JSON (for materials) */
    downloadAssetMeta(guid) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.getJson(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}/meta`);
            return data;
        });
    }
    /** Check if an asset exists on the server */
    assetExists(guid) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                const url = new url_1.URL(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}`);
                const mod = url.protocol === 'https:' ? https : http;
                const req = mod.request(url, { method: 'HEAD' }, (res) => {
                    resolve(res.statusCode === 200);
                });
                req.on('error', () => resolve(false));
                req.end();
            });
        });
    }
    /** GET request returning parsed JSON */
    getJson(urlStr) {
        return new Promise((resolve, reject) => {
            const url = new url_1.URL(urlStr);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
                    res.resume();
                    return;
                }
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const body = Buffer.concat(chunks).toString('utf-8');
                        resolve(JSON.parse(body));
                    }
                    catch (err) {
                        reject(new Error(`JSON parse error from ${urlStr}: ${err.message}`));
                    }
                });
            });
            req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
        });
    }
    /** GET request returning raw Buffer */
    getBuffer(urlStr) {
        return new Promise((resolve, reject) => {
            const url = new url_1.URL(urlStr);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
                    res.resume();
                    return;
                }
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
        });
    }
}
exports.VFXApiClient = VFXApiClient;
//# sourceMappingURL=api.js.map