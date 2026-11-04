/**
 * Everything the panel needs from the editor's main process (connect/service.ts). The Vue app only
 * talks to this, so it also runs in a plain browser preview with a fake bridge (tests/preview).
 */
import type { ApplicationItem, BuildResult, ConceptItem, ExportItem, PanelState } from '../../shared';

export interface PlaygroundBridge {
    state(): Promise<PanelState>;
    refresh(): Promise<PanelState>;
    setServerUrl(url: string): Promise<PanelState>;
    signIn(): Promise<PanelState>;
    cancelSignIn(): Promise<PanelState>;
    signOut(): Promise<PanelState>;
    applications(): Promise<ApplicationItem[]>;
    concepts(applicationId: number): Promise<ConceptItem[]>;
    createConcept(applicationId: number, name: string): Promise<ConceptItem>;
    select(applicationId: number | null, conceptId: number | null): Promise<PanelState>;
    exports(): Promise<ExportItem[]>;
    deleteExport(file: string): Promise<void>;
    build(upload: boolean): Promise<BuildResult>;
    packageExisting(): Promise<BuildResult>;
    uploadExport(file: string): Promise<BuildResult>;
    openUrl(url: string): Promise<void>;
    reveal(file: string): Promise<void>;
    /** The main process's state broadcasts; returns the unsubscribe. */
    onState(listener: (state: PanelState) => void): () => void;
}
