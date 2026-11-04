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
}

export interface PanelState {
    serverUrl: string;
    defaultServerUrl: string;
    /** null while unchecked. */
    server: { ok: true; authEnabled: boolean } | { ok: false; error: string } | null;
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
    file: string;
    uploaded: boolean;
}
