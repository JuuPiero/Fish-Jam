'use strict';

import * as path from 'path';
import * as fs from 'fs';

let _importReviewData: any = null;

const EFFECT_FILES = ['ikame-particle.effect'];
const EFFECTS_DST_DIR = 'db://assets/effects';

async function ensureEffectsInstalled(): Promise<void> {
    const staticDir = path.join(__dirname, '..', 'static', 'effects');
    const projectPath = Editor.Project?.path || (Editor as any).projectPath || process.cwd();

    for (const file of EFFECT_FILES) {
        const srcPath = path.join(staticDir, file);
        if (!fs.existsSync(srcPath)) {
            console.warn(`[IKame VFX] Effect source not found: ${srcPath}`);
            continue;
        }

        const dstDir = path.join(projectPath, 'assets', 'effects');
        const dstPath = path.join(dstDir, file);
        fs.mkdirSync(dstDir, { recursive: true });

        // Always overwrite with latest version from extension
        const srcContent = fs.readFileSync(srcPath, 'utf-8');
        const dstExists = fs.existsSync(dstPath);
        const dstContent = dstExists ? fs.readFileSync(dstPath, 'utf-8') : '';

        if (srcContent === dstContent) {
            console.log(`[IKame VFX] Effect up to date: ${file}`);
            continue;
        }

        fs.copyFileSync(srcPath, dstPath);
        console.log(`[IKame VFX] ${dstExists ? 'Updated' : 'Installed'} effect: ${file}`);

        // Refresh asset-db so Cocos picks up the change
        try {
            await Editor.Message.request('asset-db', 'refresh-asset', `${EFFECTS_DST_DIR}/${file}`);
        } catch { /* asset-db may not be ready at startup */ }
    }
}

export const methods: Record<string, (...args: any[]) => any> = {
    openBrowser() {
        Editor.Panel.open('ikame-vfx-browser.browser');
    },

    openImportReview(data: any) {
        _importReviewData = data;
        Editor.Panel.open('ikame-vfx-browser.import-review');
    },

    getImportReviewData() {
        return _importReviewData;
    },

    async startImport(data: any) {
        const { VFXImporter } = require('./services/importer');
        const importer = new VFXImporter();
        try {
            const result = await importer.execute(data);
            Editor.Message.send('ikame-vfx-browser', 'import-complete', result);
            return result;
        } catch (err: any) {
            const errorMsg = `Import failed: ${err.message}`;
            console.error(errorMsg);
            return { success: false, error: errorMsg };
        }
    },
};

export async function load() {
    console.log('[IKame VFX Browser] Extension loaded');
    await ensureEffectsInstalled();
}

export function unload() {
    console.log('[IKame VFX Browser] Extension unloaded');
    _importReviewData = null;
}
