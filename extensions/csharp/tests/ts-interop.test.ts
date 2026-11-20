import assert from 'assert';
import { test, results } from './harness';
import { generateTsInterop, globToRegExp, isExcluded, parseCcNames, resolveSpecifier } from '../source/bindings/ts-interop';

// a slice of Cocos.g.cs, in the generator's layout
const CC = parseCcNames(
    [
        'namespace cc',
        '{',
        '    public partial class CCObject',
        '    {',
        '    }',
        '    public partial class Component : global::cc.CCObject',
        '    {',
        '        protected virtual void start() { }',
        '    }',
        '    public partial class Node : global::cc.CCObject',
        '    {',
        '        [global::cc.TsStringEnum] public static partial class EventType',
        '        {',
        '        }',
        '    }',
        '    public partial class Vec3',
        '    {',
        '    }',
        '    public partial class Input',
        '    {',
        '    }',
        '    public partial class Tween<T>',
        '    {',
        '    }',
        '    [AttributeUsage(AttributeTargets.Field)]',
        '    public sealed class ReadOnlyAttribute : Attribute { }',
        '    public static partial class Globals',
        '    {',
        '        public static double lerp(double from, double to, double ratio) => throw null;',
        '        [global::cc.TsName("v3")] public static global::cc.Vec3 v3_(double x = default) => throw null;',
        '        public static global::cc.Director director { get => throw null; }',
        '    }',
        '}',
    ].join('\n')
);

const gen = (mods: Record<string, string>) => generateTsInterop(Object.keys(mods).map((id) => ({ id, text: mods[id] })), CC);
/** The declaration line of a type / member in the generated C#. */
const lineOf = (code: string, re: RegExp) => code.split('\n').find((l) => re.test(l)) || '';

test('cc names from Cocos.g.cs: nested types, string enums, arity, globals with [TsName]', () => {
    assert.deepStrictEqual(CC.types.get('Node.EventType'), { arity: 0, kind: 'stringEnum' });
    assert.deepStrictEqual(CC.types.get('Tween'), { arity: 1, kind: 'class' });
    assert.ok(CC.types.has('Component') && !CC.types.has('Globals.lerp'));
    assert.ok(CC.globals.has('lerp') && CC.globals.has('v3') && CC.globals.has('director') && !CC.globals.has('v3_'));
});

test('specifiers: relative, db://, folder index', () => {
    const ids = new Set(['db://assets/a/B', 'db://assets/c/index', 'db://ext/index']);
    const has = (id: string) => ids.has(id);
    assert.strictEqual(resolveSpecifier('db://assets/a/X', './B', has), 'db://assets/a/B');
    assert.strictEqual(resolveSpecifier('db://assets/a/X', '../c', has), 'db://assets/c/index');
    assert.strictEqual(resolveSpecifier('db://assets/a/X', 'db://ext/index.ts', has), 'db://ext/index');
    assert.strictEqual(resolveSpecifier('db://assets/a/X', 'cc', has), 'cc');
    assert.strictEqual(resolveSpecifier('db://assets/a/X', 'lodash', has), null);
});

test('exports only: classes, interfaces, enums, functions, consts; aliases resolved where used', () => {
    const r = gen({
        'db://assets/Scripts/Inv': `
            import { Node } from 'cc';
            export type Id = string;
            export interface Item { id: Id; count: number; readonly tags: string[]; owner?: Node }
            export enum Rarity { Common, Rare = 5, Epic }
            export const enum Flags { A = 1, B = 1 << 2 }
            export enum Kind { Sword = 'sword', Bow = 'bow' }
            export const MAX = 10;
            export let current = 'x';
            export function find(id: Id, items: Item[]): Item | null { return null; }
            export function onPick(cb: (item: Item, index: number) => void): void {}
            class Hidden {}
            function helper() {}
        `,
    });
    const c = r.code;
    assert.ok(/\[global::cc\.TsModule\("db:\/\/assets\/Scripts\/Inv"\)\] public partial interface Item/.test(c));
    assert.ok(/string id \{ get => throw null; set => throw null; \}/.test(c), 'alias Id -> string');
    assert.ok(/string\[\] tags \{ get => throw null; \}/.test(c), 'readonly -> get only');
    assert.ok(/global::cc\.Node owner/.test(c), 'cc types');
    assert.ok(/public enum Rarity : long/.test(c) && /Rare = 5,/.test(c) && /Epic = 6,/.test(c));
    assert.ok(/\[global::cc\.TsConstEnum\] public enum Flags : long/.test(c) && /B = 4,/.test(c));
    assert.ok(/\[global::cc\.TsStringEnum\] public static partial class Kind/.test(c) && /public const string Sword = "sword";/.test(c));
    assert.ok(/public static double MAX \{ get => throw null; \}/.test(c));
    assert.ok(/public static string current \{ get => throw null; \}/.test(c), 'export let: get only (imports are read-only)');
    assert.ok(/public static global::Item find\(string id, global::Item\[\] items\)/.test(c));
    assert.ok(/onPick\(global::System\.Action<global::Item, double> cb\)/.test(c), 'callbacks -> Action');
    assert.ok(!/Hidden|helper/.test(c), 'not exported: not bound');
    assert.strictEqual(r.stats.skipped, 0);
});

