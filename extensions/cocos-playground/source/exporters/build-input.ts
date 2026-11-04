import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

/**
 * Extracts an uploaded web-mobile build zip into `<workDir>/web-mobile` and returns that path.
 *
 * The build may be zipped either as the folder's contents (`index.html` at the zip root) or as the
 * folder itself (`web-mobile/index.html`); the shallowest `index.html` decides which. pnp also
 * expects exactly this layout — it reads `<buildFolderPath>/web-mobile`.
 */
export async function extractWebMobileBuild(zipBuffer: Buffer, workDir: string): Promise<string> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);

  const indexEntry = files
    .filter((entry) => path.posix.basename(entry.name) === 'index.html')
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
  if (!indexEntry) {
    throw new Error('build zip does not contain an index.html');
  }
  const prefix = path.posix.dirname(indexEntry.name) === '.' ? '' : `${path.posix.dirname(indexEntry.name)}/`;

  const destDir = path.join(workDir, 'web-mobile');
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of files) {
    if (!entry.name.startsWith(prefix)) continue;
    const target = path.resolve(destDir, entry.name.slice(prefix.length));
    // Zip-slip guard: an entry like `../../x` must not land outside the work directory.
    if (!target.startsWith(destDir + path.sep)) {
      throw new Error(`build zip entry escapes the build folder: ${entry.name}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, await entry.async('nodebuffer'));
  }

  if (!fs.existsSync(path.join(destDir, 'src', 'system.bundle.js'))) {
    throw new Error('not a Cocos Creator 3.x web-mobile build (src/system.bundle.js is missing)');
  }
  return destDir;
}
