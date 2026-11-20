import assert from 'assert';
import { test, results } from './harness';
import { generateBindings } from '../source/bindings/generate';
import {
    classNameFromFile,
    componentTemplate,
    csprojText,
    formatDiagnostic,
    isAssetsCs,
    renamedTemplate,
    targetFrameworkFromSdks,
    toDbUrl,
    tsUrlOf,
} from '../source/shared/scripts';

test('paths: .cs <-> .ts, db urls', () => {
    assert.strictEqual(tsUrlOf('db://assets/Scripts/Player.cs'), 'db://assets/Scripts/Player.ts');
    assert.ok(isAssetsCs('db://assets/a/B.cs'));
    assert.ok(!isAssetsCs('db://internal/a/B.cs'));
    assert.ok(!isAssetsCs('db://assets/a/B.ts'));
    assert.strictEqual(toDbUrl('E:\\Proj', 'E:\\Proj\\assets\\Scripts\\A.ts'), 'db://assets/Scripts/A.ts');
    assert.strictEqual(toDbUrl('E:/Proj/', 'e:/proj/assets/A.ts'), 'db://assets/A.ts');
    assert.strictEqual(toDbUrl('E:/Proj', 'E:/Other/assets/A.ts'), null);
});

test('class names from file names; templates follow a rename', () => {
    assert.strictEqual(classNameFromFile('Player.cs'), 'Player');
    assert.strictEqual(classNameFromFile('my enemy-2.cs'), 'myEnemy2');
    assert.strictEqual(classNameFromFile('2d.cs'), '_2d');
    const t = componentTemplate('NewComponent');
    assert.ok(!t.includes('ccclass') && t.includes('public class NewComponent : Component'), 'no [ccclass]: it is automatic');
    assert.ok(t.includes('public double speed = 1;') && t.includes('protected override void update(double dt)'), 'a public field example and update');
    assert.strictEqual(renamedTemplate(t, 'NewComponent.cs', 'Player.cs'), componentTemplate('Player'));
    assert.strictEqual(renamedTemplate(t.replace(/\n/g, '\r\n'), 'NewComponent.cs', 'Player.cs'), componentTemplate('Player'), 'CRLF');
    assert.strictEqual(renamedTemplate(t + '// edited', 'NewComponent.cs', 'Player.cs'), null, 'edited scripts keep their code');
    assert.strictEqual(renamedTemplate(t, 'NewComponent.cs', 'NewComponent.cs'), null);
});

test('IDE project and diagnostics text', () => {
    const p = csprojText({ projectRoot: 'E:/Proj', bindingsDll: 'E:/Proj/extensions/csharp/tool/bin/Cocos.Bindings.dll', globalUsings: 'E:/Proj/temp/csharp/GlobalUsings.g.cs', targetFramework: 'net9.0' });
    assert.ok(p.includes('<Compile Include="assets/**/*.cs" />'));
    assert.ok(p.includes('<HintPath>extensions/csharp/tool/bin/Cocos.Bindings.dll</HintPath>'), 'relative inside the project');
    assert.ok(p.includes('temp/csharp/GlobalUsings.g.cs'));
    assert.ok(p.includes(`<Compile Include="temp/csharp/TsBindings.g.cs" Link="TsBindings.g.cs" Condition="Exists('temp/csharp/TsBindings.g.cs')" />`), 'the TS interop stubs');
    const g = csprojText({ projectRoot: 'E:/Proj', bindingsDll: 'C:/Users/u/.CocosCreator/extensions/csharp/tool/bin/Cocos.Bindings.dll', globalUsings: 'E:/Proj/temp/csharp/GlobalUsings.g.cs', targetFramework: 'net9.0' });
    assert.ok(g.includes('<HintPath>C:/Users/u/.CocosCreator/'), 'absolute outside');
    assert.strictEqual(targetFrameworkFromSdks('9.0.315 [C:\\sdk]\n10.0.201 [C:\\sdk]'), 'net9.0');
    assert.strictEqual(formatDiagnostic({ file: 'assets/A.cs', line: 3, column: 5, severity: 'error', code: 'CS0103', message: 'x' }), 'assets/A.cs(3,5): error CS0103: x');
});