test('components and @ccclass data; lifecycle stays protected; fluent this; parameter properties', () => {
    const r = gen({
        'db://assets/Scripts/Health': `
            import { _decorator, Component, Vec3 } from 'cc';
            const { ccclass, property } = _decorator;
            @ccclass('Game.Health')
            export class Health extends Component {
                @property maxHp = 100;
                get dead(): boolean { return false; }
                heal(n: number): this { return this; }
                start() {}
                protected update(dt: number) {}
                private secret = 1;
            }
            export class Boss extends Health { rage = 0; start() {} }
            @ccclass export class Loadout { constructor(readonly weapon: string, public ammo = 0, private key = '') {} }
        `,
    });
    const c = r.code;
    assert.ok(/\[global::cc\.TsCcclass\("Game\.Health"\)\] public partial class Health : global::cc\.Component/.test(c));
    assert.ok(/public Health\(\) : base\(default\(global::cc\.TsInit\)\) \{ \}/.test(c), 'chains the marker ctor of the base');
    assert.ok(/public virtual global::Health heal\(double n\)/.test(c), '`this` -> the class');
    assert.ok(/public virtual bool dead \{ get => throw null; \}/.test(c));
    assert.ok(!/void start\(\)|void update\(/.test(c), 'lifecycle methods are inherited from cc.Component (protected)');
    assert.ok(!/secret/.test(c), 'private members are left out');
    assert.ok(/public partial class Boss : global::Health/.test(c), 'TS base classes');
    assert.ok(/\[global::cc\.TsCcclass\("Loadout"\)\] public partial class Loadout/.test(c), '@ccclass without a name');
    assert.ok(/public virtual string weapon \{ get => throw null; \}/.test(c) && /public virtual double ammo \{ get => throw null; set => throw null; \}/.test(c) && !/ key \{/.test(c), 'parameter properties');
    assert.ok(/public Loadout\(string weapon, double ammo = default, string key = default\)/.test(c));
});

test('barrels: extension exports are imported from db://<ext>/index; default exports', () => {
    const r = gen({
        'db://fx/core/tween': `export class Tween { static to(x: number): Tween { return new Tween(); } }\nexport function ease(t: number): number { return t; }`,
        'db://fx/index': `export * from './core/tween';\nexport { Path as FxPath } from './core/path';\nexport type { Shape, Opts } from './core/path';`,
        'db://fx/core/path': `export class Path {}\nexport class Shape {}\nexport interface Opts { a: number }`,
        'db://assets/Scripts/Def': `export default class Spawner { count = 1; }`,
    });
    const c = r.code;
    assert.ok(/\[global::cc\.TsModule\("db:\/\/fx\/index"\)\] public partial class Tween/.test(c), 'through the barrel');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/fx\/index"\)\] public static double ease\(double t\)/.test(c));
    assert.ok(/\[global::cc\.TsModule\("db:\/\/fx\/index"\)\] public partial class FxPath/.test(c), 'a renamed re-export is bound by its exported name');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/assets\/Scripts\/Def", Export = "default"\)\] public partial class Spawner/.test(c), 'default export');
    assert.strictEqual((c.match(/partial class Tween\b/g) || []).length, 1, 'bound once');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/fx\/core\/path"\)\] public partial class Shape/.test(c), '`export type` re-exports have no value: classes come from their own module');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/fx\/index"\)\] public partial interface Opts/.test(c), 'interfaces may use them');
});

