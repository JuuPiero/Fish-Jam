/**
 * Runs the real panel Vue app in a browser with a fake bridge (no Cocos, no server).
 *
 *   preview.html#signin     signed out          preview.html#pending   waiting for browser approval
 *   preview.html#main       signed in + target  preview.html#busy      upload in progress
 *   preview.html#settings   settings view       preview.html#down      server unreachable
 *   preview.html#interact   click through the flows, print the checks into #result
 */
import type { ApplicationItem, BuildResult, ConceptItem, ExportItem, PanelState } from '../../source/shared';
import type { PlaygroundBridge } from '../../source/panels/default/bridge';
import { createPlaygroundApp } from '../../source/panels/default/app';

const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String((e as PromiseRejectionEvent).reason)));
const err0 = console.error.bind(console);
const warn0 = console.warn.bind(console);
console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(' '));
    err0(...a);
};
console.warn = (...a: unknown[]) => {
    errors.push(`warn: ${a.map(String).join(' ')}`);
    warn0(...a);
};

const mode = location.hash.slice(1) || 'main';
const DEFAULT = 'https://playground.168-138-171-60.sslip.io';
const calls: string[] = [];
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const apps: ApplicationItem[] = [
    { id: 1, name: 'Hexa Sort 3D', iconUrl: null },
    { id: 2, name: 'Bus Jam Escape', iconUrl: null },
];
const concepts: Record<number, ConceptItem[]> = {
    1: [
        { id: 11, name: 'Hexa - Level 5 fail', buildUploadedAt: ago(90) },
        { id: 12, name: 'Hexa - ASMR stack', buildUploadedAt: null },
    ],
    2: [{ id: 21, name: 'Bus - Rush hour', buildUploadedAt: ago(60 * 30) }],
};
let exportsList: ExportItem[] = [
    { file: 'C:/proj/build/cocos-playground-export/HexaSort_20261104-101500.zip', name: 'HexaSort_20261104-101500.zip', bytes: 3_456_789, createdAt: ago(3), fields: 7 },
    { file: 'C:/proj/build/cocos-playground-export/HexaSort_20261103-174210.zip', name: 'HexaSort_20261103-174210.zip', bytes: 3_401_222, createdAt: ago(60 * 20), fields: 0 },
];

const state: PanelState = {
    serverUrl: DEFAULT,
    defaultServerUrl: DEFAULT,
    server: mode === 'down' ? { ok: false, error: 'connect ECONNREFUSED 168.138.171.60:443' } : { ok: true, authEnabled: true },
    account: mode === 'signin' || mode === 'pending' || mode === 'down' || mode === 'interact' ? null : { email: 'dev@example.com', expiresAt: ago(-60 * 24 * 90) },
    signIn: mode === 'pending' ? { userCode: 'KQWX-7RTM', verificationUri: `${DEFAULT}/extension/connect?code=KQWX-7RTM` } : null,
    selection: mode === 'interact' ? { applicationId: null, conceptId: null } : { applicationId: 1, conceptId: 11 },
    busy: mode === 'busy' ? { label: 'Uploading', message: 'HexaSort_20261104-101500.zip', progress: 0.42 } : null,
    lastUpload: mode === 'main' || mode === 'busy' ? { conceptName: 'Hexa - Level 5 fail', url: `${DEFAULT}/applications/1/concepts/11`, at: ago(90) } : null,
};

const listeners = new Set<(s: PanelState) => void>();
const snapshot = () => JSON.parse(JSON.stringify(state)) as PanelState;
const publish = () => listeners.forEach((l) => l(snapshot()));
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
let failNextUpload = false;

