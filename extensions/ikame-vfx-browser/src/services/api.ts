'use strict';

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { CatalogResponse } from '../mappers/types';

export class VFXApiClient {
    private serverUrl: string;

    constructor(serverUrl: string) {
        // Remove trailing slash
        this.serverUrl = serverUrl.replace(/\/+$/, '');
    }

    /** Fetch the full VFX catalog */
    async fetchCatalog(): Promise<CatalogResponse> {
        const data = await this.getJson(`${this.serverUrl}/api/vfx/catalog`);
        return data as CatalogResponse;
    }

    /** Download particle.json for a VFX item */
    async downloadParticleJson(vfxId: string): Promise<Record<string, any>> {
        const data = await this.getJson(`${this.serverUrl}/api/vfx/${encodeURIComponent(vfxId)}/particle-json`);
        return data as Record<string, any>;
    }

    /** Download asset binary (texture or mesh) */
    async downloadAssetBinary(guid: string): Promise<Buffer> {
        return this.getBuffer(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}`);
    }

    /** Download asset metadata JSON (for materials) */
    async downloadAssetMeta(guid: string): Promise<Record<string, any>> {
        const data = await this.getJson(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}/meta`);
        return data as Record<string, any>;
    }

    /** Check if an asset exists on the server */
    async assetExists(guid: string): Promise<boolean> {
        return new Promise((resolve) => {
            const url = new URL(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}`);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.request(url, { method: 'HEAD' }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.end();
        });
    }

    /** GET request returning parsed JSON */
    private getJson(urlStr: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
                    res.resume();
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const body = Buffer.concat(chunks).toString('utf-8');
                        resolve(JSON.parse(body));
                    } catch (err: any) {
                        reject(new Error(`JSON parse error from ${urlStr}: ${err.message}`));
                    }
                });
            });
            req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
        });
    }

    /** GET request returning raw Buffer */
    private getBuffer(urlStr: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
                    res.resume();
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
        });
    }
}
