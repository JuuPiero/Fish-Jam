/**
 * Scene-process half of advanced-inspector: answers the Inspector's questions
 * about component classes. The runtime (assets/AdvancedInspector.ts) records
 * the metadata on each class and registers a lookup function on globalThis
 * when the project's scripts load.
 */
import { join } from 'path';

module.paths.push(join(Editor.App.path, 'node_modules'));

function cc(): any {
    return require('cc');
}

const g = globalThis as any;

export const methods: Record<string, (...args: any[]) => any> = {
    /** Attribute metadata of a component class, or null when it has none. */
    getMeta(type: string) {
        const getClassMeta = g.__advInspectorGetClassMeta;
        if (typeof getClassMeta !== 'function' || typeof type !== 'string') return null;
        const ctor = cc().js.getClassByName(type);
        if (!ctor) return null;
        const meta = getClassMeta(ctor);
        return meta ? JSON.parse(JSON.stringify(meta)) : null;
    },

    info() {
        const set: Set<any> | undefined = g.__advInspectorClasses;
        const js = cc().js;
        return {
            runtimeLoaded: typeof g.__advInspectorGetClassMeta === 'function',
            classes: set ? [...set].map((ctor) => js.getClassName(ctor) || ctor.name) : [],
        };
    },
};

export function load() {}

export function unload() {}