/** The namespace block of the generated C# ('' = the global namespace, before the first namespace). */
function nsBlock(code: string, ns: string): string {
    if (!ns) return code.split('\nnamespace ')[0];
    const start = code.indexOf('\nnamespace ' + ns + '\n{\n');
    if (start < 0) return '';
    const end = code.indexOf('\n}\n', start);
    return code.slice(start, end + 3);
}

test('namespaces: the project in the global namespace, each extension in Ext.<Package>', () => {
    const r = gen({
        'db://assets/Scripts/Bus': `export class EventBus { static emit(e: string): void {} }\nexport class Vec3 {}\nexport function shout(s: string): string { return s; }`,
        'db://input-system/index': `export { InputSystem } from './core/input-system';\nexport class Input { static getKey(k: number): boolean { return false; } }\nexport function installBackend(): void {}`,
        'db://input-system/core/input-system': `export class InputSystem { static frame = 0; }`,
        'db://odd-pkg/index': `export class Exports {}\nexport function hello(): void {}`,
    });
    const c = r.code;
    const root = nsBlock(c, '');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/assets\/Scripts\/Bus"\)\] public partial class EventBus/.test(root), 'project types: global namespace');
    assert.ok(/public partial class Vec3/.test(root), 'a project Vec3 stays global (it hides cc.Vec3 in C#, like a C# class would)');
    assert.ok(r.report.some((l) => /note: the project's Vec3 hides cc\.Vec3/.test(l)));
    assert.ok(/public static partial class ProjectExports\n\{\n    \[global::cc\.TsModule\("db:\/\/assets\/Scripts\/Bus"\)\] public static string shout/.test(root), 'project functions: ProjectExports');
    const input = nsBlock(c, 'Ext.InputSystem');
    assert.ok(/public partial class Input\n/.test(input) && /public partial class InputSystem\n/.test(input), 'Ext.InputSystem holds Input and the class InputSystem');
    assert.ok(/public static partial class Exports\n\s*\{\n\s*\[global::cc\.TsModule\("db:\/\/input-system\/index"\)\] public static void installBackend\(\)/.test(input), 'extension functions: Ext.<Package>.Exports');
    assert.ok(r.report.some((l) => /note: Ext\.InputSystem\.Input is also cc\.Input: next to `using Ext\.InputSystem;` write Ext\.InputSystem\.Input, or add `using Input = Ext\.InputSystem\.Input;`/.test(l)));
    assert.ok(/public static partial class OddPkgExports\n\s*\{\n[^\n]*public static void hello/.test(nsBlock(c, 'Ext.OddPkg')), 'a type named Exports: the functions go to <Package>Exports');
    assert.ok(!/global using/.test(c), 'no global using in the stubs');
    assert.strictEqual(r.stats.clashes, 0);
});

test('clashes: two project files, a project function named like cc\'s, two modules of one extension', () => {
    const r = gen({
        'db://assets/ui/Button': `export class Button { a = 1; }`,
        'db://assets/game/Button': `export class Button { b = 1; }`,
        'db://assets/game/math': `export function lerp(a: number, b: number, t: number): number { return a; }`,
        'db://assets/Other': `export function lerp2(): void {}\nexport class Project {}`,
        'db://cam/index': `export interface Settings { a: number }\nexport * from './core/rig';`,
        'db://cam/core/settings': `export interface Settings { b: number }`,
        'db://cam/core/rig': `export class Rig {}`,
    });
    const c = r.code;
    assert.ok(/\[global::cc\.TsModule\("db:\/\/assets\/ui\/Button"\)\] public partial class Button/.test(nsBlock(c, 'Project.Ui')), 'the folder, PascalCase, below Project');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/assets\/game\/Button"\)\] public partial class Button/.test(nsBlock(c, 'Project.Game')));
    assert.ok(/public static partial class MathExports\n\s*\{\n\s*\[global::cc\.TsModule\("db:\/\/assets\/game\/math"\)\] public static double lerp/.test(nsBlock(c, 'Project.Game')), 'a function named like a cc one: <File>Exports in its folder namespace');
    assert.ok(/public static void lerp2\(\)/.test(nsBlock(c, '')), 'the others stay in ProjectExports');
    assert.ok(/public partial class Project\n/.test(nsBlock(c, 'Project.Other')), 'a project type named Project moves (the namespace has the name)');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/cam\/index"\)\] public partial interface Settings/.test(nsBlock(c, 'Ext.Cam')), 'the index module keeps the extension namespace');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/cam\/core\/settings"\)\] public partial interface Settings/.test(nsBlock(c, 'Ext.Cam.Core')), 'the other one: its folder');
    assert.ok(/public partial class Rig/.test(nsBlock(c, 'Ext.Cam')));
    assert.strictEqual(r.stats.clashes, 4);
    assert.ok(r.report.some((l) => /clash: Button is exported by db:\/\/assets\/ui\/Button and db:\/\/assets\/game\/Button -> Project\.Ui\.Button, Project\.Game\.Button/.test(l)));
    assert.ok(r.report.some((l) => /clash: lerp is also a cc function/.test(l)));
});

test('unmappable -> dynamic (counted); odd input never throws', () => {
    const r = gen({
        'db://assets/Odd': `
            export function pick<K extends keyof Foo>(k: K, rec: Record<string, number>): Foo[K] { return null as any; }
            export const table = { a: 1 };
            export class Broken { method(: number) {} }
            export interface Foo { x: number }
        `,
        'db://assets/Empty': ``,
        'db://assets/Bad': `export class {`,
    });
    assert.ok(/public static dynamic pick<K>\(K k, dynamic rec\)/.test(r.code));
    assert.ok(/public static dynamic table/.test(r.code));
    assert.ok(r.stats.partial >= 2);
});

/** The attribute class block of a decorator: its header line, constructor and properties. */
function attrBlock(code: string, cls: string): string {
    const lines = code.split('\n');
    const i = lines.findIndex((l) => l.trim() === 'public sealed class ' + cls + ' : global::System.Attribute');
    if (i < 0) return '';
    const end = lines.indexOf('    }', i);
    return lines.slice(i - 1, end + 1).join('\n');
}

test('decorators: factories through a type alias, options literals, rest, defaults', () => {
    const r = gen({
        'db://deco/index': `
            type Decorator = (target: any, key: string, descriptor?: any) => void;
            export type Size = 'small' | 'large' | number;
            export function title(text: string, options: { subtitle?: string; bold?: boolean; size?: Size } = {}): Decorator { return () => {}; }
            export function showIf(member: string, ...values: unknown[]): Decorator { return () => {}; }
            export function space(before = 8, after = 0): Decorator { return () => {}; }
            export function color(c: string | number[], alpha?: number): Decorator { return () => {}; }
            export function lerp(a: number, b: number, t: number): number { return a; }
            export function getMeta(ctor: any): { x: number } | null { return null; }
        `,
    });
    const t = attrBlock(r.code, 'TitleAttribute');
    assert.ok(/\[global::cc\.TsModule\("db:\/\/deco\/index", Export = "title"\)\] \[global::cc\.TsDecorator\(OptionsIndex = 1\)\] \[global::System\.AttributeUsage\(global::System\.AttributeTargets\.Field \| global::System\.AttributeTargets\.Property \| global::System\.AttributeTargets\.Method\)\]/.test(t), 'through `type Decorator`: fields, properties, methods\n' + t);
    assert.ok(/public TitleAttribute\(string text\) \{ \}/.test(t) && /\[global::cc\.TsName\("subtitle"\)\] public string Subtitle \{ get; set; \}/.test(t) && /public bool Bold/.test(t) && /public object Size/.test(t), 'options literal -> named properties (unions -> object)');
    assert.ok(/public ShowIfAttribute\(string member, params object\[\] values\)/.test(r.code), 'rest -> params object[]');
    assert.ok(/public SpaceAttribute\(double before = 8, double after = 0\)/.test(r.code), 'untyped defaults keep their type and value');
    assert.ok(/public ColorAttribute\(object c, double alpha = default\)/.test(r.code), 'string | number[] -> object; optional number');
    assert.ok(!/LerpAttribute|GetMetaAttribute/.test(r.code), 'ordinary functions are not decorators');
    assert.ok(/public static global::System\.Action<dynamic, string, dynamic> title\(/.test(r.code), 'the function itself stays callable');
    assert.strictEqual(r.stats.decorators, 4);
    assert.strictEqual(r.stats.decoratorsPartial, 0);
});

test('decorators: flag consts (@x and @x()), bare functions, class decorators, repetition', () => {
    const r = gen({
        'db://deco/flags': `
            type Decorator = (target: any, key: string, descriptor?: any) => void;
            function fieldDecorator(apply: (m: any) => void): Decorator { return (t, k) => apply(t); }
            function flag(apply: (m: any) => void) {
                function decorator(): Decorator;
                function decorator(target: any, key: string, descriptor?: any): void;
                function decorator(target?: any, key?: string, descriptor?: any): any {
                    return fieldDecorator(apply);
                }
                return decorator;
            }
            export const hidden = flag((m) => { m.hidden = true; });
            export function track(target: any, propertyKey: string): void {}
            export function onClick(target: Object, key: string, descriptor: PropertyDescriptor): void {}
            export function register(name: string) { return function (ctor: Function) {}; }
            export function note(text: string): Decorator { return fieldDecorator((m) => { (m.notes ??= []).push(text); }); }
        `,
    });
    const c = r.code;
    assert.ok(/\[global::cc\.TsDecorator\(Bare = true\)\][^\n]*\n\s*public sealed class HiddenAttribute/.test(c), 'flag const -> bare');
    assert.ok(/\[global::cc\.TsDecorator\(Bare = true\)\][^\n]*\n\s*public sealed class TrackAttribute/.test(c), '(target, key): void -> bare');
    assert.ok(/AttributeUsage\(global::System\.AttributeTargets\.Method\)\]\n\s*public sealed class OnClickAttribute/.test(c), 'a required descriptor: methods only');
    assert.ok(/AttributeUsage\(global::System\.AttributeTargets\.Class\)\]\n\s*public sealed class RegisterAttribute/.test(c) && /public RegisterAttribute\(string name\)/.test(c), 'returns (ctor) => ...: a class attribute');
    assert.ok(/AllowMultiple = true\)\]\n\s*public sealed class NoteAttribute/.test(c), 'pushes to a list: repeatable');
    assert.ok(!/AllowMultiple = true\)\]\n\s*public sealed class (Hidden|Track|Register)Attribute/.test(c), 'others are not');
});

