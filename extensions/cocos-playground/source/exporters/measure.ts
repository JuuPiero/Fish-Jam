import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import type { TChannel } from 'playable-adapter-core';
import { extractWebMobileBuild } from './build-input';
import { channelOptions, maxBytesFor } from './channels';
import { runPnpExportSerialized } from './pnp';
import { buildSuperHtml } from './super-html';
import { SUPER_HTML_CHANNELS } from './super-html/channels';
import type { ExportArtifact, PlayableBuilder } from './types';

/*
 * Network sizes in the extension: the dashboard's own builders (source/exporters is a copy of
 * next-playground lib/playable-export — keep the two in step), run on one package for one network,
 * the way the dashboard's export packs it (next-playground lib/playable-export/index.ts packNow).
 * The build's own field values and no store links: what the dashboard exports before any edit.
 */

export interface MeasuredSize {
    channel: string;
    label: string;
    format: 'html' | 'zip';
    bytes: number;
    maxBytes: number | null;
}

/** The network's deliverable from what the builder wrote: one HTML, one zip, or a folder (zipped here). */
async function deliverable(artifacts: ExportArtifact[], channel: string): Promise<{ format: 'html' | 'zip'; bytes: number } | null> {
    const html = artifacts.find((artifact) => artifact.path === `${channel}.html`);
    if (html) return { format: 'html', bytes: Buffer.byteLength(html.content) };
    const zip = artifacts.find((artifact) => artifact.path === `${channel}.zip`);
    if (zip) return { format: 'zip', bytes: Buffer.byteLength(zip.content) };
    const folder = artifacts.filter((artifact) => artifact.path.startsWith(`${channel}/`));
    if (!folder.length) return null;
    const packed = new JSZip();
    for (const artifact of folder) packed.file(artifact.path.slice(channel.length + 1), artifact.content);
    return { format: 'zip', bytes: (await packed.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })).length };
}

export async function measure(packageFile: string, builder: PlayableBuilder, channel: string): Promise<MeasuredSize> {
    const option = channelOptions(builder).find((candidate) => candidate.id === channel);
    if (!option) throw new Error(`unknown ${builder} network: ${channel}`);

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-playground-size-'));
    try {
        const buildDir = await extractWebMobileBuild(fs.readFileSync(packageFile), workDir);
        const artifacts =
            builder === 'pnp'
                ? await runPnpExportSerialized({ workDir, channels: [channel as TChannel], buildName: 'playable' })
                : await buildSuperHtml({ buildDir, channels: SUPER_HTML_CHANNELS.filter((candidate) => candidate.id === channel) });
        const result = await deliverable(artifacts, channel);
        if (!result) throw new Error(`${builder} produced no output for ${option.label}`);
        return { channel, label: option.label, ...result, maxBytes: maxBytesFor(builder, channel) };
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}
