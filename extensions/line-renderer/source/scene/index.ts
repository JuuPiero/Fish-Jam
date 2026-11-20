/**
 * Scene-process half of the Line Renderer extension: the Edit Points /
 * Create Points tools in the Scene view, picking lines by clicking them,
 * and the methods the Inspector calls.
 *
 * Methods are called with execute-scene-script, which only reaches the edit
 * scene's process; that process marks itself primary.
 */
import { allLines, cc, cce, findComponent, lineClass, runtimeReady, repaint } from './env';
import { S, DEFAULT_SETTINGS, note, bumpState, setSelection } from './state';
import { drawFrame, updateTarget } from './render';
import {
    onMouseDown, onMouseMove, onMouseUp, onDblClick, onKeyDown, onKeyUp, onPickMouseDown, PRIORITY, PICK_PRIORITY, cancelActive, setMode,
} from './input';
import { installGuards, uninstallGuards, guardsInfo } from './guards';
import { createLineNode, deleteSelected, selectAll, simplifyLine, subdivideSelected, takePendingMode } from './ops';
import { eventCoordMode, removeOverlay, sceneCamera } from './view';
import { simplifyIndices } from '../../assets/core/line-geometry';

const PKG = 'line-renderer';
const BROADCAST_MS = 80;

let hooked = false;
let opHooked = false;

const listeners: [string, (ev: any) => boolean, number][] = [
    ['mousedown', onMouseDown, PRIORITY],
    ['mousemove', onMouseMove, PRIORITY],
    ['mouseup', onMouseUp, PRIORITY],
    ['dblclick', onDblClick, PRIORITY],
    ['keydown', onKeyDown, PRIORITY],
    ['keyup', onKeyUp, PRIORITY],
    ['mousedown', onPickMouseDown, PICK_PRIORITY],
];

export interface ToolState {
    primary: boolean;
    target: string | null;
    mode: string;
    selection: number[];
    count: number;
    simplified: number;
    settings: typeof S.settings;
    is2D: boolean;
}

function toolState(): ToolState {
    const comp = S.target;
    return {
        primary: S.primary,
        target: comp ? comp.uuid : null,
        mode: S.mode,
        selection: S.selection.slice(),
        count: comp ? comp.positions.length : 0,
        simplified: comp ? simplifyIndices(comp.positions, S.settings.tolerance, comp.loop).length : 0,
        settings: { ...S.settings },
        is2D: !!cce().Camera?.is2D,
    };
}

let lastSent = '';
let lastSentAt = 0;
let timer: any = null;

function maybeBroadcast(force = false): void {
    if (!S.primary) return;
    const now = Date.now();
    const wait = BROADCAST_MS - (now - lastSentAt);
    if (!force && wait > 0) {
        if (!timer) timer = setTimeout(() => {
            timer = null;
            maybeBroadcast();
        }, wait);
        return;
    }
    const state = toolState();
    const json = JSON.stringify(state);
    if (!force && json === lastSent) return;
    lastSent = json;
    lastSentAt = now;
    try {
        Editor.Message.broadcast('line-renderer:state', state);
    } catch {
        // editor shutting down
    }
}

function onBeforeCommit(): void {
    try {
        drawFrame();
        const pending = S.target ? takePendingMode(S.target) : null;
        if (pending && pending !== 'none') setMode(pending);
        maybeBroadcast();
    } catch (e) {
        note(`draw: ${(e as Error)?.stack || e}`);
    }
}

function hook(): void {
    if (!hooked) {
        const { director, Director } = cc();
        director.on(Director.EVENT_BEFORE_COMMIT, onBeforeCommit);
        hooked = true;
    }
    if (!opHooked) {
        const op = cce().Operation;
        if (op?.addListener) {
            for (const [type, fn, priority] of listeners) op.addListener(type, fn, priority);
            opHooked = true;
        }
    }
    installGuards();
    S.hooked = hooked && opHooked;
}

