import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { scanAssetMetas, scanBuildNatives } from './analysis/assets';
import { buildPropertyKeyIndex, buildTypeIndex, scanDecorators } from './analysis/scanDecorators';
import { scanScenes } from './analysis/scanScenes';
import { PlayableManifest } from './analysis/types';

/** The extension lives at `<project>/extensions/cocos-playground`. */
function findProjectRoot(): string {
    return path.join(__dirname, '..', '..', '..');
}

function addDirToZip(zip: JSZip, dir: string, zipPath: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            addDirToZip(zip, fullPath, entryZipPath);
        } else {
            zip.file(entryZipPath, fs.readFileSync(fullPath));
        }
    }
}

/**
 * Reads which scene(s) actually shipped in this specific build, straight from its own generated
 * `src/settings.json` (`launch.launchScene`, e.g. `"db://assets/Temp.scene"`) — the source of
 * truth for "what's really in the thing about to be zipped up", rather than every `.scene` file
 * that happens to exist under `assets/` (which would include old/unrelated test scenes never
 * checked in this build's "Included Scenes" list). Only covers the launch scene, not every scene
 * a game might transition to later — fine for the common single-scene playable-ad case, but a
 * multi-scene playable would need this extended to also read whatever inter-scene-loading list
 * Cocos records, if any.
 */
function getIncludedScenePaths(webMobileDir: string): Set<string> | null {
    const settingsPath = path.join(webMobileDir, 'src', 'settings.json');
    if (!fs.existsSync(settingsPath)) return null;

    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const launchScene: string | undefined = settings?.launch?.launchScene;
        if (!launchScene) return null;

        const relative = launchScene.replace(/^db:\/\/assets\//, '');
        return new Set([relative]);
    } catch (error) {
        console.warn(`[cocos-playground] failed to read ${settingsPath}, scanning all scenes instead: ${error}`);
        return null;
    }
}

/** Every `@playGroundField` placement in the build's scenes and the project's prefabs, with its saved value. */
export function buildManifest(assetsDir: string, webMobileDir: string): PlayableManifest {
    const { classes, projectTypeIds } = scanDecorators(assetsDir);
    const fields = scanScenes(assetsDir, {
        types: buildTypeIndex(classes),
        projectTypeIds,
        propertyKeys: buildPropertyKeyIndex(classes),
        assets: { metas: scanAssetMetas(assetsDir), natives: scanBuildNatives(webMobileDir) },
        includedScenes: getIncludedScenePaths(webMobileDir),
    });
    return { version: 2, generatedAt: new Date().toISOString(), fields };
}

/**
 * Scans the project for @playGroundField values, then zips the existing `build/web-mobile`
 * output together with a `playground-manifest.json` into `build/cocos-playground-export/`.
 * Does not trigger a build itself and does not talk to any backend — the user builds for the
 * "Web Mobile" platform via Cocos Creator's own Build panel first, then uploads the resulting
 * zip by hand through the web frontend.
 */
export async function exportPlayablePackage(projectRoot: string = findProjectRoot()): Promise<string> {
    const assetsDir = path.join(projectRoot, 'assets');
    const webMobileDir = path.join(projectRoot, 'build', 'web-mobile');
    const indexHtmlPath = path.join(webMobileDir, 'index.html');

    if (!fs.existsSync(indexHtmlPath)) {
        throw new Error(
            `No web-mobile build found at "${webMobileDir}". Build for the "Web Mobile" platform in Cocos Creator's Build panel first, then run this command again.`
        );
    }

    const manifest = buildManifest(assetsDir, webMobileDir);

    const zip = new JSZip();
    addDirToZip(zip, webMobileDir, 'web-mobile');
    zip.file('playground-manifest.json', JSON.stringify(manifest, null, 2));

    const outDir = path.join(projectRoot, 'build', 'cocos-playground-export');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `playable-${Date.now()}.zip`);

    const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outFile, content);

    return outFile;
}
