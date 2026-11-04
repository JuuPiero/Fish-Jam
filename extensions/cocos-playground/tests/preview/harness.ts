/**
 * Runs the real panel Vue app in a browser with a fake bridge (no Cocos, no server).
 *
 *   preview.html#signin     signed out          preview.html#pending   waiting for browser approval
 *   preview.html#main       signed in + target  preview.html#busy      upload in progress
 *   preview.html#settings   settings view       preview.html#down      server unreachable
 *   preview.html#interact   click through the flows, print the checks into #result
 */
import type { ApplicationItem, Builder, BuildResult, CheckReport, ConceptItem, ExportItem, PanelState, PlayableItem, SizeEstimate, UploadPlan } from '../../source/shared';
import { diffManifests } from '../../source/connect/diff';
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
    { id: 3, name: 'Khủng Long Chạy', iconUrl: null },
    // Plenty more, as a real dashboard grows: the picker needs its search.
    ...Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: `Puzzle Game ${String(i + 1).padStart(2, '0')}`, iconUrl: null })),
];
const concepts: Record<number, ConceptItem[]> = {
    1: [
        { id: 11, name: 'Hexa - Level 5 fail', buildUploadedAt: ago(90) },
        { id: 12, name: 'Hexa - ASMR stack', buildUploadedAt: null },
    ],
    2: [{ id: 21, name: 'Bus - Rush hour', buildUploadedAt: ago(60 * 30) }],
};
const MB = 1024 * 1024;
const NETWORKS: Record<Builder, [string, string, 'html' | 'zip', number | null][]> = {
    pnp: [
        ['AppLovin', 'AppLovin', 'html', 5],
        ['Facebook', 'Facebook', 'html', 2],
        ['Google', 'Google', 'zip', 5],
        ['IronSource', 'IronSource', 'html', 5],
        ['Liftoff', 'Liftoff', 'zip', null],
        ['Mintegral', 'Mintegral', 'zip', 5],
        ['Moloco', 'Moloco', 'html', null],
        ['Pangle', 'Pangle', 'zip', 5],
        ['Rubeex', 'Rubeex', 'html', null],
        ['Tiktok', 'TikTok', 'zip', 5],
        ['Unity', 'Unity', 'html', 5],
    ],
    'super-html': [
        ['applovin', 'AppLovin', 'html', 5],
        ['facebook', 'Facebook (html)', 'html', 2],
        ['facebook_zip', 'Facebook (zip)', 'zip', 2],
        ['google_portrait', 'Google (portrait)', 'zip', 5],
        ['unity', 'Unity', 'html', 5],
    ],
};
const sizeOf = (builder: Builder, channel: string, scale: number) => {
    const [id, label, format, cap] = NETWORKS[builder].find(([c]) => c === channel)!;
    const bytes = Math.round((format === 'html' ? 2.6 : 1.9) * MB * scale);
    const maxBytes = cap === null ? null : cap * MB;
    return { channel: id, label, format, bytes, maxBytes, withinLimit: maxBytes === null || bytes <= maxBytes, at: ago(2) };
};
const pnpEstimate = (scale: number): SizeEstimate => ({
    builder: 'pnp',
    at: ago(2),
    channels: ['AppLovin', 'Facebook', 'Google', 'IronSource', 'Liftoff', 'Mintegral', 'Unity'].map((channel) => sizeOf('pnp', channel, scale)),
});
let exportsList: ExportItem[] = [
    {
        file: 'C:/proj/build/cocos-playground-export/HexaSort_20261104-101500.zip',
        name: 'HexaSort_20261104-101500.zip',
        bytes: 3_456_789,
        createdAt: ago(3),
        fields: 7,
        issues: [{ level: 'warning', message: '2 nodes share the field key "Board.size@Canvas/Board" (same node path): the dashboard edits them as one.' }],
        estimates: { pnp: pnpEstimate(1) },
    },
    { file: 'C:/proj/build/cocos-playground-export/HexaSort_20261103-174210.zip', name: 'HexaSort_20261103-174210.zip', bytes: 3_401_222, createdAt: ago(60 * 20), fields: 0, issues: null, estimates: {} },
];
const playablesOf: Record<number, PlayableItem[]> = {
    11: [
        { id: 501, name: 'Hexa L5 - blue theme', updatedAt: ago(30), values: 6, fileValues: 1 },
        { id: 502, name: 'Hexa L5 - hard mode', updatedAt: ago(60 * 26), values: 3, fileValues: 0 },
    ],
};
const projectIssues: CheckReport = {
    at: ago(0),
    fields: 7,
    issues: [
        { level: 'error', message: '@playGroundField on Board.theme references unknown type "ThemeData", skipping.' },
        { level: 'warning', message: 'enum Difficulty.Insane: value is not a compile-time constant, skipping it.' },
    ],
};
let checkIssues = mode === 'check' || mode === 'interact';
let acceptedCheck = false;
let riskyUpload = mode === 'plan' || mode === 'interact';
const plan: UploadPlan = {
    conceptName: 'Hexa - Level 5 fail',
    replaces: true,
    playables: 2,
    ...diffManifests(
        [
            { key: 'Board.size@Canvas/Board', nodePath: 'Canvas/Board', scene: 'main.scene', componentType: 'Board', propertyKey: 'size', label: 'Board size', kind: 'number' },
            { key: 'Board.theme@Canvas/Board', nodePath: 'Canvas/Board', scene: 'main.scene', componentType: 'Board', propertyKey: 'theme', label: 'Theme', kind: 'enum', enumOptions: [{ label: 'Blue', value: 0 }, { label: 'Red', value: 1 }] },
            { key: 'Hud.title@Canvas/Hud', nodePath: 'Canvas/Hud', scene: 'main.scene', componentType: 'Hud', propertyKey: 'title', label: 'Title', kind: 'string' },
        ],
        [
            { key: 'Board.size@Canvas/Board', nodePath: 'Canvas/Board', scene: 'main.scene', componentType: 'Board', propertyKey: 'size', label: 'Board size', kind: 'string' },
            { key: 'Board.theme@Canvas/Board', nodePath: 'Canvas/Board', scene: 'main.scene', componentType: 'Board', propertyKey: 'theme', label: 'Theme', kind: 'enum', enumOptions: [{ label: 'Blue', value: 0 }] },
            { key: 'Hud.score@Canvas/Hud', nodePath: 'Canvas/Hud', scene: 'main.scene', componentType: 'Hud', propertyKey: 'score', label: 'Score', kind: 'number' },
        ],
        [
            { name: 'Hexa L5 - blue theme', values: { 'Board.size@Canvas/Board': 7, 'Hud.title@Canvas/Hud': 'Go!' } },
            { name: 'Hexa L5 - hard mode', values: { 'Board.theme': 1 } },
        ],
    ),
};

