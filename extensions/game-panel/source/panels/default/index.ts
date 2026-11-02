import { readFileSync } from 'fs';
import { join } from 'path';
import { editorBridge } from '../../editor-bridge';
import { GamePanelApp, createGamePanel } from './app';

const STATIC = join(__dirname, '../../../static');
const apps = new WeakMap<object, GamePanelApp>();

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            apps.get(this)?.setVisible(true);
        },
        hide() {
            apps.get(this)?.setVisible(false);
        },
    },
    template: readFileSync(join(STATIC, 'template/default/index.html'), 'utf-8'),
    style: readFileSync(join(STATIC, 'style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
    },
    methods: {
        /** Broadcast "scene:preview-stop": PIE was stopped (e.g. from the Cocos toolbar). */
        onPreviewStop() {
            apps.get(this)?.onPreviewStop();
        },
        shortcutPlay() {
            apps.get(this)?.shortcut('play');
        },
        shortcutPause() {
            apps.get(this)?.shortcut('pause');
        },
        shortcutStep() {
            apps.get(this)?.shortcut('step');
        },
    },
    ready() {
        const el = (this as any).$.app as HTMLElement;
        const template = readFileSync(join(STATIC, 'template/vue/app.html'), 'utf-8');
        apps.set(this, createGamePanel(el, editorBridge, template));
    },
    async close() {
        const app = apps.get(this);
        apps.delete(this);
        await app?.destroy();
    },
});
