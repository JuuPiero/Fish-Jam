export type PlayGroundValueKind =
    | 'string'
    | 'number'
    | 'boolean'
    | 'color'
    | 'vec2'
    | 'vec3'
    | 'vec4'
    | 'enum';

/** Fields whose value is a file: replaceable on the dashboard by dropping / picking a new one. */
export type PlayGroundAssetKind = 'texture2D' | 'audioClip' | 'textAsset' | 'jsonAsset' | 'bufferAsset';

export type PlayGroundFieldKind = PlayGroundValueKind | PlayGroundAssetKind;

export const ASSET_KINDS: readonly PlayGroundAssetKind[] = ['texture2D', 'audioClip', 'textAsset', 'jsonAsset', 'bufferAsset'];

export interface PlayGroundEnumOption {
    label: string;
    /** A number for numeric TS enums, a string for string enums. */
    value: number | string;
}

/** Editing hints read from the field's `property: {...}` options (Cocos's own @property names). */
export interface PlayGroundConstraints {
    min?: number;
    max?: number;
    step?: number;
    /** Cocos's `slide: true` — show a slider (needs min and max). */
    slide?: boolean;
    /** Cocos's `multiline: true` — multi-line text. */
    multiline?: boolean;
    /** Declared as `CCInteger`. */
    integer?: boolean;
}

export interface DecoratedField {
    className: string;
    propertyKey: string;
    kind: PlayGroundFieldKind;
    label: string;
    group?: string;
    enumOptions?: PlayGroundEnumOption[];
    /** True when declared as `type: [X]` (Cocos's own array-property syntax) — a list of `kind`. */
    isList?: boolean;
    constraints?: PlayGroundConstraints;
}

export interface DecoratedClass {
    className: string;
    /** The script the class is declared in, relative to assets/ (for messages). */
    file: string;
    /**
     * `__type__` strings this class serializes as in .scene/.prefab files: its compressed script
     * uuid (when it's the script's component class) and its @ccclass name.
     */
    typeIds: string[];
    fields: DecoratedField[];
}

/** The build's own asset behind an asset field (`{"__uuid__": ...}` in the scene). */
export interface ManifestAssetRef {
    uuid: string;
    /** Asset name (file name without extension, or the sub-asset's name). */
    name?: string;
    /** Source file, relative to assets/. */
    path?: string;
    /** The file inside the web-mobile build (images/audio), for previews on the dashboard. */
    buildPath?: string;
}

export interface ManifestField {
    /** Override key for exactly this placement: `<componentType>.<propertyKey>@<nodePath>`. */
    key: string;
    /** Override key for every instance of the component: `<componentType>.<propertyKey>`. */
    classKey: string;
    /** The .scene / .prefab file it was read from, relative to assets/. */
    scene: string;
    source: 'scene' | 'prefab';
    /**
     * Node names from the scene root (scenes) or the prefab root (prefabs), `/`-joined. At runtime an
     * instance key matches every node whose own path ends with this.
     */
    nodePath: string;
    componentType: string;
    propertyKey: string;
    label: string;
    kind: PlayGroundFieldKind;
    group?: string;
    enumOptions?: PlayGroundEnumOption[];
    isList?: boolean;
    constraints?: PlayGroundConstraints;
    /** The value saved in the scene/prefab. Asset kinds: a `ManifestAssetRef` (or null). */
    value: any;
}

export interface PlayableManifest {
    version: 2;
    generatedAt: string;
    fields: ManifestField[];
}