const state: PanelState = {
    serverUrl: DEFAULT,
    defaultServerUrl: DEFAULT,
    server: mode === 'down' ? { ok: false, error: 'connect ECONNREFUSED 168.138.171.60:443' } : { ok: true, authEnabled: true, features: ['estimate'] },
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
let builds = 0;

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
        state.server = { ok: true, authEnabled: true, features: ['estimate'] };
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
    async checkProject() {
        calls.push('checkProject');
        return checkIssues ? projectIssues : { at: ago(0), fields: 7, issues: [] };
    },
    async build(upload, force) {
        calls.push(`build ${upload}${force ? ' force' : ''}`);
        if (checkIssues && !force && !acceptedCheck) return { file: null, uploaded: false, check: projectIssues };
        if (force) acceptedCheck = true;
        for (const [label, progress] of [['Building', null], ['Packaging', null], ...(upload ? [['Uploading', 0.5]] : [])] as const) {
            state.busy = { label, message: 'web-mobile', progress };
            publish();
            await tick(40);
        }
        state.busy = null;
        builds++;
        const name = builds === 1 ? 'HexaSort_new.zip' : `HexaSort_new_${builds}.zip`;
        const item: ExportItem = { file: `C:/proj/build/cocos-playground-export/${name}`, name, bytes: 3_500_000, createdAt: ago(0), fields: 7, issues: [], estimates: {} };
        exportsList = [item, ...exportsList];
        publish();
        if (upload && riskyUpload) return { file: item.file, uploaded: false, plan } satisfies BuildResult;
        if (upload) markUploaded();
        publish();
        return { file: item.file, uploaded: upload } satisfies BuildResult;
    },
    async packageExisting(force) {
        calls.push(`packageExisting${force ? ' force' : ''}`);
        const item: ExportItem = { file: 'C:/proj/build/cocos-playground-export/HexaSort_pkg.zip', name: 'HexaSort_pkg.zip', bytes: 3_300_000, createdAt: ago(0), fields: 7, issues: [], estimates: {} };
        exportsList = [item, ...exportsList];
        return { file: item.file, uploaded: false };
    },
    async channels() {
        calls.push('channels');
        const of = (builder: Builder) => NETWORKS[builder].map(([channel, label, , cap]) => ({ channel, label, maxBytes: cap === null ? null : cap * MB }));
        return { pnp: of('pnp'), 'super-html': of('super-html') };
    },
    async estimate(file, builder, channel) {
        calls.push(`estimate ${builder} ${channel}`);
        if (!channel) throw new Error('Pick the ad network to estimate');
        const picked = [channel];
        state.busy = { label: 'Estimate size', message: `Packing for ${channel} (${builder}) on the server…`, progress: null };
        publish();
        await tick(60);
        state.busy = null;
        publish();
        const fresh = picked.map((channel) => ({ ...sizeOf(builder, channel, file.endsWith('101500.zip') ? 1 : 1.3), at: ago(0) }));
        const item = exportsList.find((e) => e.file === file)!;
        const before = item.estimates[builder]?.channels ?? [];
        const result: SizeEstimate = { builder, at: ago(0), channels: [...before.filter((c) => !picked.includes(c.channel)), ...fresh] };
        exportsList = exportsList.map((e) => (e.file === file ? { ...e, estimates: { ...e.estimates, [builder]: result } } : e));
        return result;
    },
    async playables(conceptId) {
        calls.push(`playables ${conceptId}`);
        await tick();
        return playablesOf[conceptId] ?? [];
    },
    async previewPlayable(id) {
        calls.push(`previewPlayable ${id}`);
        const skipped = playablesOf[11]?.find((p) => p.id === id)?.fileValues ?? 0;
        return { url: `http://localhost:7456/?pgvo=xyz`, skippedFiles: skipped };
    },
    async copyPlayableValues(id) {
        calls.push(`copyPlayableValues ${id}`);
        return playablesOf[11]?.find((p) => p.id === id)?.values ?? 0;
    },
    async uploadExport(file, force) {
        calls.push(`uploadExport ${file}${force ? ' force' : ''}`);
        if (riskyUpload && !force) return { file, uploaded: false, plan };
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
// Screenshot states: the check card, the upload confirmation, the open sizes table.
const clickWhenThere = (find: () => HTMLElement | null | undefined) => {
    const timer = setInterval(() => {
        const el = find();
        if (el) {
            clearInterval(timer);
            el.click();
        }
    }, 30);
};
const buttonText = (text: string) => Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) => b.textContent!.trim() === text);
if (mode === 'check') clickWhenThere(() => (document.querySelectorAll('.pg-playables .pg-row').length ? buttonText('Build & Upload') : null));
if (mode === 'plan') clickWhenThere(() => (document.querySelectorAll('.pg-playables .pg-row').length ? document.querySelector<HTMLElement>('.pg-export .pg-row-actions button') : null));
if (mode === 'sizes') {
    clickWhenThere(() => (document.querySelectorAll('.pg-playables .pg-row').length ? buttonText('Sizes') : null));
    const pick = setInterval(() => {
        const select = document.querySelector<HTMLSelectElement>('.pg-network');
        if (!select) return;
        clearInterval(pick);
        select.value = 'Facebook';
        select.dispatchEvent(new Event('change'));
    }, 30);
}

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
    check('exports listed', $$('.pg-export').length === 2, `${$$('.pg-export').length} rows`);
    check('field count shown', $$('.pg-export')[0]?.textContent!.includes('7 fields') ?? false);
    check('package issues badge', $$('.pg-export')[0]?.querySelector('.pg-badge.warn')?.textContent!.includes('1') ?? false);

    byText('button', 'Sign in with browser')!.click();
    check('pending code shown', await until(() => $('.pg-code')?.textContent === 'KQWX-7RTM'));
    check('signed in after approval', await until(() => !!$('#pg-app')));
    check('applications loaded', await until(() => $('#pg-app')!.textContent!.includes('Choose an application') && !$<HTMLButtonElement>('#pg-app')!.disabled));
    check('concept picker disabled before app', !!$<HTMLButtonElement>('#pg-concept')?.disabled);

    // Searchable application picker
    $('#pg-app')!.click();
    const search = () => $<HTMLInputElement>('.pg-picker-search');
    const items = () => $$('.pg-picker-pop .pg-picker-item');
    check('picker opens with search focused', await until(() => !!search() && document.activeElement === search() && items().length === apps.length), `${items().length} items`);
    check('long list scrolls', ($('.pg-picker-list')!.scrollHeight > $('.pg-picker-list')!.clientHeight));
    const type = async (text: string) => {
        search()!.value = text;
        search()!.dispatchEvent(new Event('input'));
        await tick();
    };
    await type('game 2');
    check('search filters', items().length === 12 && items().every((el) => /Puzzle Game \d*2\d*/.test(el.textContent!)), items().map((el) => el.textContent!.trim()).slice(0, 3).join(','));
    await type('2 PUZZLE game');
    check('search by words in any order, any case', items().length === 12, `${items().length}`);
    await type('khung long');
    check('search ignores accents', items().length === 1 && items()[0].textContent!.includes('Khủng Long Chạy'));
    await type('zzz');
    check('no match message', items().length === 0 && !!$('.pg-picker-none')?.textContent!.includes('No match'));
    search()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Esc closes', await until(() => !$('.pg-picker-pop')));
    $('#pg-app')!.click();
    await until(() => !!search());
    await type('hexa');
    search()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('Enter picks the match', await until(() => calls.includes('select 1 null') && $('#pg-app')!.textContent!.includes('Hexa Sort 3D')));
    $('#pg-app')!.click();
    await until(() => !!search());
    document.querySelector('.pg-hint, .pg-card-title')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    check('click outside closes', await until(() => !$('.pg-picker-pop')));

    $('#pg-concept')!.click();
    check('concepts listed + New concept action', await until(() => items().length === 3 && items()[2].textContent!.includes('+ New concept')), items().map((el) => el.textContent!.trim()).join(' | '));
    check('concept shows upload time', /today|ago/.test(items()[0].textContent!) && items()[1].textContent!.includes('no build'), items().map((el) => el.textContent!.trim()).join(' | '));
    await type('asmr');
    check('action stays while searching', items().length === 2 && items()[1].textContent!.includes('+ New concept'));
    await type('');
    items()[0].click();
    await until(() => calls.includes('select 1 11'));
    check('concept selected', await until(() => $('.pg-card')?.textContent!.includes('Last upload: ') ?? false));
    check('Build & Upload enabled', await until(() => !byText('button', 'Build & Upload')!.hasAttribute('disabled')));

    // Playables of the concept
    check('playables listed', await until(() => $$('.pg-playables .pg-row').length === 2), `${$$('.pg-playables .pg-row').length}`);
    check('playable shows its file values', $$('.pg-playables .pg-row')[0].textContent!.includes('6 values (1 file)'));
    byText('.pg-playables button', 'Preview')!.click();
    check('preview in Cocos', await until(() => $('.pg-status')!.textContent!.includes('Previewing "Hexa L5 - blue theme"') && $('.pg-status')!.textContent!.includes('1 file field')), $('.pg-status')!.textContent!.trim());
    ($$('.pg-playables .pg-row')[1].querySelector('button:nth-child(2)') as HTMLElement).click();
    check('copy values', await until(() => $('.pg-status')!.textContent!.includes('Copied 3 values of "Hexa L5 - hard mode"')));
    byText('.pg-playables button', 'Edit')!.click();
    check('edit on the dashboard', await until(() => calls.some((c) => c.endsWith('/applications/1/concepts/11/playables/501'))));

    // Project check on its own
    await until(() => !byText('button', 'Check project')!.hasAttribute('disabled'));
    byText('button', 'Check project')!.click();
    check('check report shown', await until(() => !!$('.pg-check') && $('.pg-check')!.textContent!.includes('Project check:') && $$('.pg-issues li').length === 2), $('.pg-check')?.textContent ?? '');
    check('check report counts', /1 error, 1 warning/.test($('.pg-check')!.textContent!.replace(/\s+/g, ' ')));
    byText('.pg-check button', 'Close')!.click();
    check('check report closes', await until(() => !$('.pg-check')));

    // Network sizes: one ad network at a time, from a dropdown
    const sizeLine = () => $$('.pg-export')[0].querySelector('.pg-size-line')?.textContent ?? '';
    check('size summary on the row', sizeLine().includes('pnp: 1 of 7 over the limit (Facebook)'), sizeLine());
    byText('.pg-export button', 'Sizes')!.click();
    const network = () => $<HTMLSelectElement>('.pg-network');
    const estimateButton = () => byText('.pg-sizes button', 'Estimate') as HTMLButtonElement | null;
    check('dropdown lists every network (+ placeholder)', await until(() => network()?.options.length === 12), `${network()?.options.length}`);
    check('dropdown is single choice', !!network() && !network()!.multiple);
    check('estimated networks listed with sizes', $$('.pg-table tr').length === 7 && $$('.pg-table tr.over').length === 1);
    check('no network chosen: Estimate disabled', !!estimateButton()?.disabled);
    check('options show cap and result', [...network()!.options].some((o) => o.textContent!.includes('Facebook (≤ 2.00 MB)') && o.textContent!.includes('✕')));
    choose(network()!, 'Moloco');
    check('network chosen: Estimate enabled', await until(() => !estimateButton()!.disabled && estimateButton()!.textContent!.trim() === 'Estimate'));
    estimateButton()!.click();
    check('only that network is packed', await until(() => calls.includes('estimate pnp Moloco')), calls.filter((c) => c.startsWith('estimate')).join(' | '));
    check('result merged with the earlier ones', await until(() => sizeLine().includes('1 of 8 over the limit') && $$('.pg-table tr').length === 8), sizeLine());
    check('result notice', $('.pg-status')!.textContent!.includes('Moloco (pnp): 2.60 MB, within the limit'), $('.pg-status')!.textContent!.trim());
    check('chosen row highlighted, button says again', !!$('.pg-table tr.chosen')?.textContent!.includes('Moloco') && estimateButton()!.textContent!.trim() === 'Estimate again');
    check('choice remembered', JSON.parse(localStorage.getItem('cocos-playground.sizes-network') ?? '{}').pnp === 'Moloco');
    check('no estimate-all control', !byText('.pg-sizes button', 'All') && !$('.pg-sizes input[type=checkbox]'));
    byText('.pg-seg button', 'super-html')!.click();
    check('super-html: nothing estimated yet', await until(() => !!$('.pg-sizes')?.textContent!.includes('No super-html network estimated yet') && network()?.options.length === 6));
    choose(network()!, 'facebook');
    await until(() => !estimateButton()!.disabled);
    estimateButton()!.click();
    check('super-html estimate', await until(() => calls.includes('estimate super-html facebook') && $$('.pg-export')[0].querySelectorAll('.pg-size-line').length === 2));
    check('single-network summary', [...$$('.pg-export')[0].querySelectorAll('.pg-size-line')].some((l) => l.textContent!.includes('super-html: 1 of 1 over the limit (Facebook (html))')));
    byText('.pg-export button', 'Sizes')!.click();
    check('sizes close', await until(() => !$('.pg-sizes')));

    $('#pg-concept')!.click();
    await until(() => !!$('.pg-picker-action'));
    $('.pg-picker-action')!.click();
    check('new concept input', await until(() => !!$('input[placeholder="New concept name"]')));
    const nameInput = $<HTMLInputElement>('input[placeholder="New concept name"]')!;
    nameInput.value = 'Hexa - Boss level';
    nameInput.dispatchEvent(new Event('input'));
    await tick();
    byText('button', 'Create')!.click();
    check('concept created and selected', await until(() => $('#pg-concept')?.textContent!.includes('Hexa - Boss level') ?? false));
    check('created notice', await until(() => $('.pg-status')!.textContent!.includes('created')));

    // Build & Upload: stops at the check, then at the field changes
    byText('button', 'Build & Upload')!.click();
    check('build stopped at the check', await until(() => !!$('.pg-check') && $('.pg-check')!.textContent!.includes('Build stopped')), $('.pg-check')?.textContent ?? '');
    check('nothing built yet', !calls.some((c) => c === 'build true force') && $$('.pg-export').length === 2);
    byText('.pg-check button', 'Build & Upload anyway')!.click();
    check('busy shown while building', await until(() => !!$('.pg-busy')));
    check('buttons disabled while busy', !!byText('button', 'Build')?.hasAttribute('disabled'));
    check('upload stopped at the field changes', await until(() => !!$('.pg-dialog')), $('.pg-status')!.textContent!.trim());
    const dialog = () => $('.pg-dialog')!.textContent!.replace(/\s+/g, ' ');
    check('dialog: removed field + who uses it', dialog().includes('Removed (1)') && dialog().includes('Title') && dialog().includes('Used by Hexa L5 - blue theme'), dialog());
    check('dialog: changed fields', dialog().includes('Changed (2)') && dialog().includes('number → string') && dialog().includes('enum options removed: Red'), dialog());
    check('dialog: class-key value counts', dialog().includes('Used by Hexa L5 - hard mode'), dialog());
    check('dialog: summary', dialog().includes('1 new') && dialog().includes('2 playables'), dialog());
    byText('.pg-dialog button', 'Cancel')!.click();
    check('cancel keeps the package, no upload', await until(() => !$('.pg-dialog')) && $$('.pg-export').length === 3 && !calls.some((c) => c.includes('force') && c.startsWith('uploadExport')));
    $$('.pg-export')[0].querySelector<HTMLElement>('button')!.click();
    check('upload asks again', await until(() => !!$('.pg-dialog')));
    byText('.pg-dialog button', 'Upload anyway')!.click();
    check('upload anyway', await until(() => $('.pg-status')!.textContent!.includes('uploaded to Hexa - Boss level')), $('.pg-status')!.textContent!.trim());
    check('last upload link', !!byText('.pg-status button', 'View upload'));

    byText('button', 'Build')!.click();
    check('accepted issues do not stop the next build', await until(() => $('.pg-status')!.textContent!.includes('Built HexaSort_new_2.zip')) && !$('.pg-check'), $('.pg-status')!.textContent!.trim());

    riskyUpload = false;
    failNextUpload = true;
    $$('.pg-export')[0].querySelector<HTMLElement>('button')!.click();
    check('upload error shown', await until(() => !!$('.pg-status .pg-error-text')), $('.pg-status')!.textContent!.trim());
    byText('.pg-status button', 'Dismiss')!.click();
    await tick();
    $$('.pg-export')[0].querySelector<HTMLElement>('button')!.click();
    check('upload ok', await until(() => $('.pg-status')!.textContent!.includes('uploaded to Hexa - Boss level')));

    const del = () => $$('.pg-export')[2].querySelectorAll('.pg-row-actions button')[3] as HTMLElement;
    del().click();
    check('delete asks', await until(() => del().textContent === 'Sure?'));
    del().click();
    check('deleted', await until(() => $$('.pg-export').length === 3));

    ($('[title="Show in folder"]') as HTMLElement).click();
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