test('decorators: calling cc property() -> DeclaresProperty, type filled, property options; clash with [ReadOnly]', () => {
    const r = gen({
        'db://pg/Field': `
            import { _decorator } from 'cc';
            const { property } = _decorator;
            export interface FieldOptions { type: any; label?: string; property?: Record<string, any> }
            export function field(options: FieldOptions) {
                return function (target: any, propertyKey: string) {
                    property({ type: options.type, ...options.property })(target, propertyKey);
                };
            }
            export function readOnly(target: any, key: string): void {}
        `,
    });
    const f = attrBlock(r.code, 'FieldAttribute');
    assert.ok(/\[global::cc\.TsDecorator\(DeclaresProperty = true, OptionsIndex = 0, OptionsRequired = true, TypeOption = "type", PropertyOptions = "property"\)\] \[global::System\.AttributeUsage\(global::System\.AttributeTargets\.Field \| global::System\.AttributeTargets\.Property\)\]/.test(f), f);
    assert.ok(/public FieldAttribute\(\) \{ \}/.test(f) && /public object Type \{ get; set; \}/.test(f) && /public string Label/.test(f) && !/Property \{ get/.test(f));
    assert.ok(/public sealed class ReadOnlyAttribute/.test(nsBlock(r.code, 'Ext.Pg')) && !/global using/.test(r.code), 'in the extension namespace, no alias: the built-in [ReadOnly] keeps the short name');
    assert.ok(r.report.some((l) => /note: Ext\.Pg\.ReadOnlyAttribute is also cc\.ReadOnlyAttribute: next to `using Ext\.Pg;` write \[Ext\.Pg\.ReadOnly\], or `using X = Ext\.Pg;` then \[X\.ReadOnly\]/.test(l)));
});

test('decorators: the real advanced-inspector and cocos-playground sources', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const dir = path.join(__dirname, '..', '..', 'samples', 'extensions'); // tests/out/ at run time
    const r = gen({
        'db://advanced-inspector/AdvancedInspector': fs.readFileSync(path.join(dir, 'advanced-inspector', 'assets', 'AdvancedInspector.ts'), 'utf8'),
        'db://cocos-playground/PlayGroundField': fs.readFileSync(path.join(dir, 'cocos-playground', 'runtime', 'assets', 'PlayGroundField.ts'), 'utf8'),
    });
    assert.strictEqual(r.stats.decorators, 33, '32 advanced-inspector decorators + playGroundField');
    assert.strictEqual(r.stats.decoratorsPartial, 0, 'all with every parameter and option');
    assert.ok(/public ButtonAttribute\(string label = null\)/.test(r.code) && /public ProgressBarAttribute\(object min = null, object max = null, object color = null\)/.test(r.code));
    assert.ok(/\[global::cc\.TsDecorator\(Bare = true\)\][^\n]*\n\s*public sealed class ShowInInspectorAttribute/.test(r.code));
    assert.ok(!/GetClassMetaAttribute|GetPlayGroundFieldsAttribute|GetAllPlayGroundClassesAttribute/.test(r.code), 'helpers taking a class are not class decorators');
});

