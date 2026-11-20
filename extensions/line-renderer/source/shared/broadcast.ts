/**
 * Listening to editor broadcasts from a panel or Inspector renderer.
 * Cocos 3.8 has the listener API under Editor.Message.__protected__ (older
 * versions exposed it directly).
 */
type Listener = (...args: any[]) => void;

function api(): { add: (m: string, f: Listener) => void; remove: (m: string, f: Listener) => void } | null {
    const msg: any = Editor.Message;
    const target = typeof msg.addBroadcastListener === 'function' ? msg : msg.__protected__;
    if (!target || typeof target.addBroadcastListener !== 'function') return null;
    return {
        add: (m, f) => target.addBroadcastListener(m, f),
        remove: (m, f) => target.removeBroadcastListener(m, f),
    };
}

/** Subscribes to broadcast messages; returns an unsubscribe function. */
export function onBroadcast(messages: string | string[], fn: Listener): () => void {
    const a = api();
    if (!a) return () => undefined;
    const list = Array.isArray(messages) ? messages : [messages];
    for (const m of list) a.add(m, fn);
    return () => {
        for (const m of list) a.remove(m, fn);
    };
}
