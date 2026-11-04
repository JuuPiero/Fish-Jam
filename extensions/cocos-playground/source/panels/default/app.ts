/**
 * Vue app of the Cocos Playground panel: sign in to the dashboard, pick the application and concept
 * this project uploads to, build / package / upload. Free of Node / Editor APIs (those come through
 * the PlaygroundBridge), so it also runs in a plain browser preview.
 */
import { computed, createApp, defineComponent, reactive } from 'vue';
import type { ApplicationItem, ConceptItem, ExportItem, PanelState } from '../../shared';
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

export function createPlaygroundApp(el: HTMLElement, bridge: PlaygroundBridge, template: string): PlaygroundApp {
    const ui = reactive({
        panel: null as PanelState | null,
        view: 'main' as 'main' | 'settings',
        serverInput: '',
        applications: [] as ApplicationItem[],
        concepts: [] as ConceptItem[],
        exports: [] as ExportItem[],
        loadingApps: false,
        loadingConcepts: false,
        creating: false,
        newConceptName: '',
        confirmDelete: '' as string,
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
    }

    async function loadExports() {
        try {
            ui.exports = await bridge.exports();
        } catch (error) {
            fail(error);
        }
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
                async pickApplication(event: Event) {
                    const id = Number((event.target as HTMLSelectElement).value) || null;
                    ui.concepts = [];
                    ui.creating = false;
                    const state = await run(() => bridge.select(id, null));
                    if (state) setPanel(state);
                    if (id) await loadConcepts(id);
                },
                async pickConcept(event: Event) {
                    const value = (event.target as HTMLSelectElement).value;
                    if (value === '__new') {
                        ui.creating = true;
                        ui.newConceptName = '';
                        (event.target as HTMLSelectElement).value = String(ui.panel?.selection.conceptId ?? '');
                        return;
                    }
                    const state = await run(() => bridge.select(ui.panel?.selection.applicationId ?? null, Number(value) || null));
                    if (state) setPanel(state);
                },
                async createConcept() {
                    const appId = ui.panel?.selection.applicationId;
                    if (!appId) return;
                    const concept = await run(() => bridge.createConcept(appId, ui.newConceptName));
                    if (!concept) return;
                    ui.creating = false;
                    await loadConcepts(appId);
                    setPanel(await bridge.state());
                    ui.notice = `Concept "${concept.name}" created`;
                },
                async build(upload: boolean) {
                    ui.notice = '';
                    const result = await run(() => bridge.build(upload));
                    await loadExports();
                    if (!result) return;
                    ui.notice = result.uploaded ? `Built and uploaded to ${selectedConcept.value?.name ?? 'the concept'}` : `Built ${result.file.split(/[\\/]/).pop()}`;
                    if (result.uploaded && ui.panel?.selection.applicationId) await loadConcepts(ui.panel.selection.applicationId);
                },
                async packageExisting() {
                    ui.notice = '';
                    const result = await run(() => bridge.packageExisting());
                    await loadExports();
                    if (result) ui.notice = `Packaged ${result.file.split(/[\\/]/).pop()}`;
                },
                async upload(item: ExportItem) {
                    ui.notice = '';
                    const result = await run(() => bridge.uploadExport(item.file));
                    if (!result) return;
                    ui.notice = `${item.name} uploaded to ${selectedConcept.value?.name ?? 'the concept'}`;
                    if (ui.panel?.selection.applicationId) await loadConcepts(ui.panel.selection.applicationId);
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
                open: (url: string) => run(() => bridge.openUrl(url)),
                openDashboard() {
                    const panel = ui.panel;
                    if (!panel) return;
                    const { applicationId, conceptId } = panel.selection;
                    const url = applicationId && conceptId ? `${panel.serverUrl}/applications/${applicationId}/concepts/${conceptId}` : applicationId ? `${panel.serverUrl}/applications/${applicationId}` : panel.serverUrl;
                    return actions.open(url);
                },
            };
            return { ui, host, signedIn, authOff, selectedApp, selectedConcept, busy, canUpload, formatBytes, formatWhen, ...actions };
        },
    });

    const app = createApp(Root);
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
