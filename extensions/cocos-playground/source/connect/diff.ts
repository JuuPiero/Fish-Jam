import type { FieldChange } from '../shared';

/*
 * What replacing a concept's build would do to its fields, and to the playables that saved values
 * for them. Pure (no Node / Editor), so the preview harness can run it too.
 */

/** The parts of a manifest field this needs (old manifests may lack `key` / `classKey`). */
export interface DiffField {
    key?: string;
    classKey?: string;
    scene?: string;
    nodePath: string;
    componentType: string;
    propertyKey: string;
    label?: string;
    kind: string;
    isList?: boolean;
    enumOptions?: { label: string; value: number | string }[];
}

export interface PlayableValues {
    name: string;
    values: Record<string, unknown>;
}

export interface ManifestDiff {
    removed: FieldChange[];
    changed: FieldChange[];
    added: number;
    kept: number;
}

/**
 * What pre-version-2 manifests lack, filled in like the dashboard does (next-playground
 * lib/playground-fields.ts normalizeManifest): `classKey` / `key`, and scene node paths re-rooted below
 * the scene (they started with the scene's own name) — the keys playables saved their values under.
 */
export function normalizeFields(manifest: { version?: number; fields?: unknown } | null | undefined): DiffField[] {
    const fields = Array.isArray(manifest?.fields) ? (manifest!.fields as (DiffField & { source?: string })[]) : [];
    const legacy = !manifest?.version || manifest.version < 2;
    return fields
        .filter((field) => field && typeof field.propertyKey === 'string' && typeof field.kind === 'string')
        .map((field) => {
            const source = field.source ?? (String(field.scene).endsWith('.scene') ? 'scene' : 'prefab');
            let nodePath = String(field.nodePath ?? '');
            if (legacy && source === 'scene' && nodePath.includes('/')) nodePath = nodePath.slice(nodePath.indexOf('/') + 1);
            const classKey = field.classKey ?? `${field.componentType}.${field.propertyKey}`;
            return { ...field, nodePath, classKey, key: field.key ?? `${classKey}@${nodePath}` };
        });
}

const keyOf = (field: DiffField) => field.key ?? `${field.componentType}.${field.propertyKey}@${field.nodePath}`;
const classKeyOf = (field: DiffField) => field.classKey ?? `${field.componentType}.${field.propertyKey}`;
const whereOf = (field: DiffField) => [field.scene, field.nodePath].filter(Boolean).join(' › ');

function changeOf(before: DiffField, after: DiffField): string | null {
    const parts: string[] = [];
    if (before.kind !== after.kind) parts.push(`${before.kind} → ${after.kind}`);
    if (!!before.isList !== !!after.isList) parts.push(before.isList ? 'list → single value' : 'single value → list');
    if (before.kind === 'enum' && after.kind === 'enum') {
        const now = new Set((after.enumOptions ?? []).map((option) => option.value));
        const gone = (before.enumOptions ?? []).filter((option) => !now.has(option.value)).map((option) => option.label);
        if (gone.length) parts.push(`enum options removed: ${gone.join(', ')}`);
    }
    return parts.length ? parts.join('; ') : null;
}

/**
 * @param before the concept's current manifest fields (empty: no build yet)
 * @param after  the package's manifest fields
 */
export function diffManifests(before: DiffField[], after: DiffField[], playables: PlayableValues[]): ManifestDiff {
    const afterByKey = new Map(after.map((field) => [keyOf(field), field]));
    const afterClassKeys = new Set(after.map(classKeyOf));
    const afterProperties = new Set(after.map((field) => field.propertyKey));
    const beforeKeys = new Set(before.map(keyOf));

    /** Playables whose saved values reach this field; `lost`: only those the new build no longer has a target for. */
    const usersOf = (field: DiffField, lost: boolean) =>
        playables
            .filter(({ values }) => {
                if (keyOf(field) in values) return true;
                if (classKeyOf(field) in values && (!lost || !afterClassKeys.has(classKeyOf(field)))) return true;
                return field.propertyKey in values && (!lost || !afterProperties.has(field.propertyKey));
            })
            .map(({ name }) => name);

    const removed: FieldChange[] = [];
    const changed: FieldChange[] = [];
    let kept = 0;
    for (const field of before) {
        const next = afterByKey.get(keyOf(field));
        const base = { key: keyOf(field), label: field.label || field.propertyKey, where: whereOf(field) };
        if (!next) {
            removed.push({ ...base, playables: usersOf(field, true) });
            continue;
        }
        const change = changeOf(field, next);
        if (change) changed.push({ ...base, change, playables: usersOf(field, false) });
        else kept++;
    }
    const added = after.filter((field) => !beforeKeys.has(keyOf(field))).length;
    return { removed, changed, added, kept };
}

/** Worth stopping the upload for: a field goes away or changes type (added fields never are). */
export const needsConfirm = (diff: ManifestDiff) => diff.removed.length > 0 || diff.changed.length > 0;
