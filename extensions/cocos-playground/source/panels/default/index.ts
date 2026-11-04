import { readFileSync } from 'fs';
import { join } from 'path';
import type { PanelState } from '../../shared';
import { createPlaygroundApp, type PlaygroundApp } from './app';
import { editorBridge, emitState } from './editor-bridge';

const STATIC = join(__dirname, '../../../static');
const apps = new WeakMap<object, PlaygroundApp>();

module.exports = Editor.Panel.define({
    template: readFileSync(join(STATIC, 'template/default/index.html'), 'utf-8'),
    style: readFileSync(join(STATIC, 'style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
    },
    methods: {
        /** Broadcast "cocos-playground:state" from the main process. */
        onState(state: PanelState) {
            emitState(state);
        },
    },
    ready() {
        const el = (this as any).$.app as HTMLElement;
        apps.set(this, createPlaygroundApp(el, editorBridge, readFileSync(join(STATIC, 'template/vue/app.html'), 'utf-8')));
    },
    close() {
        apps.get(this)?.destroy();
    },
});
