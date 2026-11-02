/**
 * Spine Preview panel (Panel > Spine Preview, or right-click a Spine asset).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createPreviewApp, PreviewApp } from './app';
import { editorBridge } from './bridge';

const CSS = readFileSync(join(__dirname, '../../static/style/panel.css'), 'utf8');

const apps = new WeakMap<object, PreviewApp>();

module.exports = Editor.Panel.define({
    template: '<div id="app"></div>',
    style: CSS,
    $: { app: '#app' },
    methods: {
        /** Message preview-asset (from the Assets context menu). */
        previewAsset(this: any, uuid: string) {
            apps.get(this)?.show(uuid);
        },
    },
    ready() {
        apps.set(this, createPreviewApp((this as any).$.app as HTMLElement, editorBridge()));
    },
    close() {
        apps.get(this)?.dispose();
    },
});
