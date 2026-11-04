/**
 * Vue app of the Cocos Playground panel: sign in to the dashboard, pick the application and concept
 * this project uploads to, check / build / package / upload, network sizes, and the concept's
 * playables. Free of Node / Editor APIs (those come through the PlaygroundBridge), so it also runs in
 * a plain browser preview.
 */
import { computed, createApp, defineComponent, reactive } from 'vue';
import type { ApplicationItem, Builder, BuildResult, ChannelOption, CheckReport, ConceptItem, ExportItem, PanelState, PlayableItem, SizeEstimate, UploadPlan } from '../../shared';
import type { PlaygroundBridge } from './bridge';

export interface PlaygroundApp {
    destroy(): void;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatWhen(iso: string | null): string {
    if (!iso) return '—';
    const date = new Date(iso);
    const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 24 * 60 && date.getDate() === new Date().getDate()) return `today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const fileName = (file: string | null) => (file ? (file.split(/[\\/]/).pop() ?? file) : '');

/** One line for the networks estimated so far: "pnp: 3 networks within limits" / "pnp: 1 of 3 over the limit (Facebook)". */
export function estimateSummary(estimate: SizeEstimate | undefined): { text: string; ok: boolean } | null {
    if (!estimate || estimate.channels.length === 0) return null;
    const count = estimate.channels.length;
    const over = estimate.channels.filter((channel) => !channel.withinLimit);
    if (over.length === 0) return { text: `${estimate.builder}: ${count === 1 ? estimate.channels[0].label + ' is' : count + ' networks'} within limits`, ok: true };
    return { text: `${estimate.builder}: ${over.length} of ${count} over the limit (${over.map((channel) => channel.label).join(', ')})`, ok: false };
}

const NETWORK_KEY = 'cocos-playground.sizes-network';

/** The network last chosen per builder (a per-viewer convenience: missing storage just means none). */
function loadNetworks(): Record<Builder, string> {
    try {
        const saved = JSON.parse(localStorage.getItem(NETWORK_KEY) ?? 'null');
        if (saved && typeof saved.pnp === 'string' && typeof saved['super-html'] === 'string') return saved;
    } catch {
        // no storage
    }
    return { pnp: '', 'super-html': '' };
}

function saveNetworks(networks: Record<Builder, string>): void {
    try {
        localStorage.setItem(NETWORK_KEY, JSON.stringify(networks));
    } catch {
        // no storage
    }
}

/** What the searchable picker lists. */
interface PickerItem {
    id: number;
    name: string;
    hint?: string;
}

/** Lower-case, accents dropped, so "khung" finds "Khủng long" too. */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/**
 * `<pg-picker>`: a select with a search box, for long application / concept lists. Emits `pick`
 * with the item's id, or `action` for the extra entry at the bottom (+ New concept…).
 */
const Picker = defineComponent({
    props: {
        items: { type: Array as () => PickerItem[], required: true },
        value: { type: Number as unknown as () => number | null, default: null },
        placeholder: { type: String, default: 'Choose…' },
        empty: { type: String, default: 'Nothing here' },
        disabled: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        action: { type: String, default: '' },
        inputId: { type: String, default: '' },
    },
    emits: ['pick', 'action'],
    setup(props, { emit }) {
        const state = reactive({ open: false, query: '', active: 0 });
        let root: HTMLElement | null = null;
        const selected = computed(() => props.items.find((item) => item.id === props.value) ?? null);
        const shown = computed(() => {
            // Every word typed, in any order: "puzzle 1" finds "Puzzle Game 12".
            const words = fold(state.query).split(/\s+/).filter(Boolean);
            if (!words.length) return props.items;
            return props.items.filter((item) => {
                const text = fold(`${item.name} ${item.hint ?? ''}`);
                return words.every((word) => text.includes(word));
            });
        });
        /** Rows: the matches, then the action (always there, so a new concept is one click away). */
        const rows = computed(() => shown.value.length + (props.action ? 1 : 0));

        const outside = (event: Event) => {
            if (root && !event.composedPath().includes(root)) close();
        };
        function open() {
            if (props.disabled || props.loading) return;
            state.open = true;
            state.query = '';
            const index = shown.value.findIndex((item) => item.id === props.value);
            state.active = Math.max(0, index);
            document.addEventListener('mousedown', outside, true);
            setTimeout(() => {
                (root?.querySelector('.pg-picker-search') as HTMLInputElement | null)?.focus();
                scrollToActive();
            });
        }
        function close() {
            state.open = false;
            document.removeEventListener('mousedown', outside, true);
        }
        function choose(index: number) {
            if (index < shown.value.length) emit('pick', shown.value[index].id);
            else if (props.action) emit('action');
            close();
            (root?.querySelector('.pg-picker-button') as HTMLElement | null)?.focus();
        }
        function scrollToActive() {
            (root?.querySelector(`[data-row="${state.active}"]`) as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
        }
        function key(event: KeyboardEvent) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!rows.value) return;
                state.active = (state.active + (event.key === 'ArrowDown' ? 1 : rows.value - 1)) % rows.value;
                setTimeout(scrollToActive);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (rows.value) choose(Math.min(state.active, rows.value - 1));
            } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
                (root?.querySelector('.pg-picker-button') as HTMLElement | null)?.focus();
            }
        }
        const typed = () => (state.active = 0);
        const setRoot = (el: unknown) => (root = el as HTMLElement | null);
        return { state, selected, shown, rows, open, close, choose, key, typed, setRoot, toggle: () => (state.open ? close() : open()) };
    },
    beforeUnmount() {
        (this as unknown as { close(): void }).close();
    },
    template: `
<div class="pg-picker" :ref="setRoot">
    <button type="button" class="pg-picker-button pg-select" :id="inputId || undefined" :disabled="disabled || loading" @click="toggle()" @keydown.down.prevent="open()">
        <span :class="['pg-ellipsis', { 'pg-dim': !selected }]">{{ loading ? 'Loading…' : selected ? selected.name : (items.length ? placeholder : empty) }}</span>
        <span class="pg-picker-caret">&#x25BE;</span>
    </button>
    <div v-if="state.open" class="pg-picker-pop">
        <input class="pg-input pg-picker-search" v-model="state.query" :placeholder="'Search ' + items.length + '…'" spellcheck="false" @input="typed()" @keydown="key($event)">
        <div class="pg-picker-list">
            <div v-for="(item, i) in shown" :key="item.id" :data-row="i" :class="['pg-picker-item', { active: i === state.active, selected: item.id === value }]" @mousemove="state.active = i" @click="choose(i)">
                <span class="pg-ellipsis">{{ item.name }}</span>
                <span v-if="item.hint" class="pg-dim pg-picker-hint">{{ item.hint }}</span>
            </div>
            <div v-if="!shown.length" class="pg-picker-none pg-dim">No match for "{{ state.query }}"</div>
            <div v-if="action" :data-row="shown.length" :class="['pg-picker-item', 'pg-picker-action', { active: state.active === shown.length }]" @mousemove="state.active = shown.length" @click="choose(shown.length)">{{ action }}</div>
        </div>
    </div>
</div>`,
});

type Stopped ={ kind: 'build'; upload: boolean } | { kind: 'package' } | { kind: 'check' };

export function createPlaygroundApp(el: HTMLElement, bridge: PlaygroundBridge, template: string): PlaygroundApp {
    const ui = reactive({
        panel: null as PanelState | null,
        view: 'main' as 'main' | 'settings',
        serverInput: '',
        applications: [] as ApplicationItem[],
        concepts: [] as ConceptItem[],
        exports: [] as ExportItem[],
        playables: [] as PlayableItem[],
        playablesOpen: true,
        playableFilter: '',
        loadingApps: false,
        loadingConcepts: false,
        loadingPlayables: false,
        creating: false,
        newConceptName: '',
        confirmDelete: '' as string,
        /** The project check on show, and what it stopped (if anything). */
        check: null as { report: CheckReport; stopped: Stopped } | null,
        /** An upload waiting for confirmation: what it would change. */
        plan: null as { plan: UploadPlan; file: string } | null,
        /** The export row whose network sizes are open, and the builder shown there. */
        sizesOpen: '' as string,
        sizesBuilder: 'pnp' as Builder,
        /** Networks per builder (from the server), and the one chosen per builder (one estimate = one network). */
        channelOptions: null as Record<Builder, ChannelOption[]> | null,
        channelsError: '',
        network: loadNetworks(),
        error: '',
        notice: '',
        working: false,
    });

    const signedIn = computed(() => !!ui.panel?.account);
    const authOff = computed(() => ui.panel?.server?.ok === true && !ui.panel.server.authEnabled);
    const selectedApp = computed(() => ui.applications.find((app) => app.id === ui.panel?.selection.applicationId) ?? null);
    const selectedConcept = computed(() => ui.concepts.find((concept) => concept.id === ui.panel?.selection.conceptId) ?? null);
    const busy = computed(() => !!ui.panel?.busy || ui.working);
    const canUpload = computed(() => signedIn.value && !!selectedConcept.value && !busy.value);
    const host = computed(() => ui.panel?.serverUrl.replace(/^https?:\/\//, '') ?? '');
    const shownPlayables = computed(() => {
        const filter = ui.playableFilter.trim().toLowerCase();
        return filter ? ui.playables.filter((playable) => playable.name.toLowerCase().includes(filter)) : ui.playables;
    });
    const appItems = computed<PickerItem[]>(() => ui.applications.map((app) => ({ id: app.id, name: app.name })));
    const conceptItems = computed<PickerItem[]>(() =>
        ui.concepts.map((concept) => ({ id: concept.id, name: concept.name, hint: concept.buildUploadedAt ? formatWhen(concept.buildUploadedAt) : 'no build' })),
    );
    const checkErrors = computed(() => ui.check?.report.issues.filter((issue) => issue.level === 'error').length ?? 0);

    function fail(error: unknown) {
        ui.error = error instanceof Error ? error.message : String(error);
        ui.notice = '';
    }

    function setPanel(state: PanelState) {
        const wasSignedIn = !!ui.panel?.account;
        const serverChanged = ui.panel && ui.panel.serverUrl !== state.serverUrl;
        ui.panel = state;
        if (!ui.serverInput || serverChanged) ui.serverInput = state.serverUrl;
        if (state.account && (!wasSignedIn || serverChanged)) void loadApplications();
        if (!state.account) {
            ui.applications = [];
            ui.concepts = [];
            ui.playables = [];
        }
    }

    async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
        ui.error = '';
        ui.working = true;
        try {
            return await work();
        } catch (error) {
            fail(error);
            return undefined;
        } finally {
            ui.working = false;
        }
    }

    async function loadApplications() {
        ui.loadingApps = true;
        try {
            ui.applications = await bridge.applications();
            const appId = ui.panel?.selection.applicationId;
            if (appId && ui.applications.some((app) => app.id === appId)) await loadConcepts(appId);
            else ui.concepts = [];
        } catch (error) {
            fail(error);
        } finally {
            ui.loadingApps = false;
        }
    }

    async function loadConcepts(applicationId: number) {
        ui.loadingConcepts = true;
        try {
            ui.concepts = await bridge.concepts(applicationId);
        } catch (error) {
            fail(error);
        } finally {
            ui.loadingConcepts = false;
        }
        await loadPlayables();
    }

    async function loadPlayables() {
        const conceptId = ui.panel?.selection.conceptId;
        if (!conceptId || !ui.concepts.some((concept) => concept.id === conceptId)) {
            ui.playables = [];
            return;
        }
        ui.loadingPlayables = true;
        try {
            ui.playables = await bridge.playables(conceptId);
        } catch (error) {
            fail(error);
        } finally {
            ui.loadingPlayables = false;
        }
    }

    async function loadExports() {
        try {
            ui.exports = await bridge.exports();
        } catch (error) {
            fail(error);
        }
    }

    /** After Build / Package / Upload: stopped at the check, stopped at the field changes, or done. */
    async function settle(result: BuildResult | undefined, stopped: Stopped, done: (result: BuildResult) => string) {
        await loadExports();
        if (!result) return;
        if (result.check) {
            ui.check = { report: result.check, stopped };
            ui.notice = '';
            return;
        }
        ui.check = null;
        if (result.plan && result.file) {
            ui.plan = { plan: result.plan, file: result.file };
            ui.notice = result.file ? `Packaged ${fileName(result.file)}; waiting for your OK to upload` : '';
            return;
        }
        ui.notice = done(result);
        if (result.uploaded && ui.panel?.selection.applicationId) await loadConcepts(ui.panel.selection.applicationId);
    }

    const Root = defineComponent({
        template,
        setup() {
            const actions = {
                async refresh() {
                    const state = await run(() => bridge.refresh());
                    if (state) setPanel(state);
                    if (state?.account) await loadApplications();
                    await loadExports();
                },
                async saveServer() {
                    const state = await run(() => bridge.setServerUrl(ui.serverInput));
                    if (state) {
                        setPanel(state);
                        if (state.server?.ok) ui.notice = `Using ${state.serverUrl}`;
                    }
                },
                resetServer() {
                    ui.serverInput = ui.panel?.defaultServerUrl ?? '';
                    return actions.saveServer();
                },
                async signIn() {
                    ui.error = '';
                    try {
                        const state = await bridge.signIn();
                        setPanel(state);
                        if (state.account) ui.notice = `Signed in as ${state.account.email}`;
                    } catch (error) {
                        fail(error);
                    }
                },
                async cancelSignIn() {
                    setPanel(await bridge.cancelSignIn());
                },
                async signOut() {
                    const state = await run(() => bridge.signOut());
                    if (state) setPanel(state);
                },
                async pickApplication(id: number | null) {
                    if (id === ui.panel?.selection.applicationId) return;
                    ui.concepts = [];
                    ui.playables = [];
                    ui.creating = false;
                    const state = await run(() => bridge.select(id, null));
                    if (state) setPanel(state);
                    if (id) await loadConcepts(id);
                },
                startNewConcept() {
                    ui.creating = true;
                    ui.newConceptName = '';
                },
                async pickConcept(id: number | null) {
                    if (id === ui.panel?.selection.conceptId) return;
                    const state = await run(() => bridge.select(ui.panel?.selection.applicationId ?? null, id));
                    if (state) setPanel(state);
                    ui.playableFilter = '';
                    await loadPlayables();
                },
                async createConcept() {
                    const appId = ui.panel?.selection.applicationId;
                    if (!appId) return;
                    const concept = await run(() => bridge.createConcept(appId, ui.newConceptName));
                    if (!concept) return;
                    ui.creating = false;
                    setPanel(await bridge.state());
                    await loadConcepts(appId);
                    ui.notice = `Concept "${concept.name}" created`;
                },

                /* ---- check / build / package / upload ---- */
                async checkProject() {
                    const report = await run(() => bridge.checkProject());
                    if (!report) return;
                    ui.check = { report, stopped: { kind: 'check' } };
                    ui.notice = report.issues.length ? '' : `Project check passed: ${report.fields} field${report.fields === 1 ? '' : 's'}, no issues`;
                    if (!report.issues.length) ui.check = null;
                },
                async build(upload: boolean, force = false) {
                    ui.notice = '';
                    ui.plan = null;
                    const result = await run(() => bridge.build(upload, force));
                    await settle(result, { kind: 'build', upload }, (done) =>
                        done.uploaded ? `Built and uploaded to ${selectedConcept.value?.name ?? 'the concept'}` : `Built ${fileName(done.file)}`,
                    );
                },
                async packageExisting(force = false) {
                    ui.notice = '';
                    const result = await run(() => bridge.packageExisting(force));
                    await settle(result, { kind: 'package' }, (done) => `Packaged ${fileName(done.file)}`);
                },
                /** "Build anyway" / "Package anyway" from the check card. */
                goOnAnyway() {
                    const stopped = ui.check?.stopped;
                    ui.check = null;
                    if (stopped?.kind === 'build') return actions.build(stopped.upload, true);
                    if (stopped?.kind === 'package') return actions.packageExisting(true);
                },
                async upload(item: ExportItem | { file: string; name: string }, force = false) {
                    ui.notice = '';
                    ui.plan = null;
                    const result = await run(() => bridge.uploadExport(item.file, force));
                    await settle(result, { kind: 'check' }, () => `${item.name} uploaded to ${selectedConcept.value?.name ?? 'the concept'}`);
                },
                uploadAnyway() {
                    const pending = ui.plan;
                    ui.plan = null;
                    if (pending) return actions.upload({ file: pending.file, name: fileName(pending.file) }, true);
                },
                async remove(item: ExportItem) {
                    if (ui.confirmDelete !== item.file) {
                        ui.confirmDelete = item.file;
                        return;
                    }
                    ui.confirmDelete = '';
                    await run(() => bridge.deleteExport(item.file));
                    await loadExports();
                },
                reveal: (item: ExportItem) => run(() => bridge.reveal(item.file)),

                /* ---- network sizes: choose one ad network, estimate it ---- */
                async toggleSizes(item: ExportItem) {
                    ui.sizesOpen = ui.sizesOpen === item.file ? '' : item.file;
                    if (!ui.sizesOpen) return;
                    if (!item.estimates[ui.sizesBuilder] && item.estimates[ui.sizesBuilder === 'pnp' ? 'super-html' : 'pnp']) {
                        ui.sizesBuilder = ui.sizesBuilder === 'pnp' ? 'super-html' : 'pnp';
                    }
                    if (!ui.channelOptions) {
                        ui.channelsError = '';
                        try {
                            ui.channelOptions = await bridge.channels();
                        } catch (error) {
                            ui.channelsError = error instanceof Error ? error.message : String(error);
                        }
                    }
                },
                channelsFor: (builder: Builder) => ui.channelOptions?.[builder] ?? [],
                /** The chosen network, if this server has it (it may be remembered from another server). */
                chosenNetwork: (builder: Builder) => (actions.channelsFor(builder).some((option) => option.channel === ui.network[builder]) ? ui.network[builder] : ''),
                chooseNetwork(event: Event) {
                    ui.network[ui.sizesBuilder] = (event.target as HTMLSelectElement).value;
                    saveNetworks(ui.network);
                },
                /** Estimated networks of the shown builder, in the server's network order. */
                resultsOf(item: ExportItem) {
                    const results = item.estimates[ui.sizesBuilder]?.channels ?? [];
                    const order = actions.channelsFor(ui.sizesBuilder).map((option) => option.channel);
                    return [...results].sort((a, b) => (order.indexOf(a.channel) + 1 || 999) - (order.indexOf(b.channel) + 1 || 999));
                },
                resultOf: (item: ExportItem, channel: string) => item.estimates[ui.sizesBuilder]?.channels.find((result) => result.channel === channel) ?? null,
                async estimate(item: ExportItem) {
                    ui.notice = '';
                    const builder = ui.sizesBuilder;
                    const channel = actions.chosenNetwork(builder);
                    if (!channel) return;
                    const result = await run(() => bridge.estimate(item.file, builder, channel));
                    await loadExports();
                    const size = result?.channels.find((entry) => entry.channel === channel);
                    if (size) {
                        ui.notice = `${item.name} — ${size.label} (${builder}): ${formatBytes(size.bytes)}${size.maxBytes ? ` of ${formatBytes(size.maxBytes)}` : ''}${size.withinLimit ? ', within the limit' : ', OVER the limit'}`;
                    }
                },

                /* ---- playables ---- */
                refreshPlayables: () => loadPlayables(),
                async previewPlayable(playable: PlayableItem) {
                    const result = await run(() => bridge.previewPlayable(playable.id));
                    if (result) {
                        ui.notice = `Previewing "${playable.name}" in the browser${result.skippedFiles ? ` (${result.skippedFiles} file field${result.skippedFiles === 1 ? '' : 's'} keep the scene's own asset)` : ''}`;
                    }
                },
                async copyValues(playable: PlayableItem) {
                    const count = await run(() => bridge.copyPlayableValues(playable.id));
                    if (count !== undefined) ui.notice = `Copied ${count} value${count === 1 ? '' : 's'} of "${playable.name}" as JSON`;
                },
                editPlayable(playable: PlayableItem) {
                    const panel = ui.panel;
                    if (!panel) return;
                    const { applicationId, conceptId } = panel.selection;
                    return actions.open(`${panel.serverUrl}/applications/${applicationId}/concepts/${conceptId}/playables/${playable.id}`);
                },

                open: (url: string) => run(() => bridge.openUrl(url)),
                openDashboard() {
                    const panel = ui.panel;
                    if (!panel) return;
                    const { applicationId, conceptId } = panel.selection;
                    const url = applicationId && conceptId ? `${panel.serverUrl}/applications/${applicationId}/concepts/${conceptId}` : applicationId ? `${panel.serverUrl}/applications/${applicationId}` : panel.serverUrl;
                    return actions.open(url);
                },
            };
            return {
                ui,
                host,
                signedIn,
                authOff,
                selectedApp,
                selectedConcept,
                busy,
                canUpload,
                shownPlayables,
                appItems,
                conceptItems,
                checkErrors,
                formatBytes,
                formatWhen,
                estimateSummary,
                ...actions,
            };
        },
    });

    const app = createApp(Root);
    app.component('pg-picker', Picker);
    app.mount(el);
    const unsubscribe = bridge.onState(setPanel);
    void (async () => {
        try {
            setPanel(await bridge.state());
            const state = await bridge.refresh();
            setPanel(state);
        } catch (error) {
            fail(error);
        }
        await loadExports();
    })();

    return {
        destroy() {
            unsubscribe();
            app.unmount();
        },
    };
}
