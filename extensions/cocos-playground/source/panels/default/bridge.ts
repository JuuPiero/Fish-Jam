/**
 * Everything the panel needs from the editor's main process (connect/service.ts). The Vue app only
 * talks to this, so it also runs in a plain browser preview with a fake bridge (tests/preview).
 */
import type { ApplicationItem, Builder, BuildResult, ChannelOption, CheckReport, ConceptItem, ExportItem, PanelState, PlayableItem, PreviewResult, SizeEstimate } from '../../shared';

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
    checkProject(): Promise<CheckReport>;
    /** `force`: go on past the project check's issues. */
    build(upload: boolean, force?: boolean): Promise<BuildResult>;
    packageExisting(force?: boolean): Promise<BuildResult>;
    /** `force`: upload even though fields go away / change. */
    uploadExport(file: string, force?: boolean): Promise<BuildResult>;
    /** The networks each builder packs for. */
    channels(): Promise<Record<Builder, ChannelOption[]>>;
    /** One network's size (merged with the ones estimated before). */
    estimate(file: string, builder: Builder, channel: string): Promise<SizeEstimate>;
    playables(conceptId: number): Promise<PlayableItem[]>;
    previewPlayable(playableId: number): Promise<PreviewResult>;
    /** Resolves with how many values were copied. */
    copyPlayableValues(playableId: number): Promise<number>;
    openUrl(url: string): Promise<void>;
    reveal(file: string): Promise<void>;
    /** The main process's state broadcasts; returns the unsubscribe. */
    onState(listener: (state: PanelState) => void): () => void;
}