const bridge: PlaygroundBridge = {
    async state() {
        calls.push('state');
        return snapshot();
    },
    async refresh() {
        calls.push('refresh');
        return snapshot();
    },
    async setServerUrl(url) {
        calls.push(`setServerUrl ${url}`);
        if (!/^https?:\/\/[^/]+/.test(url)) throw new Error('Enter an http(s) URL');
        state.serverUrl = url.replace(/\/+$/, '');
        state.server = { ok: true, authEnabled: true };
        return snapshot();
    },
    async signIn() {
        calls.push('signIn');
        state.signIn = { userCode: 'KQWX-7RTM', verificationUri: `${state.serverUrl}/extension/connect?code=KQWX-7RTM` };
        publish();
        await tick(150);
        if (!state.signIn) return snapshot(); // cancelled
        state.signIn = null;
        state.account = { email: 'dev@example.com', expiresAt: ago(-60 * 24 * 90) };
        return snapshot();
    },
    async cancelSignIn() {
        calls.push('cancelSignIn');
        state.signIn = null;
        return snapshot();
    },
    async signOut() {
        calls.push('signOut');
        state.account = null;
        return snapshot();
    },
    async applications() {
        calls.push('applications');
        await tick();
        return apps;
    },
    async concepts(id) {
        calls.push(`concepts ${id}`);
        await tick();
        return [...(concepts[id] ?? [])];
    },
    async createConcept(appId, name) {
        calls.push(`createConcept ${appId} ${name}`);
        const concept = { id: 100 + Math.floor(Math.random() * 900), name: name.trim(), buildUploadedAt: null };
        (concepts[appId] ??= []).push(concept);
        state.selection = { applicationId: appId, conceptId: concept.id };
        return concept;
    },
    async select(applicationId, conceptId) {
        calls.push(`select ${applicationId} ${conceptId}`);
        state.selection = { applicationId, conceptId };
        return snapshot();
    },
    async exports() {
        calls.push('exports');
        return exportsList;
    },
    async deleteExport(file) {
        calls.push(`deleteExport ${file}`);
        exportsList = exportsList.filter((e) => e.file !== file);
    },
    async build(upload) {
        calls.push(`build ${upload}`);
        for (const [label, progress] of [['Building', null], ['Packaging', null], ...(upload ? [['Uploading', 0.5]] : [])] as const) {
            state.busy = { label, message: 'web-mobile', progress };
            publish();
            await tick(40);
        }
        state.busy = null;
        const item = { file: 'C:/proj/build/cocos-playground-export/HexaSort_new.zip', name: 'HexaSort_new.zip', bytes: 3_500_000, createdAt: ago(0), fields: 7 };
        exportsList = [item, ...exportsList];
        if (upload) markUploaded();
        publish();
        return { file: item.file, uploaded: upload } satisfies BuildResult;
    },
    async packageExisting() {
        calls.push('packageExisting');
        const item = { file: 'C:/proj/build/cocos-playground-export/HexaSort_pkg.zip', name: 'HexaSort_pkg.zip', bytes: 3_300_000, createdAt: ago(0), fields: 7 };
        exportsList = [item, ...exportsList];
        return { file: item.file, uploaded: false };
    },
    async uploadExport(file) {
        calls.push(`uploadExport ${file}`);
        if (failNextUpload) {
            failNextUpload = false;
            throw new Error('Upload failed: 413 Payload Too Large');
        }
        markUploaded();
        publish();
        return { file, uploaded: true };
    },
    async openUrl(url) {
        calls.push(`openUrl ${url}`);
    },
    async reveal(file) {
        calls.push(`reveal ${file}`);
    },
    onState(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

function markUploaded() {
    const { applicationId, conceptId } = state.selection;
    const concept = concepts[applicationId ?? 0]?.find((c) => c.id === conceptId);
    if (concept) concept.buildUploadedAt = new Date().toISOString();
    state.lastUpload = { conceptName: concept?.name ?? '?', url: `${state.serverUrl}/applications/${applicationId}/concepts/${conceptId}`, at: new Date().toISOString() };
}

createPlaygroundApp(document.getElementById('app')!, bridge, (window as any).__TEMPLATE__);
if (mode === 'settings') setTimeout(() => (document.querySelector('[title="Settings"]') as HTMLElement).click(), 50);

// ---------------------------------------------------------------- interact
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const byText = (sel: string, text: string) => $$(sel).find((el) => el.textContent!.trim().startsWith(text)) ?? null;
const lines: string[] = [];
function check(name: string, ok: boolean, detail = '') {
    lines.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function until(pred: () => boolean, ms = 2000) {
    const end = Date.now() + ms;
    while (!pred() && Date.now() < end) await tick(10);
    return pred();
}
function choose(select: HTMLSelectElement, value: string) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
}

async function interact() {
    await until(() => !!byText('button', 'Sign in with browser'));
    check('signed out shows Sign in', !!byText('button', 'Sign in with browser'));
    check('Build & Upload disabled when signed out', !!byText('button', 'Build & Upload')?.hasAttribute('disabled'));
    check('exports listed', $$('.pg-row').length === 2, `${$$('.pg-row').length} rows`);
    check('field count shown', $$('.pg-row')[0]?.textContent!.includes('7 fields') ?? false);

    byText('button', 'Sign in with browser')!.click();
    check('pending code shown', await until(() => $('.pg-code')?.textContent === 'KQWX-7RTM'));
    check('signed in after approval', await until(() => !!$('#pg-app')));
    check('applications loaded', await until(() => $$('#pg-app option').length === 3), `${$$('#pg-app option').length} options`);
    check('concept select disabled before app', !!$<HTMLSelectElement>('#pg-concept')?.disabled);

    choose($<HTMLSelectElement>('#pg-app')!, '1');
    check('concepts loaded (+ New)', await until(() => $$('#pg-concept option').length === 4), `${$$('#pg-concept option').length} options`);
    choose($<HTMLSelectElement>('#pg-concept')!, '11');
    await until(() => calls.includes('select 1 11'));
    check('concept selected', await until(() => $('.pg-card')?.textContent!.includes('Last upload: ') ?? false));
    check('Build & Upload enabled', await until(() => !byText('button', 'Build & Upload')!.hasAttribute('disabled')));

    choose($<HTMLSelectElement>('#pg-concept')!, '__new');
    check('new concept input', await until(() => !!$('input[placeholder="New concept name"]')));
    const nameInput = $<HTMLInputElement>('input[placeholder="New concept name"]')!;
    nameInput.value = 'Hexa - Boss level';
    nameInput.dispatchEvent(new Event('input'));
    await tick();
    byText('button', 'Create')!.click();
    check('concept created and selected', await until(() => $<HTMLSelectElement>('#pg-concept')?.selectedOptions[0]?.textContent === 'Hexa - Boss level'));
    check('created notice', await until(() => $('.pg-status')!.textContent!.includes('created')));

    byText('button', 'Build & Upload')!.click();
    check('busy shown while building', await until(() => !!$('.pg-busy')));
    check('buttons disabled while busy', !!byText('button', 'Build')?.hasAttribute('disabled'));
    check('build finished', await until(() => !$('.pg-busy') && $('.pg-status')!.textContent!.includes('uploaded')), $('.pg-status')!.textContent!.trim());
    check('new export listed', await until(() => $$('.pg-row').length === 3));
    check('last upload link', !!byText('.pg-status button', 'View upload'));

    failNextUpload = true;
    byText('.pg-row button', 'Upload')!.click();
    check('upload error shown', await until(() => !!$('.pg-status .pg-error-text')), $('.pg-status')!.textContent!.trim());
    byText('.pg-status button', 'Dismiss')!.click();
    await tick();
    byText('.pg-row button', 'Upload')!.click();
    check('upload ok', await until(() => $('.pg-status')!.textContent!.includes('uploaded to Hexa - Boss level')));

    const del = () => $$('.pg-row')[2].querySelectorAll('button')[2] as HTMLElement;
    del().click();
    check('delete asks', await until(() => del().textContent === 'Sure?'));
    del().click();
    check('deleted', await until(() => $$('.pg-row').length === 2));

    byText('.pg-row button', 'Reveal')!.click();
    byText('button', 'Open in dashboard')!.click();
    await tick();
    check('reveal + open dashboard', calls.some((c) => c.startsWith('reveal ')) && calls.some((c) => /openUrl .*\/applications\/1\/concepts\/\d+$/.test(c)));

    byText('button', 'Package build/web-mobile')!.click();
    check('package existing', await until(() => $('.pg-status')!.textContent!.includes('Packaged HexaSort_pkg.zip')));

    ($('[title="Settings"]') as HTMLElement).click();
    check('settings opens', await until(() => !!$('#pg-server')));
    const server = $<HTMLInputElement>('#pg-server')!;
    check('server prefilled', server.value === DEFAULT, server.value);
    server.value = 'ftp://nope';
    server.dispatchEvent(new Event('input'));
    await tick();
    byText('button', 'Save')!.click();
    check('bad URL rejected', await until(() => $('.pg-status')!.textContent!.includes('http(s)')));
    server.value = 'http://localhost:3000/';
    server.dispatchEvent(new Event('input'));
    await tick();
    byText('button', 'Save')!.click();
    check('server saved', await until(() => $('.pg-host')!.textContent === 'localhost:3000'), $('.pg-host')!.textContent!);
    byText('button', 'Reset to default')!.click();
    check('reset to default', await until(() => $('.pg-host')!.textContent === DEFAULT.replace('https://', '')));
    byText('button', 'Sign out')!.click();
    check('signed out', await until(() => !$('.pg-avatar')));
    byText('button', '‹ Back')!.click();
    check('back to sign in', await until(() => !!byText('button', 'Sign in with browser')));

    byText('button', 'Sign in with browser')!.click();
    await until(() => !!$('.pg-code'));
    byText('button', 'Cancel')!.click();
    await tick(250);
    check('cancel sign in', !$('.pg-code') && !!byText('button', 'Sign in with browser'));

    check('no console errors', errors.length === 0, errors.join(' | '));
    const out = document.createElement('div');
    out.id = 'result';
    out.textContent = lines.join('\n');
    document.body.appendChild(out);
}

if (mode === 'interact') void interact().catch((e) => {
    const out = document.createElement('div');
    out.id = 'result';
    out.textContent = `${lines.join('\n')}\nCRASH ${e?.stack ?? e}`;
    document.body.appendChild(out);
});