test('decorators duplicating csharp attributes: not bound when they wrap the same cc decorator; other meanings and @csharp keep stay', () => {
    const r = gen({
        'db://us/index': `
            import { _decorator } from 'cc';
            const d: any = _decorator;
            const { rangeMin } = _decorator as any;
            type FieldDecorator = (target: any, key: string, descriptor?: any) => any;
            function isField(a: any, b: any): boolean { return !!a && typeof b === 'string'; }
            export function Tooltip(text: string): FieldDecorator { return d.tooltip(text) as FieldDecorator; }
            export function Min(min: number): FieldDecorator { return rangeMin(min) as FieldDecorator; }
            export function Multiline(a?: any, b?: any, c?: any): any { const dec = d.multiline as FieldDecorator; if (isField(a, b)) return dec(a, b, c); return dec; }
            export function NonSerialized(a?: any, b?: any, c?: any): any { const dec: FieldDecorator = () => undefined; if (isField(a, b)) return dec(a, b, c); return dec; }
            export function Header(text: string): FieldDecorator { return (t, k) => { t.constructor.header = text; }; }
            /** Same name, other meaning: its own Inspector metadata. */
            export function ReadOnly(target: any, key: string): void { (target.constructor.ro ??= []).push(key); }
            /** @csharp keep */
            export function Range(min: number, max: number): FieldDecorator { return d.range([min, max]) as FieldDecorator; }
            export function Group(name: string): FieldDecorator { return d.tooltip(name) as FieldDecorator; }
        `,
    });
    const ns = nsBlock(r.code, 'Ext.Us');
    assert.ok(!/class (Tooltip|Min|Multiline|NonSerialized)Attribute\b/.test(ns), 'duplicates are not bound\n' + ns);
    assert.ok(/class HeaderAttribute\b/.test(ns), 'no csharp [Header]: bound');
    assert.ok(/class ReadOnlyAttribute\b/.test(ns) && r.report.some((l) => /note: Ext\.Us\.ReadOnlyAttribute is also cc\.ReadOnlyAttribute/.test(l)), 'another meaning: bound, ambiguous with a note');
    assert.ok(/class RangeAttribute\b/.test(ns), '@csharp keep: bound');
    assert.ok(/class GroupAttribute\b/.test(ns), 'a name csharp has, but not the cc decorator it stands for: bound');
    assert.ok(/public static [^\n]* Tooltip\(string text\)/.test(ns), 'the function itself stays callable');
    assert.strictEqual(r.stats.decoratorsDuplicate, 4);
    assert.ok(r.report.some((l) => /^duplicate: db:\/\/us\/index: @Tooltip is not bound as \[Ext\.Us\.Tooltip\]: it wraps cc's tooltip/.test(l)));
    assert.ok(r.report.some((l) => /^duplicate: db:\/\/us\/index: @Min is not bound .*wraps cc's rangeMin/.test(l)));
    assert.ok(r.report.some((l) => /^duplicate: db:\/\/us\/index: @NonSerialized is not bound .*does nothing to Cocos/.test(l)));
});

test('iterators: Iterator / Generator / Iterable / iterator-shaped interfaces -> IEnumerator / IEnumerable; coroutine slots', () => {
    const r = gen({
        'db://co/index': `
            export interface IteratorLike { next(value?: any): { value?: any; done?: boolean }; return?(value?: any): any }
            export interface NotIterator { next(): void; other: number }
            export class Coroutine {}
            export function run(it: Iterator<any>): void {}
            export function gen(): Generator<number, void, unknown> { return null as any; }
            export function all(items: Iterable<string>): void {}
            export function start(routine: IteratorLike | string | (() => IteratorLike), value?: any): Coroutine | null { return null; }
            export function stop(routine: Coroutine | IteratorLike | string | null): void {}
            export function other(x: NotIterator): void {}
        `,
    });
    const c = r.code;
    assert.ok(/public static void run\(global::System\.Collections\.IEnumerator it\)/.test(c), 'Iterator<any> -> IEnumerator');
    assert.ok(/public static global::System\.Collections\.Generic\.IEnumerator<double> gen\(\)/.test(c), 'Generator<number> -> IEnumerator<double>');
    assert.ok(/public static void all\(global::System\.Collections\.Generic\.IEnumerable<string> items\)/.test(c), 'Iterable<string> -> IEnumerable<string>');
    assert.ok(/start\(global::System\.Collections\.IEnumerator routine, dynamic value = default\)/.test(c) && /start\(string routine, dynamic value = default\)/.test(c) && /start\(global::System\.Func<global::System\.Collections\.IEnumerator> routine, dynamic value = default\)/.test(c), 'a coroutine slot with one callback type: overloads\n' + c);
    assert.ok(/stop\(global::Ext\.Co\.Coroutine routine\)/.test(c) && /stop\(global::System\.Collections\.IEnumerator routine\)/.test(c), 'an iterator-shaped interface -> IEnumerator');
    assert.ok(/other\(global::Ext\.Co\.NotIterator x\)/.test(c), 'other interfaces stay');
});

test('@unityMessages: the class calls Unity-named methods of its subclasses -> [TsUnityMessages]', () => {
    const r = gen({
        'db://us/Behaviour': `
            import { _decorator, Component } from 'cc';
            const { ccclass } = _decorator;
            /**
             * Calls Awake, Update...
             * @unityMessages
             */
            @ccclass('us.Behaviour')
            export class Behaviour extends Component {}
            export class Plain extends Component {}
        `,
    });
    assert.ok(/\[global::cc\.TsCcclass\("us\.Behaviour"\)\] \[global::cc\.TsUnityMessages\] public partial class Behaviour : global::cc\.Component/.test(r.code), r.code);
    assert.ok(/\] public partial class Plain : global::cc\.Component/.test(r.code) && !/TsUnityMessages\] public partial class Plain/.test(r.code));
    assert.ok(r.report.some((l) => /note: Ext\.Us\.Behaviour handles Unity messages/.test(l)));
});

test('exclude list: globs and folders, against db urls and project paths', () => {
    assert.ok(globToRegExp('**/Editor/**').test('db://assets/Scripts/Editor/Tool.ts'));
    assert.ok(isExcluded(['db://input-system/**'], 'db://input-system/core/actions.ts', 'extensions/input-system/assets/core/actions.ts'));
    assert.ok(isExcluded(['assets/Legacy'], 'db://assets/Legacy/Old.ts', 'assets/Legacy/Old.ts'), 'a folder without wildcards');
    assert.ok(isExcluded(['db://assets/Scripts/Old.ts'], 'db://assets/Scripts/Old.ts', 'assets/Scripts/Old.ts'), 'an exact file');
    assert.ok(isExcluded(['*.gen.ts'], 'db://assets/a.gen.ts', 'assets/a.gen.ts') === false, '* does not cross folders');
    assert.ok(isExcluded(['**/*.gen.ts'], 'db://assets/a.gen.ts', 'assets/a.gen.ts'));
    assert.ok(!isExcluded(['', '  '], 'db://assets/a.ts', 'assets/a.ts'));
    assert.ok(!isExcluded(['assets/Legacy'], 'db://assets/LegacyNot/A.ts', 'assets/LegacyNot/A.ts'));
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exitCode = results.failed ? 1 : 0;
