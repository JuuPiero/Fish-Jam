/**
 * Metadata recorded by the decorators in assets/AdvancedInspector.ts.
 * Keep in sync with that file (it can't be imported here: it depends on 'cc').
 */

export type InfoBoxType = 'none' | 'info' | 'warning' | 'error';
export type ButtonSize = 'small' | 'medium' | 'large' | number;
export type RGBA = [number, number, number, number];

export interface Condition {
    member: string;
    values?: unknown[];
}

export interface GroupRef {
    kind: 'box' | 'foldout' | 'tab' | 'horizontal' | 'buttons';
    path: string;
    tab?: string;
    label?: string;
    showLabel?: boolean;
    expanded?: boolean;
}

export interface DropdownItem {
    label: string;
    value: unknown;
}

export interface MemberMeta {
    name: string;
    kind: 'field' | 'method';
    seq: number;
    anchor?: string | null;
    order?: number;
    spaceBefore?: number;
    spaceAfter?: number;
    title?: { title: string; subtitle?: string; bold?: boolean; line?: boolean };
    group?: GroupRef;
    showIf?: Condition[];
    hideIf?: Condition[];
    enableIf?: Condition[];
    disableIf?: Condition[];
    readOnly?: boolean;
    hideInPlayMode?: boolean;
    hideInEditMode?: boolean;
    disableInPlayMode?: boolean;
    disableInEditMode?: boolean;
    infoBoxes?: { message: string; type: InfoBoxType; visibleIf?: Condition }[];
    required?: { message?: string };
    validate?: { method: string; message?: string };
    label?: string;
    hideLabel?: boolean;
    suffix?: string;
    color?: RGBA;
    progressBar?: { min: number | string; max: number | string; color?: RGBA };
    minMax?: { min: number; max: number; showFields: boolean };
    dropdown?: { items?: DropdownItem[]; member?: string };
    toggleButtons?: boolean;
    onChanged?: string[];
    button?: { label?: string; size?: ButtonSize; color?: 'default' | 'blue' | 'red' | 'green' };
    inlineButtons?: { method: string; label?: string }[];
    showInInspector?: boolean;
}

export interface ClassMeta {
    version: 1;
    members: MemberMeta[];
}

/** Sent to Component.__advInspectorEval in the scene process. */
export interface EvalRequest {
    members?: string[];
    validate?: { method: string; member: string }[];
    lists?: string[];
    /** @showInInspector members to describe. */
    inspect?: string[];
    /** Expanded paths in those members (see InspectNode.p). */
    open?: string[];
}

export interface EvalResult {
    playing: boolean;
    values: Record<string, unknown>;
    validations: (true | string)[];
    lists: Record<string, DropdownItem[]>;
    inspected?: Record<string, InspectResult>;
}

/**
 * A value of a @showInInspector member, described by the scene process.
 * `p` is its path: the member name, then "/i<n>" (list item), "/e<n>" (map
 * entry value) or "/k<encoded key>" (object key) per level.
 */
export type InspectNode =
    | { t: 'null' | 'undef'; p: string }
    | { t: 'num'; p: string; v: number }
    | { t: 'str'; p: string; v: string }
    | { t: 'bool'; p: string; v: boolean }
    | { t: 'text'; p: string; v: string }
    | { t: 'vec'; p: string; cls: string; v: Record<string, number> }
    | { t: 'color'; p: string; v: { r: number; g: number; b: number; a: number } }
    | { t: 'ref'; p: string; kind: 'node' | 'component' | 'asset'; cls: string; name: string; uuid: string; valid: boolean }
    | { t: 'list'; p: string; cls: string; size: number; items?: InspectNode[]; more?: number }
    | { t: 'map'; p: string; size: number; entries?: { k: InspectNode; v: InspectNode }[]; more?: number }
    | { t: 'obj'; p: string; cls: string; size: number; keys?: { k: string; v: InspectNode }[]; more?: number };

export type InspectResult = { node: InspectNode; writable: boolean } | { error: string };

/** Path of a child value (same format the scene process uses). */
export function childPath(p: string, kind: 'i' | 'e' | 'k', id: string | number): string {
    return `${p}/${kind}${kind === 'k' ? encodeURIComponent(String(id)) : id}`;
}
