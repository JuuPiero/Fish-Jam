import {
    _decorator,
    Asset,
    assetManager,
    AudioClip,
    BufferAsset,
    CCBoolean,
    CCFloat,
    CCInteger,
    CCString,
    Color,
    Enum,
    game,
    ImageAsset,
    js,
    JsonAsset,
    Node,
    TextAsset,
    Texture2D,
    Vec2,
    Vec3,
    Vec4,
} from 'cc';
import { EDITOR } from 'cc/env';

const { property } = _decorator;

export type PlayGroundValueKind = 'string' | 'number' | 'boolean' | 'color' | 'vec2' | 'vec3' | 'vec4' | 'enum';

/** Fields whose value is a file: replaceable on the dashboard by dropping / picking a new one. */
export type PlayGroundAssetKind = 'texture2D' | 'audioClip' | 'textAsset' | 'jsonAsset' | 'bufferAsset';

export type PlayGroundFieldKind = PlayGroundValueKind | PlayGroundAssetKind;

export interface PlayGroundEnumOption {
    label: string;
    /** A number for numeric TS enums, a string for string enums. */
    value: number | string;
}

export interface PlayGroundFieldOptions {
    /**
     * Same "type" you'd pass to @property: String/CCString, Number/CCFloat/CCInteger,
     * Boolean/CCBoolean, Color, Vec2, Vec3, Vec4, a TS enum (numeric or string; `Enum(X)` works too),
     * Texture2D, AudioClip, TextAsset, JsonAsset, BufferAsset — or `[X]` for a list of any of them.
     */
    type: any;
    /** Shown as the field's tooltip in the Inspector and as its label on the web frontend. */
    label?: string;
    /** Groups related fields together in the Inspector and on the dashboard. */
    group?: string;
    /**
     * Extra @property options passed through as-is. `range`, `min`, `max`, `step`, `slide` and
     * `multiline` are also read by the dashboard to shape its editor.
     */
    property?: Record<string, any>;
}

export interface PlayGroundFieldMeta {
    propertyKey: string;
    kind: PlayGroundFieldKind;
    label: string;
    group?: string;
    enumOptions?: PlayGroundEnumOption[];
    /** True when declared as `type: [X]` (Cocos's own array-property syntax) — a list of `kind`. */
    isList?: boolean;
}

declare global {
    // eslint-disable-next-line no-var
    var __PLAYGROUND_REGISTRY__: Map<Function, PlayGroundFieldMeta[]> | undefined;
}

function getRegistry(): Map<Function, PlayGroundFieldMeta[]> {
    const root = globalThis as any;
    if (!root.__PLAYGROUND_REGISTRY__) {
        root.__PLAYGROUND_REGISTRY__ = new Map<Function, PlayGroundFieldMeta[]>();
    }
    return root.__PLAYGROUND_REGISTRY__;
}

const ASSET_KIND_BY_TYPE = new Map<unknown, PlayGroundAssetKind>([
    [Texture2D, 'texture2D'],
    [AudioClip, 'audioClip'],
    [TextAsset, 'textAsset'],
    [JsonAsset, 'jsonAsset'],
    [BufferAsset, 'bufferAsset'],
]);
const ASSET_KINDS = new Set<string>(ASSET_KIND_BY_TYPE.values());

interface ResolvedType {
    kind: PlayGroundFieldKind;
    /** What goes to Cocos's own @property as `type`. */
    cocosType: any;
    enumOptions?: PlayGroundEnumOption[];
    isList?: boolean;
}

function resolveType(type: any): ResolvedType {
    // Cocos's own array-property syntax: `type: [X]` — a single-element array naming the item type.
    if (Array.isArray(type)) {
        const item = resolveType(type[0]);
        return { ...item, cocosType: [item.cocosType], isList: true };
    }

    if (type === String || type === CCString) return { kind: 'string', cocosType: type };
    if (type === Number || type === CCFloat || type === CCInteger) return { kind: 'number', cocosType: type };
    if (type === Boolean || type === CCBoolean) return { kind: 'boolean', cocosType: type };
    if (type === Color) return { kind: 'color', cocosType: type };
    if (type === Vec2) return { kind: 'vec2', cocosType: type };
    if (type === Vec3) return { kind: 'vec3', cocosType: type };
    if (type === Vec4) return { kind: 'vec4', cocosType: type };
    const assetKind = ASSET_KIND_BY_TYPE.get(type);
    if (assetKind) return { kind: assetKind, cocosType: type };

    if (type && typeof type === 'object') {
        // A numeric TS enum compiles to a bidirectional map ({A: 0, 0: 'A', ...}); its forward
        // (name -> number) half is exactly the keys whose value is a number.
        const numeric: PlayGroundEnumOption[] = Object.keys(type)
            .filter((key) => typeof type[key] === 'number')
            .map((key) => ({ label: key, value: type[key] as number }));
        if (numeric.length > 0) {
            // Enum() is what makes Cocos's Inspector show a dropdown; it's idempotent on Enum(X).
            return { kind: 'enum', cocosType: Enum(type), enumOptions: numeric };
        }
        // A string enum ({A: 'a', ...}) has no reverse half. Cocos's Enum() is numeric-only, so
        // the Inspector shows it as a plain string; the dashboard still offers the options.
        const strings: PlayGroundEnumOption[] = Object.keys(type)
            .filter((key) => typeof type[key] === 'string')
            .map((key) => ({ label: key, value: type[key] as string }));
        if (strings.length > 0) {
            return { kind: 'enum', cocosType: CCString, enumOptions: strings };
        }
    }

    throw new Error(`[playGroundField] Unsupported field type: ${String(type)}`);
}

