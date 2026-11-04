/** PlaygroundBridge backed by the extension's main process (Editor.Message), and its state broadcasts. */
import { PACKAGE, type PanelState } from '../../shared';
import type { PlaygroundBridge } from './bridge';

type Reply<T> = { ok: true; value: T } | { ok: false; error: string };

async function call<T>(message: string, ...args: unknown[]): Promise<T> {
    const reply = (await (Editor.Message.request as any)(PACKAGE, message, ...args)) as Reply<T> | undefined;
    if (!reply) throw new Error(`no answer to "${message}"`);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
}

const stateListeners = new Set<(state: PanelState) => void>();

/** Called by the panel's `onState` method (the "cocos-playground:state" broadcast). */
export function emitState(state: PanelState): void {
    stateListeners.forEach((listener) => listener(state));
}

export const editorBridge: PlaygroundBridge = {
    state: () => call('panel-state'),
    refresh: () => call('panel-refresh'),
    setServerUrl: (url) => call('set-server-url', url),
    signIn: () => call('sign-in'),
    cancelSignIn: () => call('cancel-sign-in'),
    signOut: () => call('sign-out'),
    applications: () => call('list-applications'),
    concepts: (applicationId) => call('list-concepts', applicationId),
    createConcept: (applicationId, name) => call('create-concept', applicationId, name),
    select: (applicationId, conceptId) => call('select', applicationId, conceptId),
    exports: () => call('list-exports'),
    deleteExport: (file) => call('delete-export', file),
    checkProject: () => call('check-project'),
    build: (upload, force) => call('build', upload, !!force),
    packageExisting: (force) => call('package-existing', !!force),
    uploadExport: (file, force) => call('upload-export', file, !!force),
    channels: () => call('list-channels'),
    estimate: (file, builder, channel) => call('estimate', file, builder, channel),
    playables: (conceptId) => call('list-playables', conceptId),
    previewPlayable: (playableId) => call('preview-playable', playableId),
    copyPlayableValues: (playableId) => call('copy-playable-values', playableId),
    openUrl: (url) => call('open-url', url),
    reveal: (file) => call('reveal', file),
    onState(listener) {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
    },
};
