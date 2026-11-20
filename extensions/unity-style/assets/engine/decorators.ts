import { _decorator, cclegacy, Component } from 'cc';

/**
 * Unity-named decorators mapped onto Cocos' own (_decorator).
 *
 * Serialization is explicit: a field is saved and shown only with
 * @SerializeField (or Cocos' @property). TypeScript erases `public` /
 * `private`, so Unity's "public fields serialize" rule cannot be detected.
 * The other field decorators (@Tooltip, @Range, @Header...) only add
 * Inspector information; in a release build Cocos drops them, so they must
 * sit next to @SerializeField.
 *
 * Class decorators: put @Serializable on top (it is applied last), as with
 * @ccclass. @ccclass / @property keep working, also mixed with these.
 */

// the editor decorators (tooltip, range, visible...) exist at run time but are missing from cc.d.ts
const d: any = _decorator;

type AnyCtor = new (...args: any[]) => any;
type FieldDecorator = (target: any, key: string, descriptor?: any) => any;

/** Data classes per script file, for stable names (see Serializable). */
const dataClassCount: { [script: string]: number } = {};

function currentScript(): string {
    try {
        const rf = (cclegacy as any)._RF;
        const frame = rf && rf.peek ? rf.peek() : null;
        return frame && frame.script ? String(frame.script) : '';
    } catch (e) {
        return '';
    }
}

function isComponentClass(ctor: any): boolean {
    let p = ctor;
    while (p) {
        if (p === Component) return true;
        p = Object.getPrototypeOf(p);
    }
    return false;
}

function serializableName(ctor: any): string | undefined {
    if (isComponentClass(ctor)) return undefined; // Cocos names it after its script file
    const script = currentScript();
    if (!script) return ctor.name || undefined;
    const n = (dataClassCount[script] || 0) + 1;
    dataClassCount[script] = n;
    return script + '.' + n;
}

/**
 * Registers a class with Cocos (the @ccclass replacement): components and
 * serializable data classes. `@Serializable`, `@Serializable()` or
 * `@Serializable('Name')`.
 *
 * Without a name:
 * - a Component is named after its script file by the engine (one
 *   component per file, as Cocos requires), and that name is a string in
 *   the compiled script, so it survives minification;
 * - a non-component data class is named "<ScriptFile>.<n>" (n = its order
 *   among the unnamed data classes of that file). Release builds minify
 *   class names, so the class's own name cannot be used; this name stays
 *   stable unless you reorder those classes. Pass a name to pin it.
 */
export function Serializable(nameOrTarget?: string | AnyCtor): any {
    if (typeof nameOrTarget === 'function') {
        const name = serializableName(nameOrTarget);
        return name ? d.ccclass(name)(nameOrTarget) : d.ccclass(nameOrTarget);
    }
    return (ctor: AnyCtor) => {
        const name = nameOrTarget || serializableName(ctor);
        return name ? d.ccclass(name)(ctor) : d.ccclass(ctor);
    };
}

function isFieldTarget(a: any, b: any): boolean {
    return !!a && typeof a === 'object' && typeof b === 'string';
}

/**
 * Saves the field and shows it in the Inspector.
 *   @SerializeField hp = 10;                       number / string / boolean from the default
 *   @SerializeField(Node) target: Node | null = null;
 *   @SerializeField([Node]) points: Node[] = [];
 *   @SerializeField(Enum(Team)) team = Team.Red;   TS enums need cc Enum()
 *   @SerializeField({ type: CCInteger, tooltip: '...' }) count = 0;   Cocos property options
 */
export function SerializeField(a?: any, b?: any, c?: any): any {
    // `serializable: true` is explicit: Cocos' own editor decorators (tooltip, range, visible...)
    // put the property in "standalone" mode, where only an explicit flag keeps it saved
    if (isFieldTarget(a, b)) return d.property({ serializable: true })(a, b, c);
    if (a === undefined) return d.property({ serializable: true });
    if (a && typeof a === 'object' && !Array.isArray(a) && !(a as any).__enums__ && !(a as any).__bitmask__) {
        return d.property(Object.assign({ serializable: true }, a));
    }
    return d.property({ type: a, serializable: true });
}

/** Hides a field from the Inspector (it is still saved with @SerializeField). */
export function HideInInspector(a?: any, b?: any, c?: any): any {
    const dec = d.visible(false) as FieldDecorator;
    if (isFieldTarget(a, b)) return dec(a, b, c);
    return dec;
}

export function Tooltip(text: string): FieldDecorator {
    return d.tooltip(text) as FieldDecorator;
}

