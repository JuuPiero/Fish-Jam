/** Fake `Editor` global; must load before the renderer module. */
export type Handler = (target: string, message: string, ...args: any[]) => any;

export const calls: string[] = [];
export const selections: string[] = [];
let handler: Handler = () => undefined;

export function setHandler(h: Handler) {
    handler = h;
}

(globalThis as any).Editor = {
    Message: {
        async request(target: string, message: string, ...args: any[]) {
            calls.push(message === 'execute-component-method' ? `${message}:${args[0]?.name}` : message);
            await new Promise((r) => setTimeout(r, 2));
            return handler(target, message, ...args);
        },
        send() {},
    },
    I18n: { t: (k: string) => k },
    Selection: {
        clear() {},
        select(type: string, uuids: string[]) {
            selections.push(`${type}:${uuids.join(',')}`);
        },
    },
};