function unhook(): void {
    try {
        if (hooked) {
            const { director, Director } = cc();
            director.off(Director.EVENT_BEFORE_COMMIT, onBeforeCommit);
        }
    } catch {
        // editor shutting down
    }
    hooked = false;
    try {
        const op = cce().Operation;
        if (opHooked && op?.removeListener) for (const [type, fn] of listeners) op.removeListener(type, fn);
    } catch {
        // editor shutting down
    }
    opHooked = false;
    uninstallGuards();
}

function markPrimary(): void {
    if (!S.primary) {
        S.primary = true;
        bumpState();
    }
    hook();
}

async function loadSettings(): Promise<void> {
    try {
        const saved = await Editor.Profile.getConfig(PKG, 'settings');
        if (saved && typeof saved === 'object') S.settings = { ...DEFAULT_SETTINGS, ...saved };
    } catch {
        // defaults
    }
}

async function saveSettings(): Promise<void> {
    try {
        await Editor.Profile.setConfig(PKG, 'settings', { ...S.settings }, 'global');
    } catch {
        // not persisted
    }
}

/** Makes the tools work on the line with this component uuid (it must be selected). */
function focus(compUuid?: string): any {
    updateTarget();
    if (compUuid && (!S.target || S.target.uuid !== compUuid)) return null;
    return S.target;
}

function now(): ToolState {
    maybeBroadcast(true);
    repaint();
    return toolState();
}

export const methods: Record<string, (...args: any[]) => any> = {
    lrPrimary() {
        markPrimary();
        return true;
    },

    lrState(compUuid?: string) {
        markPrimary();
        focus(compUuid);
        return toolState();
    },

    lrSetMode(compUuid: string, mode: 'none' | 'edit' | 'create') {
        markPrimary();
        if (!focus(compUuid)) return toolState();
        setMode(mode === 'edit' || mode === 'create' ? mode : 'none');
        return now();
    },

    lrSetSetting(key: string, value: any) {
        if (!(key in S.settings)) return toolState();
        (S.settings as any)[key] = value;
        saveSettings();
        return now();
    },

    async lrAction(compUuid: string, name: string, arg?: any) {
        markPrimary();
        if (!focus(compUuid)) return toolState();
        switch (name) {
            case 'delete': await deleteSelected(); break;
            case 'subdivide': await subdivideSelected(); break;
            case 'selectAll': selectAll(); break;
            case 'clearSelection': setSelection([]); break;
            case 'simplify': await simplifyLine(Number(arg ?? S.settings.tolerance)); break;
        }
        return now();
    },

    async lrCreate(kind: string) {
        markPrimary();
        try {
            return await createLineNode(kind);
        } catch (e) {
            note(`create: ${(e as Error)?.stack || e}`);
            console.error('[LineRenderer] Could not create the line:', e);
            return null;
        }
    },

    /** Inspector: geometry info of a line. */
    lrInfo(compUuid: string) {
        const comp = findComponent(compUuid);
        if (!comp) return null;
        return { points: comp.positions.length, length: Math.round(comp.getLength() * 1000) / 1000 };
    },

    lrDiagnostics() {
        const cam = sceneCamera();
        return {
            primary: S.primary,
            hooked: S.hooked,
            runtimeReady: runtimeReady(),
            lineClass: !!lineClass(),
            mode: S.mode,
            target: S.target?.node?.name ?? null,
            selection: S.selection,
            settings: S.settings,
            lines: allLines().map((c) => `${c.node?.name} (${c.positions.length} points)`),
            camera: cam ? { name: cam.name, width: cam.width, height: cam.height, projection: cam.projectionType } : null,
            eventCoords: eventCoordMode(),
            operation: !!cce().Operation?.addListener,
            guards: guardsInfo(),
            diag: S.diag,
        };
    },
};

export function load(): void {
    loadSettings();
    const tryHook = (n: number) => {
        try {
            hook();
            if (S.hooked) return;
        } catch {
            // retry
        }
        if (n > 0) setTimeout(() => tryHook(n - 1), 1000);
    };
    tryHook(30);
}

export function unload(): void {
    cancelActive();
    unhook();
    removeOverlay();
    S.mode = 'none';
}
