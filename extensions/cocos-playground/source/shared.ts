/** What the main process and the panel exchange (no Node / Editor APIs here). */

export const PACKAGE = 'cocos-playground';
/** Broadcast with the new PanelState whenever it changes. */
export const STATE_MESSAGE = 'cocos-playground:state';

export interface ApplicationItem {
    id: number;
    name: string;
    iconUrl: string | null;
}

export interface ConceptItem {
    id: number;
    name: string;
    /** When its build was last uploaded (null: none yet). */
    buildUploadedAt: string | null;
}

export interface ExportItem {
    file: string;
    name: string;
    bytes: number;
    createdAt: string;
    fields: number | null;
    /** The project check made when it was packaged (null: packaged before checks existed). */
    issues: CheckIssue[] | null;
    /** Network sizes, per builder, once estimated. */
    estimates: Partial<Record<Builder, SizeEstimate>>;
}

/* ---- Project check (before building / packaging) ---- */

export interface CheckIssue {
    /** `error`: the dashboard will miss or mangle fields. `warning`: worth a look. */
    level: 'error' | 'warning';
    message: string;
}

export interface CheckReport {
    at: string;
    /** `@playGroundField` placements found. */
    fields: number;
    issues: CheckIssue[];
}

/* ---- Network sizes ---- */

export type Builder = 'pnp' | 'super-html';

/** A network the dashboard can pack for, with its documented size cap. */
export interface ChannelOption {
    channel: string;
    label: string;
    maxBytes: number | null;
}

export interface ChannelSize extends ChannelOption {
    format: 'html' | 'zip';
    bytes: number;
    withinLimit: boolean;
    /** When this network was estimated (networks are estimated a few at a time). */
    at: string;
}

/** Every network estimated so far for one builder (the latest result of each). */
export interface SizeEstimate {
    builder: Builder;
    /** The latest estimate. */
    at: string;
    channels: ChannelSize[];
}

/* ---- What an upload would change on the concept ---- */

export interface FieldChange {
    key: string;
    label: string;
    /** Where it sits: `<scene or prefab> › <node path>`. */
    where: string;
    /** For a changed field: what changed (`number → string`, `list → single`, `enum options removed: A, B`). */
    change?: string;
    /** Playables with a value saved for it. */
    playables: string[];
}

export interface UploadPlan {
    conceptName: string;
    /** The concept already has a build (the upload replaces it). */
    replaces: boolean;
    playables: number;
    removed: FieldChange[];
    changed: FieldChange[];
    added: number;
    kept: number;
}

/* ---- Playables of the selected concept ---- */

export interface PlayableItem {
    id: number;
    name: string;
    updatedAt: string;
    /** Saved field values. */
    values: number;
    /** Of those, values that are files uploaded to the dashboard (not available in the Cocos preview). */
    fileValues: number;
}

export interface PreviewResult {
    url: string;
    skippedFiles: number;
}

export interface PanelState {
    serverUrl: string;
    defaultServerUrl: string;
    /** null while unchecked. */
    server: { ok: true; authEnabled: boolean; features: string[] } | { ok: false; error: string } | null;
    /** Signed in (or sign-in is off on the server: `email` null). */
    account: { email: string | null; expiresAt: string | null } | null;
    /** A sign-in waiting for approval in the browser. */
    signIn: { userCode: string; verificationUri: string } | null;
    selection: { applicationId: number | null; conceptId: number | null };
    /** A build / package / upload in progress. */
    busy: { label: string; message: string; progress: number | null } | null;
    /** The last finished upload, for its "Open in dashboard" link. */
    lastUpload: { conceptName: string; url: string; at: string } | null;
}

export interface BuildResult {
    /** The package (null when the check stopped the build before there was one). */
    file: string | null;
    uploaded: boolean;
    /** Set when the build stopped at the project check: confirm with `force` to go on. */
    check?: CheckReport;
    /** Set when the upload stopped because it would drop or change fields playables use: confirm with `force`. */
    plan?: UploadPlan;
}
