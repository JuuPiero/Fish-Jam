import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exportPlayablePackage } from '../export';
import {
    STATE_MESSAGE,
    type ApplicationItem,
    type Builder,
    type BuildResult,
    type CheckIssue,
    type ChannelOption,
    type ChannelSize,
    type CheckReport,
    type ConceptItem,
    type ExportItem,
    type PanelState,
    type PlayableItem,
    type PreviewResult,
    type SizeEstimate,
    type UploadPlan,
} from '../shared';
import { api, ApiError, uploadBuild } from './api';
import { measureInWorker, networks } from './estimate';
import { lastWebMobileOutput, runWebMobileBuild } from './build-task';
import { deletePackage, listExports, readManifest, readMeta, requireExport, writeMeta } from './builds';
import { checkProject, sameIssues } from './check';
import { diffManifests, needsConfirm, normalizeFields } from './diff';
import { accountFor, DEFAULT_SERVER_URL, saveAccount, saveSelection, selectionFor, serverUrl, setServerUrl } from './config';

/*
 * The panel's backend (main process): one state object, broadcast to the panel on every change,
 * and the actions behind its buttons — sign in, pick application / concept, build, package, upload.
 */

const projectRoot = () => Editor.Project.path;

const state: PanelState = {
    serverUrl: serverUrl(),
    defaultServerUrl: DEFAULT_SERVER_URL,
    server: null,
    account: null,
    signIn: null,
    selection: { applicationId: null, conceptId: null },
    busy: null,
    lastUpload: null,
};
let signInRun = 0;

function publish(): PanelState {
    const copy = JSON.parse(JSON.stringify(state)) as PanelState;
    try {
        Editor.Message.broadcast(STATE_MESSAGE, copy);
    } catch {
        // No editor (tests): the caller gets the state back anyway.
    }
    return copy;
}

const token = () => accountFor(state.serverUrl)?.token ?? null;

/** API errors that mean "the token is gone": forget it so the panel offers Sign in again. */
function onApiError(error: unknown): never {
    if (error instanceof ApiError && error.status === 401) {
        saveAccount(state.serverUrl, null);
        state.account = null;
        publish();
    }
    throw error instanceof Error ? error : new Error(String(error));
}

/** Checks the server and the saved sign-in; the panel calls it when it opens and on Refresh. */
export async function refresh(): Promise<PanelState> {
    state.serverUrl = serverUrl();
    state.selection = selectionFor(projectRoot(), state.serverUrl);
    try {
        const info = await api.info(state.serverUrl);
        if (info?.name !== 'next-playground') throw new Error(`${state.serverUrl} is not a cocos-playground server`);
        state.server = { ok: true, authEnabled: info.authEnabled, features: info.features ?? [] };
    } catch (error) {
        state.server = { ok: false, error: error instanceof Error ? error.message : String(error) };
        state.account = null;
        return publish();
    }
    if (!state.server.authEnabled) {
        state.account = { email: null, expiresAt: null };
        return publish();
    }
    const saved = accountFor(state.serverUrl);
    if (!saved) {
        state.account = null;
        return publish();
    }
    try {
        const me = await api.me(state.serverUrl, saved.token);
        state.account = me.user ? { email: me.user.email, expiresAt: saved.expiresAt } : null;
        if (!me.user) saveAccount(state.serverUrl, null);
    } catch {
        state.account = { email: saved.email, expiresAt: saved.expiresAt };
    }
    return publish();
}

export const getState = (): PanelState => JSON.parse(JSON.stringify(state));

export async function changeServer(url: string): Promise<PanelState> {
    cancelSignIn();
    state.serverUrl = setServerUrl(url);
    state.server = null;
    state.account = null;
    publish();
    return refresh();
}

/**
 * Device login: shows a code, opens the dashboard's /extension/connect page in the browser, and
 * polls until the user allows (or denies) it there.
 */
export async function signIn(): Promise<PanelState> {
    const run = ++signInRun;
    const projectName = path.basename(projectRoot());
    const start = await api.startLogin(state.serverUrl, `Cocos Creator on ${os.hostname()} · ${projectName}`);
    state.signIn = { userCode: start.user_code, verificationUri: start.verification_uri };
    publish();
    openUrl(start.verification_uri);

    const deadline = Date.now() + start.expires_in * 1000;
    try {
        while (run === signInRun && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, Math.max(1, start.interval) * 1000));
            if (run !== signInRun) break;
            const result = await api.pollLogin(state.serverUrl, start.device_code);
            if (result.status === 'approved') {
                saveAccount(state.serverUrl, { token: result.token, email: result.email, expiresAt: result.expires_at });
                state.account = { email: result.email, expiresAt: result.expires_at };
                return publish();
            }
            if (result.status === 'denied') throw new Error('The sign-in was denied in the browser');
            if (result.status === 'expired') throw new Error('The sign-in code expired; try again');
        }
        if (run === signInRun) throw new Error('The sign-in code expired; try again');
        return getState();
    } finally {
        if (run === signInRun) {
            state.signIn = null;
            publish();
        }
    }
}

