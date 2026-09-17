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
exports.VFXImporter = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const api_1 = require("./api");
const index_1 = require("../mappers/index");
const json_helpers_1 = require("../utils/json-helpers");
const mesh_to_glb_1 = require("../utils/mesh-to-glb");
const BUILTIN_PARTICLE_EFFECT_UUID = 'd1346436-ac96-4271-b863-1f4fdead95b0';
const IKAME_EFFECT_PATH = 'db://assets/effects/ikame-particle.effect';
function resolveIkameEffectUuid() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const info = yield Editor.Message.request('asset-db', 'query-asset-info', IKAME_EFFECT_PATH);
            if (info === null || info === void 0 ? void 0 : info.uuid) {
                console.log(`[IKame VFX] Using custom effect: ${info.uuid}`);
                return info.uuid;
            }
        }
        catch ( /* not found */_a) { /* not found */ }
        console.log(`[IKame VFX] Custom effect not found, fallback to built-in`);
        return BUILTIN_PARTICLE_EFFECT_UUID;
    });
}
class VFXImporter {
    constructor() {
        this._effectUuid = BUILTIN_PARTICLE_EFFECT_UUID;
    }
    execute(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            console.log('[IKame VFX] Import started');
            this._effectUuid = yield resolveIkameEffectUuid();
            const { prefabName, importFolder, particleJson, entries, serverUrl } = data;
            const api = new api_1.VFXApiClient(serverUrl);
            const warnings = [];
            let texturesImported = 0;
            let materialsCreated = 0;
            let meshesImported = 0;
            const texturePaths = new Map();
            const meshPaths = new Map();
            const meshDataMap = new Map();
            const materialPaths = new Map();
            const selectedEntries = entries.filter(e => e.selected);
            const prefabDir = `db://${importFolder}/${prefabName}`;
            // Phase 1: import textures & meshes
            for (const entry of selectedEntries) {
                try {
                    if (entry.status === 'exists' && entry.existingPath) {
                        this.recordPath(entry, texturePaths, meshPaths, materialPaths, entry.existingPath);
                        continue;
                    }
                    switch (entry.type) {
                        case 'texture': {
                            const buffer = yield api.downloadAssetBinary(entry.guid);
                            const ext = this.guessTextureExt(entry.name);
                            const assetUrl = `${prefabDir}/textures/${entry.name}${ext}`;
                            yield this.writeAssetBinary(assetUrl, buffer);
                            texturePaths.set(entry.guid, assetUrl);
                            texturesImported++;
                            break;
                        }
                        case 'mesh': {
                            const meshRaw = yield api.downloadAssetBinary(entry.guid);
                            const meshJsonStr = meshRaw.toString('utf-8');
                            const meshJson = JSON.parse(meshJsonStr);
                            const flatMesh = this.flattenMeshJson(meshJson);
                            meshDataMap.set(entry.guid, flatMesh);
                            const glbBuffer = (0, mesh_to_glb_1.meshToGlb)(flatMesh, entry.name);
                            const assetUrl = `${prefabDir}/meshes/${entry.name}.glb`;
                            yield this.writeAssetBinary(assetUrl, glbBuffer);
                            meshPaths.set(entry.guid, assetUrl);
                            meshesImported++;
                            break;
                        }
                        case 'material': {
                            const meta = yield api.downloadAssetMeta(entry.guid);
                            materialPaths.set(entry.guid, JSON.stringify(meta));
                            materialsCreated++;
                            break;
                        }
                        default:
                            warnings.push(`Unknown asset type "${entry.type}" for "${entry.name}" — skipped`);
                    }
                }
                catch (err) {
                    warnings.push(`Failed to import ${entry.type} "${entry.name}": ${err.message}`);
                }
            }
            for (const entry of entries) {
                if (!entry.selected && entry.status === 'exists' && entry.existingPath) {
                    this.recordPath(entry, texturePaths, meshPaths, materialPaths, entry.existingPath);
                }
            }
            // Resolve mesh sub-asset UUIDs from imported GLB files
            const meshUuidMap = new Map();
            for (const [guid, dbUrl] of meshPaths) {
                const meshSubUuid = this.resolveMeshSubUuid(dbUrl);
                if (meshSubUuid) {
                    meshUuidMap.set(guid, meshSubUuid);
                }
                else {
                    warnings.push(`Failed to resolve mesh sub-UUID for "${dbUrl}"`);
                }
            }
            const rootNode = (0, json_helpers_1.getObj)(particleJson, 'root');
            if (!rootNode) {
                return {
                    success: false, prefabName, nodesCreated: 0,
                    texturesImported, materialsCreated, meshesImported, warnings,
                    error: 'No "root" node in particle.json',
                };
            }
            // Phase 2: create .mtl files per PS node (needs texture UUIDs from phase 1)
            const materialUuidMap = new Map(); // key = "AB|texDbUrl" -> material UUID
            const texturesDict = particleJson['textures'] || {};
            yield this.createMaterialFiles(rootNode, {
                textures: texturePaths,
                texturesDict,
                prefabDir,
                warnings,
                materialUuidMap,
            });
            materialsCreated = materialUuidMap.size;
            // Phase 3: build node descriptors (now with material UUIDs)
            const nodeDescriptors = this.buildNodeDescriptors(rootNode, {
                textures: texturePaths,
                meshes: meshPaths,
                meshDataMap,
                meshUuidMap,
                materials: materialPaths,
                importFolder,
                warnings,
                nodeName: '',
                texturesDict: particleJson['textures'] || {},
            }, materialUuidMap);
            // Phase 4: scene script creates nodes (returns psNodes for material assignment)
            let nodesCreated = 0;
            let psNodes = [];
            try {
                const result = yield Editor.Message.request('scene', 'execute-scene-script', { name: 'ikame-vfx-browser', method: 'buildVFXHierarchy', args: [nodeDescriptors, prefabDir] });
                nodesCreated = (result === null || result === void 0 ? void 0 : result.nodesCreated) || 0;
                psNodes = (result === null || result === void 0 ? void 0 : result.psNodes) || [];
                if (result === null || result === void 0 ? void 0 : result.warnings)
                    warnings.push(...result.warnings);
            }
            catch (err) {
                return {
                    success: false, prefabName, nodesCreated: 0,
                    texturesImported, materialsCreated, meshesImported, warnings,
                    error: `Scene script error: ${err.message}`,
                };
            }
            // Phase 5: assign materials & renderer via Editor scene API
            for (const psNode of psNodes) {
                // Material assignment
                if (psNode.materialUuid) {
                    try {
                        const matPaths = [
                            '__comps__.0.sharedMaterials.0',
                            '__comps__.0.renderer.sharedMaterials.0',
                        ];
                        let assigned = false;
                        for (const propPath of matPaths) {
                            try {
                                yield Editor.Message.request('scene', 'set-property', {
                                    uuid: psNode.nodeUuid,
                                    path: propPath,
                                    dump: {
                                        type: 'cc.Material',
                                        value: { uuid: psNode.materialUuid },
                                    },
                                });
                                assigned = true;
                                break;
                            }
                            catch ( /* try next path */_d) { /* try next path */ }
                        }
                        if (!assigned) {
                            warnings.push(`Material assignment failed for node ${psNode.nodeUuid}`);
                        }
                    }
                    catch (err) {
                        warnings.push(`Material assignment failed: ${err.message}`);
                    }
                }
                // Renderer properties via set-property (scene script may not persist these)
                const rn = psNode.rendererModule;
                if (rn) {
                    yield this.setPropertySafe(psNode.nodeUuid, '__comps__.0.renderer.renderMode', (_a = rn.renderMode) !== null && _a !== void 0 ? _a : 0, warnings);
                    if (rn.renderMode === 1) {
                        yield this.setPropertySafe(psNode.nodeUuid, '__comps__.0.renderer.velocityScale', (_b = rn.velocityScale) !== null && _b !== void 0 ? _b : 0, warnings);
                        yield this.setPropertySafe(psNode.nodeUuid, '__comps__.0.renderer.lengthScale', (_c = rn.lengthScale) !== null && _c !== void 0 ? _c : 2, warnings);
                    }
                    // Mesh assignment for mesh render mode
                    if (rn.renderMode === 4 && rn.meshUuid) {
                        try {
                            yield Editor.Message.request('scene', 'set-property', {
                                uuid: psNode.nodeUuid,
                                path: '__comps__.0.renderer.mesh',
                                dump: { type: 'cc.Mesh', value: { uuid: rn.meshUuid } },
                            });
                        }
                        catch (_e) {
                            warnings.push(`Mesh assignment failed for node ${psNode.nodeUuid}`);
                        }
                    }
                }
            }
            this.logSummary(prefabName, nodesCreated, texturesImported, materialsCreated, meshesImported, warnings);
            return { success: true, prefabName, nodesCreated, texturesImported, materialsCreated, meshesImported, warnings };
        });
    }
    /**
     * Walk node tree, for each PS create a .mtl file per unique (blendMode + textureGuid).
     * Same texture GUID = share material. Different texture = different material.
     */
    createMaterialFiles(nodeJson, ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            const psJson = (0, json_helpers_1.getObj)(nodeJson, 'particleSystem');
            const nodeName = (0, json_helpers_1.getString)(nodeJson, 'name', '?');
            if (psJson) {
                const blendMode = (0, json_helpers_1.getString)(psJson, 'blendMode', 'AB');
                let mainTexGuid = (0, json_helpers_1.getString)(psJson, 'mainTexture', '');
                const matKey = blendMode === 'ADD' ? 'ADD' : 'AB';
                const matProps = (0, json_helpers_1.getObj)(psJson, 'materialProps') || {};
                // TSA sprites mode: texture comes from sprite atlas, overrides mainTexture
                const tsa = (0, json_helpers_1.getObj)(psJson, 'textureSheetAnimationModule');
                if (tsa && (0, json_helpers_1.isModuleEnabled)(tsa) && (0, json_helpers_1.getString)(tsa, 'mode', 'grid') === 'sprites') {
                    const sprites = (0, json_helpers_1.getArr)(tsa, 'sprites');
                    if (sprites.length > 0) {
                        const texGuid = this.findTextureGuidForSprite(sprites[0], ctx.texturesDict);
                        if (texGuid)
                            mainTexGuid = texGuid;
                    }
                }
                if (mainTexGuid) {
                    const dedupeKey = `${matKey}|${mainTexGuid}`;
                    if (!ctx.materialUuidMap.has(dedupeKey)) {
                        const texDbUrl = ctx.textures.get(mainTexGuid) || '';
                        const texSubUuid = texDbUrl ? this.resolveTextureSubUuid(texDbUrl) : '';
                        const texName = texDbUrl ? path.basename(texDbUrl, path.extname(texDbUrl)) : mainTexGuid.substring(0, 8);
                        const safeName = `mat_${matKey}_${texName}`;
                        const matDbUrl = `${ctx.prefabDir}/materials/${safeName}.mtl`;
                        const mtlContent = this.buildMtlJson(safeName, matKey, texSubUuid, matProps, ctx.textures);
                        yield this.writeAssetText(matDbUrl, mtlContent);
                        const matUuid = this.resolveAssetUuid(matDbUrl);
                        if (matUuid) {
                            ctx.materialUuidMap.set(dedupeKey, matUuid);
                        }
                        else {
                            ctx.warnings.push(`Failed to resolve UUID for material "${matDbUrl}"`);
                        }
                    }
                }
                else {
                    const fallbackKey = `${matKey}|__default__`;
                    if (!ctx.materialUuidMap.has(fallbackKey)) {
                        const safeName = `mat_${matKey}_default`;
                        const matDbUrl = `${ctx.prefabDir}/materials/${safeName}.mtl`;
                        const mtlContent = this.buildMtlJson(safeName, matKey, '', matProps, ctx.textures);
                        yield this.writeAssetText(matDbUrl, mtlContent);
                        const matUuid = this.resolveAssetUuid(matDbUrl);
                        if (matUuid)
                            ctx.materialUuidMap.set(fallbackKey, matUuid);
                    }
                }
                // Store resolved texture GUID back so buildNodeDescriptors can use it for dedup lookup
                if (mainTexGuid) {
                    psJson['_resolvedTexGuid'] = mainTexGuid;
                }
            }
            const children = (0, json_helpers_1.getArr)(nodeJson, 'children');
            for (const child of children) {
                yield this.createMaterialFiles(child, ctx);
            }
        });
    }
    buildMtlJson(name, blendMode, textureSubUuid, matProps, textures) {
        const techIdx = blendMode === 'ADD' ? 0 : 1;
        const props = {};
        // Main texture
        if (textureSubUuid) {
            props['mainTexture'] = { '__uuid__': textureSubUuid };
        }
        // Tint color — always white; Unity _TintColor is decorative (shader *2 compensates 0.5 default)
        props['tintColor'] = { '__type__': 'cc.Color', 'r': 255, 'g': 255, 'b': 255, 'a': 255 };
        // Tiling/offset
        const to = matProps === null || matProps === void 0 ? void 0 : matProps.tilingOffset;
        if (Array.isArray(to) && to.length >= 4) {
            props['mainTiling_Offset'] = { '__type__': 'cc.Vec4', 'x': to[0], 'y': to[1], 'z': to[2], 'w': to[3] };
        }
        // Emission extra multiplier (shader already has hardcoded *2.0 like built-in)
        if ((matProps === null || matProps === void 0 ? void 0 : matProps.emission) != null) {
            props['emissionScale'] = { '__type__': 'cc.Vec4', 'x': matProps.emission, 'y': 0, 'z': 0, 'w': 0 };
        }
        // UV scroll speed
        const spd = matProps === null || matProps === void 0 ? void 0 : matProps.speedMainTexUV_NoiseZW;
        if (Array.isArray(spd) && spd.length >= 4) {
            props['speedMainTexUVNoiseZW'] = { '__type__': 'cc.Vec4', 'x': spd[0], 'y': spd[1], 'z': spd[2], 'w': spd[3] };
        }
        // Distortion
        const dist = matProps === null || matProps === void 0 ? void 0 : matProps.distortionSpeedXY_PowerZ;
        if (Array.isArray(dist) && dist.length >= 4) {
            props['distortSpeedXYPowerZW'] = { '__type__': 'cc.Vec4', 'x': dist[0], 'y': dist[1], 'z': dist[2], 'w': dist[3] };
        }
        // Noise texture
        if ((matProps === null || matProps === void 0 ? void 0 : matProps.noiseTexture) && textures) {
            const noiseSubUuid = this.resolveTexSubUuidByGuid(matProps.noiseTexture, textures);
            if (noiseSubUuid)
                props['noiseTexture'] = { '__uuid__': noiseSubUuid };
        }
        // Mask texture
        if ((matProps === null || matProps === void 0 ? void 0 : matProps.maskTexture) && textures) {
            const maskSubUuid = this.resolveTexSubUuidByGuid(matProps.maskTexture, textures);
            if (maskSubUuid)
                props['maskTexture'] = { '__uuid__': maskSubUuid };
        }
        // Flow texture
        if ((matProps === null || matProps === void 0 ? void 0 : matProps.flowTexture) && textures) {
            const flowSubUuid = this.resolveTexSubUuidByGuid(matProps.flowTexture, textures);
            if (flowSubUuid)
                props['flowTexture'] = { '__uuid__': flowSubUuid };
        }
        const mtl = {
            '__type__': 'cc.Material',
            '_name': name,
            '_effectAsset': { '__uuid__': this._effectUuid },
            '_techIdx': techIdx,
            '_defines': [{}],
            '_states': [{}],
            '_props': [props],
        };
        return JSON.stringify(mtl, null, 2);
    }
    resolveTexSubUuidByGuid(guid, textures) {
        const texDbUrl = textures.get(guid);
        if (!texDbUrl)
            return '';
        return this.resolveTextureSubUuid(texDbUrl);
    }
    findTextureGuidForSprite(spriteName, texturesDict) {
        if (!spriteName)
            return '';
        for (const [guid, texInfo] of Object.entries(texturesDict)) {
            const info = texInfo;
            // Match single-sprite textures by texture name
            if (info.name === spriteName)
                return guid;
            // Match atlas sub-sprites by sprite name
            const sprites = info.sprites || [];
            if (sprites.some((s) => s.name === spriteName))
                return guid;
        }
        return '';
    }
    buildNodeDescriptors(nodeJson, parentCtx, materialUuidMap) {
        const name = (0, json_helpers_1.getString)(nodeJson, 'name', 'VFXNode');
        const transform = (0, json_helpers_1.getObj)(nodeJson, 'transform') || {};
        const psJson = (0, json_helpers_1.getObj)(nodeJson, 'particleSystem');
        const ctx = {
            nodeName: name,
            textures: parentCtx.textures,
            meshes: parentCtx.meshes,
            meshDataMap: parentCtx.meshDataMap,
            meshUuidMap: parentCtx.meshUuidMap,
            materials: parentCtx.materials,
            importFolder: parentCtx.importFolder,
            warnings: parentCtx.warnings,
            texturesDict: parentCtx.texturesDict,
        };
        let modules = {};
        let blendMode = 'AB';
        let materialUuid = '';
        if (psJson) {
            modules = (0, index_1.mapAllModules)(psJson, ctx);
            blendMode = (0, json_helpers_1.getString)(psJson, 'blendMode', 'AB');
            const mainTexGuid = psJson['_resolvedTexGuid'] || (0, json_helpers_1.getString)(psJson, 'mainTexture', '');
            const matKey = blendMode === 'ADD' ? 'ADD' : 'AB';
            const dedupeKey = mainTexGuid ? `${matKey}|${mainTexGuid}` : `${matKey}|__default__`;
            materialUuid = materialUuidMap.get(dedupeKey) || '';
        }
        const children = (0, json_helpers_1.getArr)(nodeJson, 'children').map((child) => this.buildNodeDescriptors(child, parentCtx, materialUuidMap));
        return {
            name,
            transform: {
                localPosition: transform['localPosition'] || [0, 0, 0],
                localRotation: transform['localRotation'] || [0, 0, 0, 1],
                localScale: transform['localScale'] || [1, 1, 1],
            },
            hasParticleSystem: !!psJson,
            modules,
            blendMode,
            materialUuid,
            children,
        };
    }
    recordPath(entry, textures, meshes, materials, assetPath) {
        switch (entry.type) {
            case 'texture':
                textures.set(entry.guid, assetPath);
                break;
            case 'mesh':
                meshes.set(entry.guid, assetPath);
                break;
            case 'material':
                materials.set(entry.guid, assetPath);
                break;
        }
    }
    guessTextureExt(name) {
        const lower = name.toLowerCase();
        if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
            return '';
        return '.png';
    }
    writeAssetBinary(dbUrl, buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const projectPath = ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
            const relativePath = dbUrl.replace('db://', '');
            const absPath = path.join(projectPath, relativePath);
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, buffer);
            yield Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
        });
    }
    writeAssetText(dbUrl, content) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const projectPath = ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
            const relativePath = dbUrl.replace('db://', '');
            const absPath = path.join(projectPath, relativePath);
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, content, 'utf-8');
            yield Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
        });
    }
    resolveAssetUuid(dbUrl) {
        var _a;
        try {
            const projectPath = ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
            const relativePath = dbUrl.replace('db://', '');
            const absPath = path.join(projectPath, relativePath);
            const metaPath = absPath + '.meta';
            if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                return meta.uuid || '';
            }
        }
        catch (err) { /* ignore */ }
        return '';
    }
    resolveTextureSubUuid(dbUrl) {
        var _a;
        try {
            const projectPath = ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
            const relativePath = dbUrl.replace('db://', '');
            const absPath = path.join(projectPath, relativePath);
            const metaPath = absPath + '.meta';
            if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                // Texture sub-asset UUID: uuid@6c48a
                if (meta.subMetas) {
                    for (const [subId, subMeta] of Object.entries(meta.subMetas)) {
                        const sm = subMeta;
                        if (sm.importer === 'texture' && sm.uuid) {
                            return sm.uuid; // e.g. "88473391-...@6c48a"
                        }
                    }
                }
                return meta.uuid || '';
            }
        }
        catch (err) { /* ignore */ }
        return '';
    }
    resolveMeshSubUuid(dbUrl) {
        var _a;
        try {
            const projectPath = ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
            const relativePath = dbUrl.replace('db://', '');
            const absPath = path.join(projectPath, relativePath);
            const metaPath = absPath + '.meta';
            if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                if (meta.subMetas) {
                    for (const [, subMeta] of Object.entries(meta.subMetas)) {
                        const sm = subMeta;
                        if (sm.importer === 'gltf-mesh' && sm.uuid) {
                            return sm.uuid;
                        }
                        // Recurse into nested subMetas (mesh may be nested under a node)
                        if (sm.subMetas) {
                            for (const [, nested] of Object.entries(sm.subMetas)) {
                                const nsm = nested;
                                if (nsm.importer === 'gltf-mesh' && nsm.uuid) {
                                    return nsm.uuid;
                                }
                            }
                        }
                    }
                }
            }
        }
        catch (err) { /* ignore */ }
        return '';
    }
    flattenMeshJson(meshJson) {
        const verts = meshJson.vertices || [];
        const tris = meshJson.triangles || [];
        const norms = meshJson.normals || [];
        const uvArr = meshJson.uvs || [];
        const positions = [];
        for (const v of verts) {
            positions.push(v[0], v[1], -v[2]);
        }
        // Reverse winding order to compensate for Z negation
        const indices = [];
        for (let i = 0; i < tris.length; i += 3) {
            indices.push(tris[i], tris[i + 2], tris[i + 1]);
        }
        const normals = [];
        for (const n of norms) {
            normals.push(n[0], n[1], -n[2]);
        }
        const uvs = [];
        for (const uv of uvArr) {
            uvs.push(uv[0], uv[1]);
        }
        return { positions, indices, normals, uvs };
    }
    setPropertySafe(nodeUuid, propPath, value, warnings) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield Editor.Message.request('scene', 'set-property', {
                    uuid: nodeUuid,
                    path: propPath,
                    dump: { type: typeof value === 'number' ? 'cc.Float' : 'cc.CurveRange', value },
                });
            }
            catch (_a) {
                warnings.push(`set-property "${propPath}" failed on node ${nodeUuid}`);
            }
        });
    }
    logSummary(prefabName, nodesCreated, texturesImported, materialsCreated, meshesImported, warnings) {
        const lines = [];
        lines.push(`[IKame VFX] Import "${prefabName}" completed:`);
        lines.push(`  ${nodesCreated} nodes, ${texturesImported} textures, ${materialsCreated} materials, ${meshesImported} meshes`);
        if (warnings.length > 0) {
            lines.push(`  Warnings:`);
            warnings.forEach(w => lines.push(`    - ${w}`));
        }
        const msg = lines.join('\n');
        if (warnings.length > 0) {
            console.warn(msg);
        }
        else {
            console.log(msg);
        }
    }
}
exports.VFXImporter = VFXImporter;
//# sourceMappingURL=importer.js.map