import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/*
 * Where the extension keeps its settings:
 * - per user, in ~/.cocos-playground/config.json (never inside a project, so never committed): the
 *   server URL and, per server, the access token from Sign in;
 * - per project, in <project>/local/cocos-playground.json (Cocos keeps local/ out of git): the
 *   application and concept picked for this project, per server.
 */

export const DEFAULT_SERVER_URL = 'https://playground.168-138-171-60.sslip.io';

export interface Account {
    token: string;
    email: string;
    expiresAt: string | null;
}

interface UserConfig {
    serverUrl?: string;
    accounts?: Record<string, Account>;
}

export interface Selection {
    applicationId: number | null;
    conceptId: number | null;
}

const userFile = () => path.join(os.homedir(), '.cocos-playground', 'config.json');

function readJson<T>(file: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
        return fallback;
    }
}

function writeJson(file: string, value: unknown, secret = false): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), secret ? { mode: 0o600 } : undefined);
}

/** `https://host[:port]` — only the origin of what was typed; throws for anything that isn't http(s). */
export function normalizeServerUrl(value: string): string {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error(`"${value}" is not a URL`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('The server URL must start with https:// (or http:// for a local server)');
    return url.origin;
}

export function serverUrl(): string {
    const configured = readJson<UserConfig>(userFile(), {}).serverUrl;
    try {
        return configured ? normalizeServerUrl(configured) : DEFAULT_SERVER_URL;
    } catch {
        return DEFAULT_SERVER_URL;
    }
}

export function setServerUrl(value: string): string {
    const url = normalizeServerUrl(value);
    const config = readJson<UserConfig>(userFile(), {});
    writeJson(userFile(), { ...config, serverUrl: url }, true);
    return url;
}

export function accountFor(server: string): Account | null {
    return readJson<UserConfig>(userFile(), {}).accounts?.[server] ?? null;
}

export function saveAccount(server: string, account: Account | null): void {
    const config = readJson<UserConfig>(userFile(), {});
    const accounts = { ...(config.accounts ?? {}) };
    if (account) accounts[server] = account;
    else delete accounts[server];
    writeJson(userFile(), { ...config, accounts }, true);
}

const projectFile = (projectRoot: string) => path.join(projectRoot, 'local', 'cocos-playground.json');

export function selectionFor(projectRoot: string, server: string): Selection {
    const saved = readJson<Record<string, Partial<Selection>>>(projectFile(projectRoot), {})[server] ?? {};
    return { applicationId: saved.applicationId ?? null, conceptId: saved.conceptId ?? null };
}

export function saveSelection(projectRoot: string, server: string, selection: Selection): void {
    const all = readJson<Record<string, Selection>>(projectFile(projectRoot), {});
    writeJson(projectFile(projectRoot), { ...all, [server]: selection });
}
