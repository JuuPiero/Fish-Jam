import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exportPlayablePackage } from '../export';
import { STATE_MESSAGE, type ApplicationItem, type BuildResult, type ConceptItem, type ExportItem, type PanelState } from '../shared';
import { api, ApiError, uploadBuild } from './api';
import { runWebMobileBuild } from './build-task';
import { listExports, requireExport } from './builds';
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
        state.server = { ok: true, authEnabled: info.authEnabled };
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
    fs.rmSync(requireExport(projectRoot(), file));
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

/** Build (Web Mobile, like the last time), package it with its field manifest, and upload it if asked. */
export function build(upload: boolean): Promise<BuildResult> {
    return exclusive(upload ? 'Build and upload' : 'Build', async () => {
        if (upload && (!state.selection.applicationId || !state.selection.conceptId)) throw new Error('Pick an application and a concept to upload to');
        const output = await runWebMobileBuild(projectRoot(), (fraction, message) => progress(message, fraction));
        progress('Packaging the build and its playground fields…', null);
        const file = await exportPlayablePackage(projectRoot(), output);
        if (upload) await uploadNow(file);
        return { file, uploaded: upload };
    });
}

/** Packages the build already in build/web-mobile, without building. */
export function packageExisting(): Promise<BuildResult> {
    return exclusive('Package', async () => {
        progress('Packaging build/web-mobile and its playground fields…', null);
        return { file: await exportPlayablePackage(projectRoot()), uploaded: false };
    });
}

/** Uploads one of the packages listed in the panel. */
export function uploadExport(file: string): Promise<BuildResult> {
    return exclusive('Upload', async () => {
        const resolved = requireExport(projectRoot(), file);
        await uploadNow(resolved);
        return { file: resolved, uploaded: true };
    });
}

export function openUrl(url: string): void {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened');
    void require('electron').shell.openExternal(url);
}

export function reveal(file: string): void {
    require('electron').shell.showItemInFolder(requireExport(projectRoot(), file));
}
