import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import type { DiffField } from './diff';

/*
 * The dashboard's API, as the extension uses it (next-playground: lib/server/api-tokens.ts for
 * sign-in; the same routes as the web UI for the rest). Every call carries the access token, if any.
 */

export class ApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

export interface ServerInfo {
    name: string;
    apiVersion: number;
    /** apiVersion 2+: what this server offers (`estimate`). */
    features?: string[];
    authEnabled: boolean;
}

export interface LoginStart {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
}

export type LoginPoll = { status: 'pending' | 'denied' | 'expired' } | { status: 'approved'; token: string; email: string; expires_at: string };

export interface Application {
    id: number;
    name: string;
    icon_url?: string | null;
}

export interface Concept {
    id: number;
    application_id: number;
    name: string;
    build_original_filename: string | null;
    build_uploaded_at: string | null;
    /** In `GET /concepts/:id` (and the listing): the current build's fields. */
    manifest?: { version?: number; fields?: DiffField[] } | null;
}

export interface Playable {
    id: number;
    concept_id: number;
    name: string;
    field_values: Record<string, unknown> | null;
    updated_at: string;
}


async function call<T>(server: string, route: string, init: { method?: string; token?: string | null; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${server}/api${route}`, {
            method: init.method ?? 'GET',
            headers: {
                Accept: 'application/json',
                ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
                ...(init.token && { Authorization: `Bearer ${init.token}` }),
            },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
        });
    } catch (error) {
        const reason = error instanceof Error ? (error.name === 'TimeoutError' ? 'timed out' : String((error as { cause?: unknown }).cause ?? error.message)) : String(error);
        throw new ApiError(0, `Can't reach ${server} (${reason})`);
    }
    const text = await response.text();
    let body: any = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = null;
    }
    if (!response.ok) throw new ApiError(response.status, body?.message ?? `${response.status} ${response.statusText}`);
    if (body === null && text) throw new ApiError(response.status, `${server} did not answer like a cocos-playground server`);
    return body as T;
}

export const api = {
    info: (server: string) => call<ServerInfo>(server, '/extension/info', { timeoutMs: 8000 }),
    me: (server: string, token: string | null) => call<{ enabled: boolean; user: { email: string; role: string } | null }>(server, '/auth/me', { token }),
    startLogin: (server: string, deviceName: string) => call<LoginStart>(server, '/extension/login/start', { method: 'POST', body: { device_name: deviceName } }),
    pollLogin: (server: string, deviceCode: string) => call<LoginPoll>(server, '/extension/login/poll', { method: 'POST', body: { device_code: deviceCode } }),
    applications: (server: string, token: string | null) => call<Application[]>(server, '/applications', { token }),
    concepts: (server: string, token: string | null, applicationId: number) => call<Concept[]>(server, `/applications/${applicationId}/concepts`, { token }),
    createConcept: (server: string, token: string | null, applicationId: number, name: string) =>
        call<Concept>(server, `/applications/${applicationId}/concepts`, { method: 'POST', token, body: { name } }),
    concept: (server: string, token: string | null, conceptId: number) => call<Concept>(server, `/concepts/${conceptId}`, { token, timeoutMs: 60_000 }),
    playables: (server: string, token: string | null, conceptId: number) => call<Playable[]>(server, `/concepts/${conceptId}/playables`, { token, timeoutMs: 60_000 }),
};

/**
 * Uploads a playable package to a concept (`POST /api/concepts/:id/build`, multipart `file`),
 * streamed from disk so `onProgress` (0–1) can follow it.
 */
export function uploadBuild(server: string, token: string | null, conceptId: number, file: string, onProgress: (fraction: number) => void): Promise<Concept> {
    return postFile<Concept>(`${server}/api/concepts/${conceptId}/build`, server, token, file, onProgress);
}

function postFile<T>(target: string, server: string, token: string | null, file: string, onProgress: (fraction: number) => void): Promise<T> {
    const url = new URL(target);
    const boundary = `----cocos-playground-${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(file).replace(/"/g, '')}"\r\nContent-Type: application/zip\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const size = fs.statSync(file).size;
    const total = head.length + size + tail.length;
    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const request = client.request(
            url,
            {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': total,
                    Accept: 'application/json',
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
                timeout: 10 * 60_000,
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    let body: any = null;
                    try {
                        body = JSON.parse(text);
                    } catch {
                        body = null;
                    }
                    if ((response.statusCode ?? 0) >= 300) {
                        reject(new ApiError(response.statusCode ?? 0, body?.message ?? `upload failed: ${response.statusCode}`));
                    } else {
                        onProgress(1);
                        resolve(body as T);
                    }
                });
            },
        );
        request.on('timeout', () => request.destroy(new Error('the upload timed out')));
        request.on('error', (error) => reject(new ApiError(0, `Upload to ${server} failed: ${error.message}`)));

        let sent = 0;
        const report = (bytes: number) => {
            sent += bytes;
            onProgress(Math.min(0.99, sent / total));
        };
        request.write(head);
        report(head.length);
        const stream = fs.createReadStream(file, { highWaterMark: 256 * 1024 });
        stream.on('data', (chunk) => {
            report(chunk.length);
            if (!request.write(chunk)) {
                stream.pause();
                request.once('drain', () => stream.resume());
            }
        });
        stream.on('error', (error) => request.destroy(error));
        stream.on('end', () => {
            request.end(tail);
            report(tail.length);
        });
    });
}