const DTS = `
declare module "cc" {
    export class CCObject { name: string; constructor(name?: string); destroy(): boolean; }
    export class Component extends CCObject {
        get node(): Node;
        set node(v: Node);
        protected start?(): void;
        protected update?(dt: number): void;
        getComponent<T extends Component>(classConstructor: __private._types_globals__Constructor<T>): T | null;
        getComponent(className: string): Component | null;
        schedule(callback: any, interval?: number): void;
    }
    export class Node extends CCObject {
        static EventType: typeof NodeEventType;
        setPosition(position: Readonly<math.Vec3>): void;
        setPosition(x: number, y: number, z?: number): void;
        removeChild(child: this | Node): void;
        on(type: string | NodeEventType, callback: Function, target?: unknown): void;
        get children(): Node[];
    }
    export enum NodeEventType { TOUCH_START = "touch-start" }
    export enum KeyCode { NONE, KEY_A = 65 }
    export namespace math {
        export class Vec3 {
            x: number;
            constructor(x?: number);
            static add<Out extends IVec3Like>(out: Out, a: IVec3Like, b: IVec3Like): Out;
        }
        export interface IVec3Like { x: number; }
        export function lerp(from: number, to: number, ratio: number): number;
    }
    export import Vec3 = math.Vec3;
    export import IVec3Like = math.IVec3Like;
    export import lerp = math.lerp;
    export const EventTarget: new (...args: any[]) => __private.Empty & __private.IEventified;
    export const director: Director;
    export class Director extends EventTarget { getScene(): Node | null; }
    export const sys: { isMobile: boolean; os: string };
    export function instantiate<T>(original: T): T;
    export function tween<T extends object = any>(target?: T): Tween<T>;
    export class Tween<T extends object = any> { to(duration: number, props: any): Tween<T>; start(): Tween<T>; }
    export namespace __private {
        export class Empty {}
        export interface IEventified { on(type: string, callback: Function): void; emit(type: string, ...args: any[]): void; }
        export type _types_globals__Constructor<T = unknown> = new (...args: any[]) => T;
    }
}
`;

test('bindings: names, numbers, overloads, globals', () => {
    const r = generateBindings(DTS);
    const c = r.code;
    assert.ok(/\n    public partial class Vec3 /.test(c), 'Vec3 moves to cc (export import)');
    assert.ok(!/class math[\s\S]*class Vec3/.test(c.slice(c.indexOf('static partial class math'), c.indexOf('static partial class math') + 400)), 'and leaves math');
    assert.ok(c.includes('public partial class Vec3 : global::cc.IVec3Like'), 'structural implements');
    assert.ok(c.includes('public static Out add<Out>(Out @out, global::cc.IVec3Like a, global::cc.IVec3Like b) where Out : global::cc.IVec3Like'), 'generic constraint on the method, @out escaped');
    assert.ok(c.includes('public static double lerp(double from, double to, double ratio)'), 'number -> double; lerp copied to Globals');
    assert.ok(c.includes('protected virtual void start() { }'), 'optional lifecycle methods, overridable');
    assert.ok(c.includes('protected virtual void update(double dt) { }'));
    assert.ok(c.includes('[global::cc.TsCtorArg(0, 0)] public virtual T getComponent<T>() where T : global::cc.Component => throw null;'), 'getComponent<T>()');
    assert.ok(c.includes('public virtual global::cc.Component getComponent(string className)'));
    assert.ok(c.includes('public virtual void schedule(global::System.Delegate callback, double interval = default)'), 'callback: any -> Delegate');
    assert.ok(c.includes('public virtual void setPosition(global::cc.Vec3 position)') && c.includes('public virtual void setPosition(double x, double y, double z = default)'), 'overloads');
    assert.strictEqual((c.match(/void removeChild\(/g) || []).length, 1, 'this | Node is one overload');
    assert.ok(c.includes('public virtual void on(string type, global::System.Delegate callback, object target = default)'), 'union of string and string enum -> string');
    assert.ok(c.includes('[global::cc.TsStringEnum] public static partial class EventType'), 'Node.EventType copy of a string enum');
    assert.ok(c.includes('public const string TOUCH_START = "touch-start";'));
    assert.ok(/public enum KeyCode\s*\{\s*NONE = 0,\s*KEY_A = 65,/.test(c), 'numeric enum');
    assert.ok(c.includes('public partial class EventTarget : global::cc.__private.Empty'), 'mixin constructor -> class');
    assert.ok(/class EventTarget[^{]*\{[\s\S]*?public virtual void on\(string type, global::System.Delegate callback\)/.test(c), 'mixin members are real members');
    assert.ok(c.includes('public partial class Director : global::cc.EventTarget'));
    assert.ok(c.includes('public static global::cc.Director director { get => throw null; }'));
    assert.ok(c.includes('public sealed partial class sys_t') && c.includes('public static sys_t sys'), 'object literal const -> class');
    assert.ok(c.includes('public static T instantiate<T>(T original)'));
    assert.ok(c.includes('public static global::cc.Tween<T> tween<T>(T target = default)'));
    assert.ok(c.includes('public partial class Tween<T>'), 'no constraints on generic types');
    assert.ok(c.includes('public virtual global::cc.Node[] children { get => throw null; }'), 'get-only accessor');
    assert.ok(r.stats.classes >= 8 && r.stats.skipped === 0, JSON.stringify(r.stats) + ' ' + r.report.join('; '));
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exit(1);
