'use strict';

/** A single entry in the import review list */
export interface ImportEntry {
    guid: string;
    name: string;
    type: 'texture' | 'material' | 'mesh' | 'shader';
    status: 'new' | 'exists';
    existingPath?: string;
    selected: boolean;
    data?: Buffer;
    metadata?: Record<string, any>;
}

/** Data passed from Browser panel to Import Review panel */
export interface ImportReviewData {
    prefabName: string;
    vfxId: string;
    importFolder: string;
    particleJson: Record<string, any>;
    entries: ImportEntry[];
}

/** Data passed from Import Review to Importer after user confirms */
export interface ImportExecuteData {
    prefabName: string;
    vfxId: string;
    importFolder: string;
    particleJson: Record<string, any>;
    entries: ImportEntry[];
    serverUrl: string;
}

/** Context passed to each module mapper */
export interface MapperContext {
    nodeName: string;
    textures: Map<string, string>;   // Unity GUID -> db:// asset path
    meshes: Map<string, string>;     // Unity GUID -> db:// asset path
    meshDataMap: Map<string, any>;   // Unity GUID -> flat mesh geometry { positions, indices, normals, uvs }
    meshUuidMap: Map<string, string>; // Unity GUID -> Cocos mesh sub-asset UUID
    materials: Map<string, string>;  // Unity GUID -> db:// asset path
    importFolder: string;
    warnings: string[];
    texturesDict: Record<string, any>;  // raw textures dict from particle.json (sprite rects, atlas size)
}

/** Signature for a module mapper function */
export type ModuleMapper = (
    moduleJson: Record<string, any>,
    ctx: MapperContext
) => Record<string, any>;

/** Catalog item from server */
export interface CatalogItem {
    id: string;
    name: string;
    category: string;
    fileSize: number;
    particleCount: number;
    uploadedAt: string;
}

/** Catalog response from server */
export interface CatalogResponse {
    version: number;
    categories: string[];
    items: CatalogItem[];
}

/** Import result summary */
export interface ImportResult {
    success: boolean;
    prefabName: string;
    nodesCreated: number;
    texturesImported: number;
    materialsCreated: number;
    meshesImported: number;
    warnings: string[];
    error?: string;
}
