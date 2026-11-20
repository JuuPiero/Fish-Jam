/**
 * Keeps editor shortcuts from acting on the node while its points are being
 * edited: Delete removes the selected points (not the node), Ctrl+A selects
 * all points (not all nodes). The shortcuts reach the editor as well as the
 * scene, so the scene facade's removeNode / selectAllNodes are wrapped and
 * skip the edited node right after such a key went through the Scene view.
 */
import { cce } from './env';
import { S, note } from './state';
import { deleteKey, cancelActive, isDragging } from './input';

const KEY_WINDOW_MS = 800;
const undo: (() => void)[] = [];
let installed = false;

function isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || !!t?.isContentEditable;
}

function onKeyDownCapture(e: KeyboardEvent): void {
    if (!S.primary || S.mode !== 'edit' || isTyping(e)) return;
    const k = e.key;
    if ((k === 'Delete' || k === 'Backspace') && S.selection.length && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        deleteKey();
    } else if ((k === 'a' || k === 'A') && (e.ctrlKey || e.metaKey) && S.target) {
        S.selectAllKeyAt = Date.now();
    }
}

function onBlur(): void {
    if (isDragging()) cancelActive();
}

function involvesTarget(options: any): boolean {
    const ids = options?.uuid;
    const list: string[] = Array.isArray(ids) ? ids : typeof ids === 'string' ? [ids] : [];
    return !list.length || (!!S.target && list.includes(S.target.node.uuid));
}

function wrap(target: any, name: string, guard: (args: any[]) => boolean): void {
    const orig = target?.[name];
    if (typeof orig !== 'function' || orig.__lineGuard) return;
    const wrapped = function (this: any, ...args: any[]) {
        try {
            if (guard(args)) return undefined;
        } catch (e) {
            note(`guard ${name}: ${e}`);
        }
        return orig.apply(this, args);
    };
    (wrapped as any).__lineGuard = true;
    target[name] = wrapped;
    undo.push(() => {
        if (target[name] === wrapped) target[name] = orig;
    });
}

export function installGuards(): void {
    if (installed) return;
    installed = true;
    window.addEventListener('keydown', onKeyDownCapture, true);
    window.addEventListener('blur', onBlur);
    undo.push(() => {
        window.removeEventListener('keydown', onKeyDownCapture, true);
        window.removeEventListener('blur', onBlur);
    });
    const facade = cce().SceneFacadeManager;
    const target = typeof facade === 'function' ? facade.prototype : facade;
    if (!target) return;
    wrap(target, 'removeNode', (args) => {
        if (S.mode === 'edit' && Date.now() - S.deleteKeyAt < KEY_WINDOW_MS && involvesTarget(args[0])) {
            note('Delete went to the selected points, not the node');
            return true;
        }
        return false;
    });
    wrap(target, 'selectAllNodes', () => S.mode === 'edit' && Date.now() - S.selectAllKeyAt < KEY_WINDOW_MS);
}

export function uninstallGuards(): void {
    while (undo.length) undo.pop()!();
    installed = false;
}

export function guardsInfo(): Record<string, unknown> {
    const facade = cce().SceneFacadeManager;
    const target = typeof facade === 'function' ? facade.prototype : facade;
    return {
        installed,
        facadeType: typeof facade,
        removeNodeGuarded: !!target?.removeNode?.__lineGuard,
        selectAllGuarded: !!target?.selectAllNodes?.__lineGuard,
    };
}