/** A slider between min and max. */
export function Range(min: number, max: number, step?: number): FieldDecorator {
    const r = d.range(step === undefined ? [min, max] : [min, max, step]) as FieldDecorator;
    const s = d.slide as FieldDecorator;
    return (target, key, desc) => {
        r(target, key, desc);
        s(target, key, desc);
    };
}

/** Smallest value accepted in the Inspector. */
export function Min(min: number): FieldDecorator {
    return d.rangeMin(min) as FieldDecorator;
}

/** A multi-line text box for a string field. */
export function Multiline(a?: any, b?: any, c?: any): any {
    const dec = d.multiline as FieldDecorator;
    if (isFieldTarget(a, b)) return dec(a, b, c);
    return dec;
}

export const TextArea = Multiline;

/** Keeps the data saved under an old field name. */
export function FormerlySerializedAs(oldName: string): FieldDecorator {
    return d.formerlySerializedAs(oldName) as FieldDecorator;
}

/** Plain fields are not saved anyway; kept so Unity code compiles. */
export function NonSerialized(a?: any, b?: any, c?: any): any {
    const dec: FieldDecorator = () => undefined;
    if (isFieldTarget(a, b)) return dec(a, b, c);
    return dec;
}

// ----------------------------------------------------- Header / Space (advanced-inspector metadata)

const META = '__advInspectorMeta__';
const CC_CACHE = '__ccclassCache__';
let seq = 1000000;

/**
 * Writes the same metadata as advanced-inspector's @title / @propertySpace,
 * so its Inspector draws them when that extension is installed. Cocos' own
 * Inspector has no headers: without advanced-inspector they do nothing.
 */
function metaMember(target: any, key: string): any {
    const ctor = target.constructor;
    const own = Object.prototype.hasOwnProperty.call(ctor, META) ? ctor[META] : (ctor[META] = { version: 1, members: [] });
    for (let i = 0; i < own.members.length; i++) if (own.members[i].name === key) return own.members[i];
    const m: any = { name: key, kind: 'field', seq: seq++ };
    const cache = Object.prototype.hasOwnProperty.call(ctor, CC_CACHE) ? ctor[CC_CACHE] : null;
    const props = cache && cache.proto ? cache.proto.properties : null;
    const keys = props ? Object.keys(props) : [];
    m.anchor = keys.length ? keys[keys.length - 1] : null;
    own.members.push(m);
    return m;
}

/** A bold title line above the field (drawn by advanced-inspector). */
export function Header(text: string): FieldDecorator {
    return (target, key) => {
        metaMember(target, key).title = { title: text, bold: true, line: true };
    };
}

function spaceAttribute(height = 8): FieldDecorator {
    return (target, key) => {
        metaMember(target, key).spaceBefore = height;
    };
}

/**
 * Both of Unity's Space: the field decorator `@Space(10)` (empty space
 * above the field, drawn by advanced-inspector) and the values Space.World /
 * Space.Self of Translate and Rotate.
 */
export const Space = Object.assign(spaceAttribute, { World: 0 as const, Self: 1 as const });
export type Space = 0 | 1;

// ----------------------------------------------------- class decorators

/** Adds the components when this one is added in the editor (up to 3 types, or an array). */
export function RequireComponent(a: AnyCtor | AnyCtor[], b?: AnyCtor, c?: AnyCtor): ClassDecorator {
    const list: AnyCtor[] = Array.isArray(a) ? a.slice() : [a];
    if (b) list.push(b);
    if (c) list.push(c);
    return d.requireComponent(list.length === 1 ? list[0] : list) as ClassDecorator;
}

export function DisallowMultipleComponent(target?: any): any {
    if (typeof target === 'function') return (d.disallowMultiple as any)(target);
    return d.disallowMultiple;
}

/** Runs the component's lifecycle in the editor too. */
export function ExecuteInEditMode(target?: any): any {
    if (typeof target === 'function') return (d.executeInEditMode as any)(target);
    return d.executeInEditMode;
}

export const ExecuteAlways = ExecuteInEditMode;

/** Its path in the Add Component menu. */
export function AddComponentMenu(path: string): ClassDecorator {
    return d.menu(path) as ClassDecorator;
}

/** Lower runs first (Cocos' executionOrder). */
export function DefaultExecutionOrder(order: number): ClassDecorator {
    return d.executionOrder(order) as ClassDecorator;
}

export function HelpURL(url: string): ClassDecorator {
    return d.help(url) as ClassDecorator;
}