/**
 * Marks a Cocos component property as a "playground field": a piece of creative content
 * (text/number/color/vector/enum, or a file: texture, audio, text, JSON, binary) that the Cocos
 * Playground extension extracts into a playable's field manifest for editing outside of Cocos
 * Creator. Wraps the normal `@property` decorator, so the field still serializes and shows in the
 * Inspector as usual.
 */
export function playGroundField(options: PlayGroundFieldOptions) {
    return function (target: any, propertyKey: string) {
        const { kind, cocosType, enumOptions, isList } = resolveType(options.type);

        // Optional keys are only spread in when set: Cocos validates `tooltip`/`group` by type, so
        // passing them as `undefined` fails ("The tooltip of X must be type string").
        property({
            type: cocosType,
            ...(options.label ? { tooltip: options.label } : {}),
            ...(options.group ? { group: { name: options.group } } : {}),
            ...options.property,
        })(target, propertyKey);

        const ctor = target.constructor;
        const registry = getRegistry();
        const fields = registry.get(ctor) ?? [];
        fields.push({
            propertyKey,
            kind,
            label: options.label ?? propertyKey,
            group: options.group,
            enumOptions,
            isList,
        });
        registry.set(ctor, fields);

        ensureOverridesAppliedOnLoad(ctor);
    };
}

export function getPlayGroundFields(ctor: Function): PlayGroundFieldMeta[] {
    return getRegistry().get(ctor) ?? [];
}

export function getAllPlayGroundClasses(): Function[] {
    return Array.from(getRegistry().keys());
}

/*
 * ---- Overrides ----------------------------------------------------------------------------------
 *
 * Overrides travel as a base64-encoded JSON object under a short, non-descriptive name — *not* real
 * security (anyone can decode it with devtools), just enough that raw field names/values aren't
 * sitting in plain text for a casual view-source. Two sources: `window.__pgvo__`, set by a <script>
 * the dashboard's exporters inject for real builds; or a `pgvo` query-string param, set by the
 * dashboard's live preview iframe (an unmodified web-mobile build served directly).
 *
 * Keys, most specific first:
 * - `<Class>.<property>@<a/b/c>`: components whose node path (node names from the scene root) ends
 *   with `a/b/c` — the longest matching path wins;
 * - `<Class>.<property>`: every instance of that component class;
 * - `<property>`: every decorated field with that name, on any class (the original format).
 *
 * A file value is `{ file, kind, name? }`: `pgfiles/<file>` is shipped inside the build by the
 * exporters (and served by the preview), loaded here before the first scene starts. `{ uuid }` names
 * one of the build's own assets (kept items of an edited list); `null` empties the field.
 */

interface FileRef {
    file: string;
    kind: PlayGroundAssetKind;
    name?: string;
}

function isFileRef(value: unknown): value is FileRef {
    return !!value && typeof value === 'object' && typeof (value as FileRef).file === 'string' && typeof (value as FileRef).kind === 'string';
}