export function cancelSignIn(): PanelState {
    signInRun++;
    state.signIn = null;
    return publish();
}

export function signOut(): PanelState {
    saveAccount(state.serverUrl, null);
    state.account = null;
    return publish();
}

export async function applications(): Promise<ApplicationItem[]> {
    try {
        const list = await api.applications(state.serverUrl, token());
        return list.map((app) => ({ id: app.id, name: app.name, iconUrl: app.icon_url ?? null }));
    } catch (error) {
        return onApiError(error);
    }
}

export async function concepts(applicationId: number): Promise<ConceptItem[]> {
    try {
        const list = await api.concepts(state.serverUrl, token(), applicationId);
        return list.map((concept) => ({ id: concept.id, name: concept.name, buildUploadedAt: concept.build_uploaded_at }));
    } catch (error) {
        return onApiError(error);
    }
}

export async function createConcept(applicationId: number, name: string): Promise<ConceptItem> {
    if (!name.trim()) throw new Error('Name the new concept');
    try {
        const concept = await api.createConcept(state.serverUrl, token(), applicationId, name.trim());
        select(applicationId, concept.id);
        return { id: concept.id, name: concept.name, buildUploadedAt: concept.build_uploaded_at };
    } catch (error) {
        return onApiError(error);
    }
}

export function select(applicationId: number | null, conceptId: number | null): PanelState {
    state.selection = { applicationId, conceptId };
    saveSelection(projectRoot(), state.serverUrl, state.selection);
    return publish();
}

export async function exports(): Promise<ExportItem[]> {
    return listExports(projectRoot());
}

export function deleteExport(file: string): void {
    deletePackage(requireExport(projectRoot(), file));
}

/** One action at a time; `busy` tells the panel what is going on. */
async function exclusive<T>(label: string, work: () => Promise<T>): Promise<T> {
    if (state.busy) throw new Error(`Wait for "${state.busy.label}" to finish`);
    state.busy = { label, message: '', progress: null };
    publish();
    try {
        return await work();
    } finally {
        state.busy = null;
        publish();
    }
}

const progress = (message: string, fraction: number | null) => {
    if (!state.busy) return;
    state.busy.message = message;
    state.busy.progress = fraction;
    publish();
};

async function uploadNow(file: string): Promise<void> {
    const { applicationId, conceptId } = state.selection;
    if (!applicationId || !conceptId) throw new Error('Pick an application and a concept to upload to');
    progress(`Uploading ${path.basename(file)}…`, 0);
    let concept;
    try {
        concept = await uploadBuild(state.serverUrl, token(), conceptId, file, (fraction) => progress(`Uploading ${path.basename(file)}… ${Math.round(fraction * 100)}%`, fraction));
    } catch (error) {
        return onApiError(error);
    }
    state.lastUpload = {
        conceptName: concept?.name ?? `concept ${conceptId}`,
        url: `${state.serverUrl}/applications/${applicationId}/concepts/${conceptId}`,
        at: new Date().toISOString(),
    };
}

/*
 * The project check stops Build / Package when it finds something; "Build anyway" (`force`) goes on
 * and remembers those issues, so the same ones don't stop the next build of this session.
 */
let acceptedIssues: CheckIssue[] | null = null;

const stopsAt = (report: CheckReport, force: boolean) => {
    if (report.issues.length === 0) return false;
    if (force) {
        acceptedIssues = report.issues;
        return false;
    }
    return !(acceptedIssues && sameIssues(acceptedIssues, report.issues));
};

const defaultWebMobile = () => path.join(projectRoot(), 'build', 'web-mobile');

/** The project check on its own (the panel's Check button), against the folder the next Build writes. */
export function check(): Promise<CheckReport> {
    return exclusive('Check', async () => {
        progress('Checking the project…', null);
        const target = (await lastWebMobileOutput(projectRoot()).catch(() => null)) ?? defaultWebMobile();
        return checkProject(projectRoot(), target).report;
    });
}

