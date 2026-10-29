import * as fs from 'fs';
import * as path from 'path';
import { AssetLookup, describeAssetRef } from './assets';
import { ASSET_KINDS, DecoratedClass, DecoratedField, ManifestField, PlayGroundAssetKind, PlayGroundFieldKind } from './types';

/**
 * Cocos Creator's source .scene/.prefab files are a flat JSON array of plain objects; cross
 * references (parent/child/component links) use `{"__id__": N}` indices into that same array.
 *
 * A custom component's `__type__` is its compressed script uuid (or, for a script's second and later
 * classes, its @ccclass name) — scanDecorators.ts works out both per class, so components are matched
 * to their class exactly. Built-in engine types always serialize with a readable `cc.` prefix and are
 * skipped outright (they reuse ordinary property names like `color` everywhere: particle systems,
 * gradients, …), and so are the project's other scripts. Only an object whose `__type__` belongs to
 * no script in the project (one without a .meta, or from outside assets/) falls back to the old
 * structural match — "carries a decorated property key" — with a warning.
 *
 * Assumes source scene data isn't compressed ("Use Compressed Scene Data" off); otherwise these
 * files aren't JSON and are skipped with a warning.
 */

function findSceneFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findSceneFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.scene') || entry.name.endsWith('.prefab'))) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * Node names from the scene root (the `cc.Scene` itself is left out — at runtime a node's path stops
 * below the scene too) or from the prefab's root node, `/`-joined.
 */
function resolveNodePath(objects: any[], nodeIndex: number | undefined): string {
    const segments: string[] = [];
    let current = nodeIndex;
    const seen = new Set<number>();

    while (current !== undefined && !seen.has(current)) {
        seen.add(current);
        const node = objects[current];
        if (!node || typeof node !== 'object' || node.__type__ === 'cc.Scene') break;

        segments.unshift(typeof node._name === 'string' && node._name.length > 0 ? node._name : `#${current}`);
        current = node._parent && typeof node._parent.__id__ === 'number' ? node._parent.__id__ : undefined;
    }

    return segments.length > 0 ? segments.join('/') : '(unknown node)';
}

const isAssetKind = (kind: PlayGroundFieldKind): kind is PlayGroundAssetKind => (ASSET_KINDS as readonly string[]).includes(kind);

function extractScalarValue(kind: PlayGroundFieldKind, raw: any, assets: AssetLookup): any {
    if (isAssetKind(kind)) return describeAssetRef(raw, assets);
    switch (kind) {
        case 'color':
            return raw && typeof raw === 'object'
                ? { r: raw.r ?? 0, g: raw.g ?? 0, b: raw.b ?? 0, a: raw.a ?? 255 }
                : null;
        case 'vec2':
            return raw && typeof raw === 'object' ? { x: raw.x ?? 0, y: raw.y ?? 0 } : null;
        case 'vec3':
            return raw && typeof raw === 'object' ? { x: raw.x ?? 0, y: raw.y ?? 0, z: raw.z ?? 0 } : null;
        case 'vec4':
            return raw && typeof raw === 'object'
                ? { x: raw.x ?? 0, y: raw.y ?? 0, z: raw.z ?? 0, w: raw.w ?? 0 }
                : null;
        default:
            return raw ?? null;
    }
}

function extractFieldValue(field: DecoratedField, raw: any, assets: AssetLookup): any {
    if (field.isList) {
        return Array.isArray(raw) ? raw.map((item) => extractScalarValue(field.kind, item, assets)) : [];
    }
    return extractScalarValue(field.kind, raw, assets);
}

export interface SceneScanInput {
    /** `__type__` → decorated class (buildTypeIndex). */
    types: Map<string, DecoratedClass>;
    /** Every project script's `__type__`: those not in `types` have no playground fields. */
    projectTypeIds: Set<string>;
    /** Fallback for unmatched `__type__`s (buildPropertyKeyIndex). */
    propertyKeys: Map<string, DecoratedField[]>;
    assets: AssetLookup;
    /** Only these .scene files (relative to assets/); every .prefab is always scanned. */
    includedScenes: Set<string> | null;
}

