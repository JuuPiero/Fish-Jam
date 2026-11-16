/**
 * Console Pro panel (Panel > Console Pro). The Vue app lives in app.ts.
 */
import { ConsoleConfig, LogEntry, PlayState, Source } from '../shared/types';
import { createConsoleApp } from './app';
import { STYLE } from './style';

const apps = new WeakMap<object, { vm: any; dispose(): void }>();

module.exports = Editor.Panel.define({
    template: '<div id="app"></div>',
    style: STYLE,
    $: { app: '#app' },
    methods: {
        onEntries(this: any, batch: LogEntry[]) {
            const a = apps.get(this);
            if (a) a.vm.onEntries(batch);
        },
        onRetag(this: any, changes: { id: number; source: Source }[]) {
            const a = apps.get(this);
            if (a) a.vm.onRetag(changes);
        },
        onCleared(this: any) {
            const a = apps.get(this);
            if (a) a.vm.onCleared();
        },
        onPlayState(this: any, p: PlayState) {
            const a = apps.get(this);
            if (a) a.vm.onPlayState(p);
        },
        onConfig(this: any, c: ConsoleConfig) {
            const a = apps.get(this);
            if (a) a.vm.onConfig(c);
        },
    },
    ready(this: any) {
        apps.set(this, createConsoleApp(this.$.app as HTMLElement));
    },
    close(this: any) {
        const a = apps.get(this);
        if (a) a.dispose();
        apps.delete(this);
    },
});