/** Packages `webMobileDir`, keeping the check made of it beside the package. */
async function packageBuild(webMobileDir: string, scanned?: ReturnType<typeof checkProject>): Promise<string> {
    progress('Packaging the build and its playground fields…', null);
    const { report, manifest } = scanned ?? checkProject(projectRoot(), webMobileDir);
    const file = await exportPlayablePackage(projectRoot(), webMobileDir, manifest);
    writeMeta(file, { issues: report.issues });
    return file;
}

/**
 * Build (Web Mobile, like the last time), package it with its field manifest, and upload it if asked.
 * Stops first at the project check (`check` in the result) unless `force`; and before replacing
 * a concept's build that loses or changes fields (`plan`), like Upload does.
 */
export function build(upload: boolean, force = false): Promise<BuildResult> {
    return exclusive(upload ? 'Build and upload' : 'Build', async () => {
        if (upload && (!state.selection.applicationId || !state.selection.conceptId)) throw new Error('Pick an application and a concept to upload to');
        progress('Checking the project…', null);
        const target = (await lastWebMobileOutput(projectRoot()).catch(() => null)) ?? defaultWebMobile();
        const before = checkProject(projectRoot(), target).report;
        if (stopsAt(before, force)) return { file: null, uploaded: false, check: before };

        const output = await runWebMobileBuild(projectRoot(), (fraction, message) => progress(message, fraction));
        const file = await packageBuild(output);
        if (!upload) return { file, uploaded: false };
        const plan = await planUpload(file);
        if (plan && needsConfirm(plan)) return { file, uploaded: false, plan };
        await uploadNow(file);
        return { file, uploaded: true };
    });
}

/** Packages the build already in build/web-mobile, without building (stops at the check unless `force`). */
export function packageExisting(force = false): Promise<BuildResult> {
    return exclusive('Package', async () => {
        if (!fs.existsSync(path.join(defaultWebMobile(), 'index.html'))) {
            throw new Error('No build in build/web-mobile yet: press Build, or build "Web Mobile" in the Build panel first');
        }
        progress('Checking the project…', null);
        const scanned = checkProject(projectRoot(), defaultWebMobile(), true);
        if (stopsAt(scanned.report, force)) return { file: null, uploaded: false, check: scanned.report };
        return { file: await packageBuild(defaultWebMobile(), scanned), uploaded: false };
    });
}

/**
 * What uploading `file` to the selected concept would change: its fields against the concept's
 * current build, and which playables saved values for the ones that go away or change.
 * null: nothing to compare (no manifest in the package).
 */
async function planUpload(file: string): Promise<UploadPlan | null> {
    const conceptId = state.selection.conceptId;
    if (!conceptId) return null;
    const manifest = await readManifest(file);
    if (!manifest) return null;
    progress('Comparing with the concept’s current build…', null);
    try {
        const concept = await api.concept(state.serverUrl, token(), conceptId);
        const previous = normalizeFields(concept.manifest);
        const playables = previous.length ? await api.playables(state.serverUrl, token(), conceptId) : [];
        const diff = diffManifests(
            previous,
            normalizeFields(manifest),
            playables.map((playable) => ({ name: playable.name, values: playable.field_values ?? {} })),
        );
        return { conceptName: concept.name, replaces: !!concept.build_uploaded_at, playables: playables.length, ...diff };
    } catch (error) {
        return onApiError(error);
    }
}

/** Uploads one of the packages listed in the panel (stops at a risky field change unless `force`). */
export function uploadExport(file: string, force = false): Promise<BuildResult> {
    return exclusive('Upload', async () => {
        const resolved = requireExport(projectRoot(), file);
        if (!state.selection.applicationId || !state.selection.conceptId) throw new Error('Pick an application and a concept to upload to');
        if (!force) {
            const plan = await planUpload(resolved);
            if (plan && needsConfirm(plan)) return { file: resolved, uploaded: false, plan };
        }
        await uploadNow(resolved);
        return { file: resolved, uploaded: true };
    });
}

/** The networks each builder packs for, with their size caps (for the panel's network picker). */
export async function channels(): Promise<Record<Builder, ChannelOption[]>> {
    return networks();
}

/**
 * One network's size for a package, packed right here by the dashboard's own builders (in a child
 * process: connect/estimate.ts) — one network at a time. Kept beside the package, merged with the
 * networks measured before (each keeps its latest result).
 */