/**
 * Walks every .scene (restricted to `includedScenes` when given — see `getIncludedScenePaths()` in
 * export.ts, so an old test scene that isn't part of *this* build doesn't leak into the manifest) and
 * every .prefab (always scanned — prefabs are shared/reachable in ways that are hard to trace
 * reliably from source alone) under `assetsDir`, and lists every decorated field of every component
 * found, with its saved value.
 */
export function scanScenes(assetsDir: string, input: SceneScanInput): ManifestField[] {
    const manifest: ManifestField[] = [];
    if (input.types.size === 0) return manifest;

    const warnedCollisions = new Set<string>();
    const warnedTypes = new Set<string>();
    const propertyKeys = Array.from(input.propertyKeys.keys());

    for (const sceneFile of findSceneFiles(assetsDir)) {
        const relativePath = path.relative(assetsDir, sceneFile).split(path.sep).join('/');
        const source = sceneFile.endsWith('.scene') ? 'scene' : 'prefab';

        if (input.includedScenes && source === 'scene' && !input.includedScenes.has(relativePath)) {
            continue;
        }

        let objects: any;
        try {
            objects = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
        } catch (error) {
            console.warn(
                `[cocos-playground] Failed to parse ${sceneFile} as JSON, skipping (is "Use Compressed Scene Data" enabled for this project?): ${error}`
            );
            continue;
        }
        if (!Array.isArray(objects)) continue;

        objects.forEach((obj: any) => {
            if (!obj || typeof obj !== 'object' || typeof obj.__type__ !== 'string') return;
            if (obj.__type__.startsWith('cc.')) return;

            let fields: DecoratedField[];
            const decoratedClass = input.types.get(obj.__type__);
            if (decoratedClass) {
                fields = decoratedClass.fields;
            } else if (input.projectTypeIds.has(obj.__type__)) {
                // A project script without playground fields that happens to reuse a property name.
                return;
            } else {
                const matchedKeys = propertyKeys.filter((key) => Object.prototype.hasOwnProperty.call(obj, key));
                if (matchedKeys.length === 0) return;
                if (!warnedTypes.has(obj.__type__)) {
                    warnedTypes.add(obj.__type__);
                    console.warn(
                        `[cocos-playground] ${relativePath}: a component of unknown type "${obj.__type__}" carries @playGroundField properties (${matchedKeys.join(', ')}); matching it by property name. Does its script have a .meta file?`
                    );
                }
                fields = matchedKeys.map((key) => {
                    const candidates = input.propertyKeys.get(key)!;
                    if (candidates.length > 1 && !warnedCollisions.has(key)) {
                        warnedCollisions.add(key);
                        console.warn(
                            `[cocos-playground] Property "${key}" is @playGroundField on more than one class (${candidates
                                .map((c) => c.className)
                                .join(', ')}); using the first one for components of unknown type.`
                        );
                    }
                    return candidates[0];
                });
            }

            const nodeIndex = obj.node && typeof obj.node.__id__ === 'number' ? obj.node.__id__ : undefined;
            const nodePath = resolveNodePath(objects, nodeIndex);

            for (const field of fields) {
                const classKey = `${field.className}.${field.propertyKey}`;
                manifest.push({
                    key: `${classKey}@${nodePath}`,
                    classKey,
                    scene: relativePath,
                    source,
                    nodePath,
                    componentType: field.className,
                    propertyKey: field.propertyKey,
                    label: field.label,
                    kind: field.kind,
                    ...(field.group ? { group: field.group } : {}),
                    ...(field.enumOptions ? { enumOptions: field.enumOptions } : {}),
                    ...(field.isList ? { isList: true } : {}),
                    ...(field.constraints ? { constraints: field.constraints } : {}),
                    value: extractFieldValue(field, obj[field.propertyKey], input.assets),
                });
            }
        });
    }

    return manifest;
}
