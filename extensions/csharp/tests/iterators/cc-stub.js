// The few 'cc' exports the coroutine test needs in node (samples.js bundles Coroutines.ts with it):
// decorators that do nothing, and a bare Component.
function member() {
    // @x on a member (target, key): nothing; @x(...): a member decorator
    if (arguments.length >= 2 && typeof arguments[1] === 'string') return undefined;
    return member;
}
function ccclass(a) {
    // @ccclass(Ctor) or @ccclass('Name')(Ctor): the class itself
    return typeof a === 'function' ? a : (ctor) => ctor;
}
export const _decorator = new Proxy({}, { get: (t, name) => (name === 'ccclass' ? ccclass : member) });
export const cclegacy = {};
export class Component {
    constructor() {
        this.name = 'stub';
        this.node = null;
    }
}
export class Node {}
export const CCInteger = 'Integer';
export const CCFloat = 'Float';
export const CCString = 'String';
export const CCBoolean = 'Boolean';
export function Enum(e) {
    return e;
}