export function estimate(file: string, builder: Builder, channel: string): Promise<SizeEstimate> {
    return exclusive('Estimate size', async () => {
        const resolved = requireExport(projectRoot(), file);
        const option = networks()[builder].find((candidate) => candidate.channel === channel?.trim());
        if (!channel?.trim()) throw new Error('Pick the ad network to estimate');
        if (!option) throw new Error(`Unknown ${builder} network: ${channel}`);
        progress(`Packing ${path.basename(resolved)} for ${option.label} (${builder})…`, null);
        const measured = await measureInWorker(resolved, builder, option.channel);
        const at = new Date().toISOString();
        const fresh: ChannelSize[] = [
            {
                channel: measured.channel,
                label: measured.label,
                format: measured.format,
                bytes: measured.bytes,
                maxBytes: measured.maxBytes,
                withinLimit: measured.maxBytes === null || measured.bytes <= measured.maxBytes,
                at,
            },
        ];
        const before = readMeta(resolved).estimates?.[builder]?.channels ?? [];
        const merged = [...before.filter((old) => !fresh.some((channel) => channel.channel === old.channel)), ...fresh];
        const result: SizeEstimate = { builder, at, channels: merged };
        writeMeta(resolved, { estimates: { ...readMeta(resolved).estimates, [builder]: result } });
        return result;
    });
}

/* ---- Playables of the selected concept ---- */

const isFileRef = (value: unknown): boolean =>
    !!value && typeof value === 'object' && typeof (value as { file?: unknown }).file === 'string' && typeof (value as { kind?: unknown }).kind === 'string';
const hasFileRef = (value: unknown): boolean => (Array.isArray(value) ? value.some(hasFileRef) : isFileRef(value));

export async function playables(conceptId: number): Promise<PlayableItem[]> {
    try {
        const list = await api.playables(state.serverUrl, token(), conceptId);
        return list
            .map((playable) => {
                const values = Object.values(playable.field_values ?? {});
                return { id: playable.id, name: playable.name, updatedAt: playable.updated_at, values: values.length, fileValues: values.filter(hasFileRef).length };
            })
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch (error) {
        return onApiError(error);
    }
}

async function valuesOf(playableId: number): Promise<Record<string, unknown>> {
    const conceptId = state.selection.conceptId;
    if (!conceptId) throw new Error('Pick the concept first');
    let list;
    try {
        list = await api.playables(state.serverUrl, token(), conceptId);
    } catch (error) {
        return onApiError(error);
    }
    const playable = list.find((item) => item.id === playableId);
    if (!playable) throw new Error('That playable is gone from the concept; refresh the list');
    return playable.field_values ?? {};
}

/** The editor's browser preview address (Preview button's), e.g. http://localhost:7456. */
async function editorPreviewUrl(): Promise<string> {
    const request = (Editor.Message.request as any).bind(Editor.Message) as (target: string, message: string, ...args: any[]) => Promise<any>;
    const url = await request('preview', 'query-preview-url').catch(() => null);
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
    const port = await request('server', 'query-port').catch(() => null);
    return `http://localhost:${typeof port === 'number' ? port : 7456}`;
}

/**
 * Opens the editor's browser preview with a playable's saved values (`?pgvo=`, as the dashboard's
 * preview does). Files uploaded to the dashboard aren't in the project, so those fields keep the
 * scene's own asset; replaced images / sounds don't apply either.
 */
export async function previewPlayable(playableId: number): Promise<PreviewResult> {
    const values = await valuesOf(playableId);
    const kept = Object.fromEntries(Object.entries(values).filter(([, value]) => !hasFileRef(value)));
    const pgvo = Buffer.from(JSON.stringify(kept), 'utf8').toString('base64');
    const base = await editorPreviewUrl();
    const url = `${base}${base.includes('?') ? '&' : '?'}pgvo=${encodeURIComponent(pgvo)}`;
    openUrl(url);
    return { url, skippedFiles: Object.keys(values).length - Object.keys(kept).length };
}

/** A playable's saved values as JSON on the clipboard. */
export async function copyPlayableValues(playableId: number): Promise<number> {
    const values = await valuesOf(playableId);
    require('electron').clipboard.writeText(JSON.stringify(values, null, 2));
    return Object.keys(values).length;
}

export function openUrl(url: string): void {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened');
    void Promise.resolve(require('electron').shell.openExternal(url)).catch((error: unknown) => console.warn(`[cocos-playground] could not open ${url}: ${error}`));
}

export function reveal(file: string): void {
    require('electron').shell.showItemInFolder(requireExport(projectRoot(), file));
}