function decodeOverridesPayload(encoded: string): Record<string, unknown> | undefined {
    try {
        // atob() only handles Latin1; decodeURIComponent(escape(...)) round-trips arbitrary UTF-8
        // (e.g. non-ASCII labels/text values) through it correctly.
        const json = decodeURIComponent(escape(atob(encoded)));
        const parsed = JSON.parse(json);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch (error) {
        console.warn('[cocos-playground] failed to decode playground overrides payload:', error);
        return undefined;
    }
}

function readPlaygroundOverrides(): Record<string, unknown> | undefined {
    if (EDITOR) return undefined;
    const root = globalThis as any;
    let encoded: string | undefined = root.__pgvo__;
    if (!encoded && typeof window !== 'undefined' && window.location) {
        encoded = new URLSearchParams(window.location.search).get('pgvo') ?? undefined;
    }
    return encoded ? decodeOverridesPayload(encoded) : undefined;
}

interface OverrideIndex {
    /** classKey → instance overrides, longest node path first. */
    byPath: Map<string, { path: string; value: unknown }[]>;
    byClass: Map<string, unknown>;
    byProperty: Map<string, unknown>;
}

let overrideIndex: OverrideIndex | null | undefined;

function getOverrideIndex(): OverrideIndex | null {
    if (overrideIndex !== undefined) return overrideIndex;
    const overrides = readPlaygroundOverrides();
    if (!overrides) return (overrideIndex = null);

    const index: OverrideIndex = { byPath: new Map(), byClass: new Map(), byProperty: new Map() };
    for (const [key, value] of Object.entries(overrides)) {
        const at = key.indexOf('@');
        if (at >= 0) {
            const classKey = key.slice(0, at);
            const list = index.byPath.get(classKey) ?? [];
            list.push({ path: key.slice(at + 1), value });
            index.byPath.set(classKey, list);
        } else if (key.includes('.')) {
            index.byClass.set(key, value);
        } else {
            index.byProperty.set(key, value);
        }
    }
    for (const list of index.byPath.values()) list.sort((a, b) => b.path.length - a.path.length);
    return (overrideIndex = index);
}

/** Node names from the scene root down to `node` (the scene itself excluded), `/`-joined. */
function nodePathOf(node: Node | null | undefined): string {
    const names: string[] = [];
    let current = node;
    while (current && current.parent) {
        names.push(current.name);
        current = current.parent;
    }
    return names.reverse().join('/');
}

const pathEndsWith = (nodePath: string, suffix: string) => nodePath === suffix || nodePath.endsWith(`/${suffix}`);

function findOverride(index: OverrideIndex, classKey: string, propertyKey: string, nodePath: string): { value: unknown } | undefined {
    for (const entry of index.byPath.get(classKey) ?? []) {
        if (pathEndsWith(nodePath, entry.path)) return { value: entry.value };
    }
    if (index.byClass.has(classKey)) return { value: index.byClass.get(classKey) };
    if (index.byProperty.has(propertyKey)) return { value: index.byProperty.get(propertyKey) };
    return undefined;
}

/* ---- File assets ---- */

/** file → the loaded asset (null when it failed to load). */
const fileAssets = new Map<string, Asset | null>();
const fileLoads = new Map<string, Promise<void>>();

function collectFileRefs(value: unknown, into: Map<string, FileRef>): void {
    if (Array.isArray(value)) {
        for (const item of value) collectFileRefs(item, into);
    } else if (isFileRef(value) && !into.has(value.file)) {
        into.set(value.file, value);
    }
}

function toKindAsset(ref: FileRef, loaded: Asset): Asset {
    let asset = loaded;
    if (ref.kind === 'texture2D') {
        // loadRemote gives an ImageAsset for images; the field wants a texture.
        const texture = new Texture2D();
        texture.image = loaded as ImageAsset;
        asset = texture;
    }
    if (ref.name) asset.name = ref.name.replace(/\.[^.]+$/, '');
    return asset;
}

function loadFile(ref: FileRef): Promise<void> {
    let pending = fileLoads.get(ref.file);
    if (!pending) {
        const ext = ref.file.slice(ref.file.lastIndexOf('.'));
        pending = new Promise<void>((resolve) => {
            assetManager.loadRemote<Asset>(`pgfiles/${ref.file}`, { ext }, (error, asset) => {
                if (error || !asset) {
                    console.error(`[cocos-playground] failed to load ${ref.kind} "${ref.name ?? ref.file}" (pgfiles/${ref.file}):`, error);
                    fileAssets.set(ref.file, null);
                } else {
                    fileAssets.set(ref.file, toKindAsset(ref, asset));
                }
                resolve();
            });
        });
        fileLoads.set(ref.file, pending);
    }
    return pending;
}

/** Loads every file the overrides use; the engine waits for it before the first scene starts. */
function preloadFiles(): Promise<void> {
    const index = getOverrideIndex();
    if (!index) return Promise.resolve();
    const refs = new Map<string, FileRef>();
    for (const list of index.byPath.values()) for (const entry of list) collectFileRefs(entry.value, refs);
    for (const value of index.byClass.values()) collectFileRefs(value, refs);
    for (const value of index.byProperty.values()) collectFileRefs(value, refs);
    return Promise.all(Array.from(refs.values(), loadFile)).then(() => undefined);
}

// Project scripts (this one included) load during game.init(), which then awaits this delegate
// before launching the first scene — so files are ready by every component's onLoad.
if (!EDITOR) {
    game.onPostProjectInitDelegate.add(preloadFiles);
}

/* ---- Applying ---- */

/** A file that's still loading: the property is assigned once it's there. */
const PENDING = Symbol('pending');

/**
 * One of the build's own assets, named by uuid (`{ uuid }`, e.g. kept items of an edited list): the
 * property's current value already holds it (scene dependencies load before onLoad), else the
 * engine's asset cache does.
 */
function findBuildAsset(current: unknown, uuid: string): Asset | null {
    for (const candidate of Array.isArray(current) ? current : [current]) {
        if (candidate instanceof Asset && candidate.uuid === uuid) return candidate;
    }
    return (assetManager.assets.get(uuid) as Asset | undefined) ?? null;
}

/**
 * A raw override value → what the property should hold; undefined = leave the property alone, null
 * for a file that failed to load.
 */
function reconstructScalar(field: PlayGroundFieldMeta, raw: any, onLate: () => void, current: unknown): any {
    if (ASSET_KINDS.has(field.kind)) {
        if (raw === null) return null;
        if (raw && typeof raw === 'object' && typeof raw.uuid === 'string' && !isFileRef(raw)) return findBuildAsset(current, raw.uuid);
        if (!isFileRef(raw)) return undefined;
        if (fileAssets.has(raw.file)) return fileAssets.get(raw.file);
        // Only when this script loaded after the engine's init (a later bundle): assign on arrival.
        loadFile(raw).then(onLate);
        return PENDING;
    }
    switch (field.kind) {
        case 'color':
            return raw ? new Color(raw.r ?? 0, raw.g ?? 0, raw.b ?? 0, raw.a ?? 255) : undefined;
        case 'vec2':
            return raw ? new Vec2(raw.x ?? 0, raw.y ?? 0) : undefined;
        case 'vec3':
            return raw ? new Vec3(raw.x ?? 0, raw.y ?? 0, raw.z ?? 0) : undefined;
        case 'vec4':
            return raw ? new Vec4(raw.x ?? 0, raw.y ?? 0, raw.z ?? 0, raw.w ?? 0) : undefined;
        default:
            return raw;
    }
}

function reconstructValue(field: PlayGroundFieldMeta, raw: unknown, onLate: () => void, current: unknown): any {
    if (field.isList) {
        if (!Array.isArray(raw)) return undefined;
        const items = raw.map((item) => reconstructScalar(field, item, onLate, current));
        // A list waits until every file in it is there (onLate re-runs this).
        return items.includes(PENDING) ? undefined : items;
    }
    const value = reconstructScalar(field, raw, onLate, current);
    // A single file that failed to load leaves the build's own asset in place.
    return value === PENDING || (value === null && raw !== null) ? undefined : value;
}

/** Applies any override values for `instance`'s registered fields. */
function applyOverridesTo(instance: any, ctor: Function): void {
    const index = getOverrideIndex();
    if (!index) return;

    const className = js.getClassName(ctor) || ctor.name;
    const nodePath = nodePathOf(instance.node);
    for (const field of getPlayGroundFields(ctor)) {
        const found = findOverride(index, `${className}.${field.propertyKey}`, field.propertyKey, nodePath);
        if (!found) continue;
        // The build's own value, for `{ uuid }` items that keep one of its assets.
        const buildValue = instance[field.propertyKey];
        const assign = () => {
            const value = reconstructValue(
                field,
                found.value,
                () => {
                    if (instance.isValid === false) return;
                    console.warn(`[cocos-playground] ${className}.${field.propertyKey} got its file after onLoad (script loaded after the engine started).`);
                    assign();
                },
                buildValue,
            );
            if (value !== undefined) instance[field.propertyKey] = value;
        };
        assign();
    }
}

/**
 * Wraps this class's `onLoad` (adding one if it doesn't define one) so overrides land on every
 * instance right before its own `onLoad` runs. This has to happen this early — not, say, on
 * `Director.EVENT_AFTER_SCENE_LAUNCH` — because that event fires *after* every component's
 * `onLoad` in the scene has already run; a component that copies `this.someField` onto a
 * Label/Sprite once in its own `onLoad` (the common case for configurable text/color) would
 * already have used the stale value by then. Idempotent per class.
 */
function ensureOverridesAppliedOnLoad(ctor: Function): void {
    const proto = (ctor as any).prototype;
    if (Object.prototype.hasOwnProperty.call(proto, '__playgroundOnLoadPatched')) return;
    proto.__playgroundOnLoadPatched = true;

    const originalOnLoad: (() => void) | undefined = proto.onLoad;
    proto.onLoad = function (this: any) {
        applyOverridesTo(this, ctor);
        originalOnLoad?.call(this);
    };
}
