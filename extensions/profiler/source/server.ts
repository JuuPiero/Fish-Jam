/**
 * Editor side of the profiler connection: a WebSocket server that running
 * games (Play in Editor, browser previews, phones on the LAN) connect to.
 * It keeps the last frames of each game and forwards a fixed set of
 * commands to them. Games only send telemetry; nothing they send is run.
 */
import type { IncomingMessage } from 'http';
import { networkInterfaces } from 'os';
import { WebSocket, WebSocketServer } from 'ws';
import { RingBuffer } from '../assets/core/ring';
import { EditorCommand, FrameCaptureData, FrameData, parseGameMessage, PROFILER_PATH, PROFILER_PORTS } from '../assets/core/protocol';

export const FRAME_HISTORY = 300;

export interface ClientInfo {
    id: number;
    runtime: string;
    url: string;
    agent: string;
    platform: string;
    frameDebugger: boolean;
    since: number;
}

interface Client extends ClientInfo {
    ws: WebSocket;
    names: Record<number, string>;
    frames: RingBuffer<FrameData>;
    capture: FrameCaptureData | null;
}

export interface ServerEvents {
    clients(list: ClientInfo[]): void;
    frames(clientId: number, frames: FrameData[], names: Record<number, string> | undefined): void;
    capture(clientId: number, capture: FrameCaptureData | null, error: string | undefined): void;
    hello(clientId: number): void;
}

export class ProfilerServer {
    private server: WebSocketServer | null = null;
    private clients = new Map<number, Client>();
    private nextClient = 1;
    port = 0;
    host = '';
    error = '';

    constructor(private readonly on: ServerEvents) {}

    get running(): boolean {
        return !!this.server;
    }

    /** Listens on the first free port (127.0.0.1, or every interface with `lan`). */
    async start(lan: boolean, ports: number[] = PROFILER_PORTS): Promise<void> {
        await this.stop();
        this.host = lan ? '0.0.0.0' : '127.0.0.1';
        for (const port of ports) {
            try {
                this.server = await listen(this.host, port);
                this.port = port;
                this.error = '';
                this.server.on('connection', (ws, req) => this.accept(ws, req));
                return;
            } catch (e) {
                this.error = String((e as Error)?.message || e);
            }
        }
        this.server = null;
        this.port = 0;
    }

    async stop(): Promise<void> {
        for (const c of this.clients.values()) c.ws.terminate();
        this.clients.clear();
        const s = this.server;
        this.server = null;
        if (s) await new Promise<void>((r) => s.close(() => r()));
        this.on.clients(this.list());
    }

    list(): ClientInfo[] {
        return [...this.clients.values()].map(({ id, runtime, url, agent, platform, frameDebugger, since }) => ({ id, runtime, url, agent, platform, frameDebugger, since }));
    }

    /** Sends a command to one game (0: every game). */
    send(clientId: number, cmd: EditorCommand): boolean {
        let sent = false;
        for (const c of this.clients.values()) {
            if (clientId && c.id !== clientId) continue;
            if (c.ws.readyState !== WebSocket.OPEN) continue;
            c.ws.send(JSON.stringify(cmd));
            sent = true;
        }
        return sent;
    }

    /** Names and kept frames of a game (oldest first). */
    frames(clientId: number): { names: Record<number, string>; frames: FrameData[] } | null {
        const c = this.clients.get(clientId);
        return c ? { names: c.names, frames: c.frames.toArray() } : null;
    }

    lastCapture(clientId: number): FrameCaptureData | null {
        const c = this.clients.get(clientId);
        return c ? c.capture : null;
    }

    clear(clientId: number): void {
        for (const c of this.clients.values()) if (!clientId || c.id === clientId) c.frames.clear();
    }

    private accept(ws: WebSocket, req: IncomingMessage): void {
        if (!(req.url || '').startsWith(PROFILER_PATH)) {
            ws.close();
            return;
        }
        let client: Client | null = null;
        ws.on('message', (raw) => {
            const msg = parseGameMessage(String(raw));
            if (!msg) return;
            if (msg.type === 'hello') {
                if (client) return;
                client = {
                    id: this.nextClient++,
                    runtime: msg.runtime,
                    url: msg.url,
                    agent: msg.agent,
                    platform: msg.platform,
                    frameDebugger: msg.frameDebugger,
                    since: Date.now(),
                    ws,
                    names: {},
                    frames: new RingBuffer<FrameData>(FRAME_HISTORY),
                    capture: null,
                };
                this.clients.set(client.id, client);
                this.on.clients(this.list());
                this.on.hello(client.id);
                return;
            }
            if (!client) return;
            if (msg.type === 'frames') {
                if (msg.names) for (const k of Object.keys(msg.names)) client.names[Number(k)] = String(msg.names[Number(k)]);
                const ok: FrameData[] = [];
                for (const f of msg.frames) {
                    if (!f || typeof f.frameMs !== 'number' || !Array.isArray(f.samples)) continue;
                    client.frames.push(f);
                    ok.push(f);
                }
                if (ok.length) this.on.frames(client.id, ok, msg.names);
            } else if (msg.type === 'capture') {
                client.capture = msg.capture;
                this.on.capture(client.id, msg.capture, msg.error);
            }
        });
        ws.on('close', () => {
            if (!client) return;
            this.clients.delete(client.id);
            this.on.clients(this.list());
        });
        ws.on('error', () => undefined);
    }
}

function listen(host: string, port: number): Promise<WebSocketServer> {
    return new Promise((resolve, reject) => {
        const s = new WebSocketServer({ host, port, maxPayload: 16 * 1024 * 1024 });
        s.once('listening', () => resolve(s));
        s.once('error', (e) => {
            s.close();
            reject(e);
        });
    });
}

/** This machine's LAN IPv4 addresses (for the phone instructions). */
export function lanAddresses(): string[] {
    const out: string[] = [];
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const n of nets[name] || []) {
            if (n.family === 'IPv4' && !n.internal) out.push(n.address);
        }
    }
    return out;
}
