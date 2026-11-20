/**
 * TS interop: C# stubs of the TypeScript the project already has, so C# scripts can use it.
 *
 * Inputs are modules (db://assets/... and db://<extension>/...) with their text. Only exported
 * declarations are bound: classes (components too), interfaces, enums, functions, consts/lets;
 * type aliases are resolved where they are used. `export *` / `export { x } from` barrels are
 * followed, and an extension declaration is imported from the extension's index module when it
 * re-exports it (that is how scripts import extension runtimes, and it loads their side effects).
 *
 * Output: one C# file of declarations, each carrying [TsModule("<module>", Export = "...")] so the
 * transpiler emits the right import. Namespaces, like Unity's:
 * - the project's TypeScript: the global namespace (like the project's own C# classes), its functions
 *   and variables in ProjectExports (a global `using static`);
 * - each extension: Ext.<Package> (Ext.TweenPro), its functions and variables in Ext.<Package>.Exports;
 *   never a global using: scripts write `using Ext.TweenPro;`;
 * - a name two modules of one db export (or a project function named like a cc one) moves to its
 *   folder's namespace (Project.Scripts.Ui, Ext.VirtualCamera.Core).
 * Types that can't be mapped become dynamic; nothing here throws on odd TypeScript.
 * Mapping rules follow generate.ts: number -> double, any -> dynamic, unions in parameters ->
 * overloads, callbacks -> Action/Func, `callback: any` -> System.Delegate.
 */
import * as ts from 'typescript';

// ------------------------------------------------------------------ Cocos names (from Cocos.g.cs)
export interface CcType {
    arity: number;
    kind: 'class' | 'interface' | 'enum' | 'stringEnum' | 'any' | 'enumAlias';
}

export interface CcNames {
    /** Dotted TypeScript path below 'cc' -> info: "Node", "Node.EventType", "gfx.Texture". */
    types: Map<string, CcType>;
    /** Members of cc.Globals (director, tween, log...). */
    globals: Set<string>;
}

/** Reads the type names and globals out of the generated Cocos bindings (indentation-based). */
export function parseCcNames(cocosGcs: string): CcNames {
    const types = new Map<string, CcType>();
    const globals = new Set<string>();
    const stack: string[] = [];
    const typeRe = /^( *)(?:\[[^\]]*\]\s*)*public\s+(?:(?:static|abstract|sealed|partial)\s+)*(class|interface|enum)\s+@?(\w+)(?:<([^>]*)>)?/;
    const tsNameRe = /TsName\("([^"]+)"\)/;
    const lines = cocosGcs.split('\n');
    for (const line of lines) {
        const m = typeRe.exec(line);
        if (m) {
            const level = Math.floor(m[1].length / 4);
            if (level < 1) continue;
            const tn = tsNameRe.exec(line);
            const name = tn ? tn[1] : m[3];
            stack.length = level - 1;
            stack[level - 1] = name;
            const kind: CcType['kind'] = /TsStringEnum/.test(line) ? 'stringEnum' : /TsAny/.test(line) ? 'any' : /TsEnumAlias/.test(line) ? 'enumAlias' : (m[2] as any);
            types.set(stack.join('.'), { arity: m[4] ? m[4].split(',').length : 0, kind });
            continue;
        }
        // members of Globals (level 2 inside "Globals")
        if (stack.length >= 1 && stack[0] === 'Globals' && /^ {8}(?:\[[^\]]*\]\s*)*public static /.test(line)) {
            const tn = tsNameRe.exec(line);
            const g = /public static .*? @?(\w+)(?:<[^>]*>)?(?:\(| \{)/.exec(line);
            if (g) globals.add(tn ? tn[1] : g[1]);
        }
    }
    return { types, globals };
}

// ------------------------------------------------------------------ inputs
export interface InteropModule {
    /** db://assets/Scripts/Foo, db://input-system/core/actions (no extension). */
    id: string;
    text: string;
}

export interface InteropResult {
    code: string;
    report: string[];
    stats: InteropStats;
}

export interface InteropStats {
    modules: number;
    exports: number;
    bound: number;
    partial: number;
    skipped: number;
    clashes: number;
    /** Exported decorators bound as C# attributes, and those with parameters or options left out. */
    decorators: number;
    decoratorsPartial: number;
    /** Decorators duplicating a csharp built-in attribute (same name, same Cocos meaning): not bound as attributes. */
    decoratorsDuplicate: number;
}

type DeclKind = 'class' | 'interface' | 'enum' | 'alias' | 'function' | 'var';

interface Decl {
    mod: Mod;
    name: string;
    kind: DeclKind;
    nodes: ts.Node[];
    isConst?: boolean;
    /** For `var`: the variable declaration. */
    varDecl?: ts.VariableDeclaration;
}

interface ImportBinding {
    from: string | 'cc' | null; // module id, 'cc', or unresolved
    name: string; // exported name, 'default', or '*'
}

interface Mod {
    id: string;
    sf: ts.SourceFile;
    locals: Map<string, Decl>;
    imports: Map<string, ImportBinding>;
    /** exported name -> local name */
    exportsOwn: Map<string, string>;
    reexports: { from: string | null; names: Map<string, string> | null }[];
    /** Names exported with `export type { X }`: no value at runtime. */
    typeOnly: Set<string>;
}

interface Bound {
    decl: Decl;
    /** The module and exported name C# imports it with. */
    module: string;
    exportName: string;
    /** C# simple name. */
    csName: string;
    /** C# namespace ('' for the global namespace, Ext.TweenPro, Project.Scripts.Ui...). */
    ns: string;
    /** For functions/vars: the static class holding them. */
    holder?: string;
    /** A decorator bound as an attribute class (csName ends with Attribute). */
    deco?: DecoInfo;
}

/** What an exported decorator decorates. */
interface DecoTargets {
    field: boolean;
    method: boolean;
    cls: boolean;
}

/** A value as a decorator: usable bare (`@x`), as a factory (`@x(...)`), or both. */
interface DecoValue {
    bare: DecoTargets | null;
    factory: { params: ts.ParameterDeclaration[]; targets: DecoTargets } | null;
}

interface DecoInfo {
    bare: boolean;
    params: ts.ParameterDeclaration[];
    targets: DecoTargets;
    declaresProperty: boolean;
    repeatable: boolean;
}

const CS_KEYWORDS = new Set(
    'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while'.split(' ')
);

/** On parameters / properties typed with a string enum: the transpiler casts plain strings passed to them. */
const STRING_ENUM_MARK = '[global::cc.TsStringEnum] ';

/** cc.Component lifecycle methods (protected virtual in the bindings). */
const LIFECYCLE = new Set(['__preload', 'onLoad', 'start', 'update', 'lateUpdate', 'onEnable', 'onDisable', 'onDestroy', 'onFocusInEditor', 'onLostFocusInEditor', 'resetInEditor', 'onRestore']);

/** Attribute names C# scripts already use from System: a TS decorator with one of them moves to its folder namespace. */
const SYSTEM_ATTRIBUTES = ['ObsoleteAttribute', 'SerializableAttribute', 'NonSerializedAttribute', 'FlagsAttribute', 'AttributeUsageAttribute', 'ConditionalAttribute'];

/**
 * The csharp extension's own attributes (Lang.cs; Serializable / NonSerialized are System's, which
 * the transpiler reads), with the cc `_decorator` members that carry the same meaning. A TS decorator
 * named like one of them that uses one of those members (unity-style's `Tooltip(t)` is
 * `_decorator.tooltip(t)`) duplicates it: it is not bound as an attribute, so `[Tooltip]` next to
 * `using Ext.UnityStyle;` stays csharp's own instead of being ambiguous (CS0104). An empty list:
 * the built-in adds no Cocos decorator, and neither may the TS one (an inert decorator).
 * A decorator of the same name with another meaning (advanced-inspector's `readOnly`, its own
 * Inspector metadata) stays bound, and ambiguous: the user picks one.
 */
const BUILTIN_ATTRIBUTES: Record<string, string[]> = {
    SerializeFieldAttribute: ['property'],
    PropertyAttribute: ['property'],
    HideInInspectorAttribute: ['visible'],
    VisibleAttribute: ['visible'],
    TooltipAttribute: ['tooltip'],
    RangeAttribute: ['range'],
    MinAttribute: ['rangeMin'],
    MaxAttribute: ['rangeMax'],
    StepAttribute: ['rangeStep'],
    SlideAttribute: ['slide'],
    DisplayNameAttribute: ['displayName'],
    DisplayOrderAttribute: ['displayOrder'],
    MultilineAttribute: ['multiline'],
    ReadOnlyAttribute: ['readonly'],
    TypeAttribute: ['type'],
    FormerlySerializedAsAttribute: ['formerlySerializedAs'],
    EditorOnlyAttribute: ['editorOnly'],
    UnitAttribute: ['unit'],
    RadianAttribute: ['radian'],
    AnimatableAttribute: ['animatable'],
    MenuAttribute: ['menu'],
    ExecuteInEditModeAttribute: ['executeInEditMode'],
    RequireComponentAttribute: ['requireComponent'],
    ExecutionOrderAttribute: ['executionOrder'],
    DisallowMultipleAttribute: ['disallowMultiple'],
    PlayOnFocusAttribute: ['playOnFocus'],
    HelpAttribute: ['help'],
    IconAttribute: ['icon'],
    InspectorAttribute: ['inspector'],
    ClassNameAttribute: ['ccclass'],
    SerializableAttribute: ['ccclass'],
    NonSerializedAttribute: [],
};

/** The texts of a JSDoc tag on a declaration (`@csharp keep` -> ['keep']); empty when it has none. */
function docTag(node: ts.Node, name: string): string[] {
    const out: string[] = [];
    for (const t of ts.getJSDocTags(node)) {
        if (t.tagName.text !== name) continue;
        out.push((ts.getTextOfJSDocComment(t.comment) || '').trim());
    }
    return out;
}

/** C# types an attribute argument can have (arrays of these too). */
const ATTR_SCALARS = new Set(['string', 'double', 'bool', 'object', 'global::System.Type']);

type FnLike = ts.SignatureDeclaration & { body?: ts.Node };

function pascal(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function validIdent(n: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);
}

function csIdent(n: string): string {
    if (!validIdent(n)) {
        let id = n.replace(/[^A-Za-z0-9_]/g, (c) => '_x' + c.charCodeAt(0).toString(16) + '_');
        if (!/^[A-Za-z_]/.test(id)) id = '_' + id;
        return id;
    }
    return CS_KEYWORDS.has(n) ? '@' + n : n;
}

function lit(s: string): string {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function hasMod(node: ts.Node, kind: ts.SyntaxKind): boolean {
    const mods = (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) || [];
    return mods.some((m) => m.kind === kind);
}

function nameOf(n: ts.PropertyName | ts.BindingName | ts.EntityName | undefined): string | null {
    if (!n) return null;
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
    if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
    if (ts.isQualifiedName(n)) return nameOf(n.left) + '.' + n.right.text;
    return null;
}

/** './x' from db://a/b/c -> db://a/b/x (posix, inside the same db). */
export function resolveSpecifier(fromId: string, spec: string, exists: (id: string) => boolean): string | 'cc' | null {
    if (spec === 'cc') return 'cc';
    let target: string;
    if (spec.startsWith('db://')) target = spec.replace(/\.(ts|js)$/, '');
    else if (spec.startsWith('.')) {
        const m = /^(db:\/\/[^/]+)\/(.*)$/.exec(fromId);
        if (!m) return null;
        const parts = m[2].split('/');
        parts.pop();
        for (const seg of spec.replace(/\.(ts|js)$/, '').split('/')) {
            if (seg === '.' || seg === '') continue;
            if (seg === '..') parts.pop();
            else parts.push(seg);
        }
        target = m[1] + '/' + parts.join('/');
    } else return null;
    if (exists(target)) return target;
    if (exists(target + '/index')) return target + '/index';
    return null;
}

// ------------------------------------------------------------------ generator
class InteropGen {
    mods = new Map<string, Mod>();
    report: string[] = [];
    stats: InteropStats = { modules: 0, exports: 0, bound: 0, partial: 0, skipped: 0, clashes: 0, decorators: 0, decoratorsPartial: 0, decoratorsDuplicate: 0 };
    bound = new Map<Decl, Bound>();
    /** Decorators bound as attribute classes (besides their function / variable binding). */
    decos: Bound[] = [];
    /** Full names of the bound enums (attribute arguments may be enums). */
    enumNames = new Set<string>();
    dynamicCount = 0;
    /** The C# type of `this` while emitting a class or interface (fluent `: this` returns). */
    thisType: string | null = null;

    constructor(public cc: CcNames) {}

    // ---- parsing
    add(m: InteropModule) {
        const sf = ts.createSourceFile(m.id + '.ts', m.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        this.mods.set(m.id, { id: m.id, sf, locals: new Map(), imports: new Map(), exportsOwn: new Map(), reexports: [], typeOnly: new Set() });
    }

    parseAll() {
        const exists = (id: string) => this.mods.has(id);
        for (const mod of this.mods.values()) {
            for (const st of mod.sf.statements) {
                try {
                    this.parseStatement(mod, st, exists);
                } catch (e: any) {
                    this.report.push(mod.id + ': a statement could not be read (' + (e && e.message) + ')');
                }
            }
        }
    }

    parseStatement(mod: Mod, st: ts.Statement, exists: (id: string) => boolean) {
        const exported = hasMod(st, ts.SyntaxKind.ExportKeyword);
        const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);
        const addDecl = (name: string, kind: DeclKind, node: ts.Node, extra?: Partial<Decl>) => {
            let d = mod.locals.get(name);
            if (d && d.kind === kind) d.nodes.push(node);
            else if (!d) {
                d = Object.assign({ mod, name, kind, nodes: [node] }, extra || {}) as Decl;
                mod.locals.set(name, d);
            }
            if (exported) mod.exportsOwn.set(isDefault ? 'default' : name, name);
        };
        if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause) {
            const from = resolveSpecifier(mod.id, st.moduleSpecifier.text, exists);
            const ic = st.importClause;
            if (ic.name) mod.imports.set(ic.name.text, { from, name: 'default' });
            if (ic.namedBindings) {
                if (ts.isNamespaceImport(ic.namedBindings)) mod.imports.set(ic.namedBindings.name.text, { from, name: '*' });
                else for (const el of ic.namedBindings.elements) mod.imports.set(el.name.text, { from, name: (el.propertyName || el.name).text });
            }
            return;
        }
        if (ts.isExportDeclaration(st)) {
            const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? resolveSpecifier(mod.id, st.moduleSpecifier.text, exists) : undefined;
            if (st.exportClause && ts.isNamedExports(st.exportClause)) {
                const names = new Map<string, string>();
                for (const el of st.exportClause.elements) {
                    names.set(el.name.text, (el.propertyName || el.name).text);
                    if (st.isTypeOnly || el.isTypeOnly) mod.typeOnly.add(el.name.text);
                }
                if (from === undefined) for (const [exp, local] of names) mod.exportsOwn.set(exp, local);
                else mod.reexports.push({ from, names });
            } else if (!st.exportClause && from !== undefined) mod.reexports.push({ from, names: null });
            return;
        }
        if (ts.isExportAssignment(st)) {
            if (!st.isExportEquals && ts.isIdentifier(st.expression)) mod.exportsOwn.set('default', st.expression.text);
            return;
        }
        if (ts.isClassDeclaration(st) && st.name) return addDecl(st.name.text, 'class', st);
        if (ts.isInterfaceDeclaration(st)) return addDecl(st.name.text, 'interface', st);
        if (ts.isEnumDeclaration(st)) return addDecl(st.name.text, 'enum', st);
        if (ts.isTypeAliasDeclaration(st)) return addDecl(st.name.text, 'alias', st);
        if (ts.isFunctionDeclaration(st) && st.name) return addDecl(st.name.text, 'function', st);
        if (ts.isVariableStatement(st)) {
            const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
            for (const d of st.declarationList.declarations) {
                const n = ts.isIdentifier(d.name) ? d.name.text : null;
                if (n) addDecl(n, 'var', d, { isConst, varDecl: d });
            }
            return;
        }
        if (ts.isModuleDeclaration(st) && exported) this.report.push(mod.id + ': namespace ' + nameOf(st.name) + ' is not bound (namespaces are not supported)');
    }

    // ---- export resolution
    resolveLocal(mod: Mod, local: string, seen: Set<string>): Decl | 'cc' | null {
        const d = mod.locals.get(local);
        if (d) return d;
        const imp = mod.imports.get(local);
        if (!imp || !imp.from || imp.name === '*') return null;
        if (imp.from === 'cc') return 'cc';
        return this.resolveExport(imp.from, imp.name, seen);
    }

    resolveExport(modId: string, name: string, seen = new Set<string>()): Decl | 'cc' | null {
        const key = modId + '#' + name;
        if (seen.has(key)) return null;
        seen.add(key);
        const mod = this.mods.get(modId);
        if (!mod) return null;
        const local = mod.exportsOwn.get(name);
        if (local !== undefined) return this.resolveLocal(mod, local, seen);
        for (const re of mod.reexports) {
            if (!re.from || re.from === 'cc') continue;
            if (re.names) {
                const orig = re.names.get(name);
                if (orig !== undefined) return this.resolveExport(re.from, orig, seen);
            }
        }
        if (name !== 'default')
            for (const re of mod.reexports) {
                if (!re.from || re.from === 'cc' || re.names) continue;
                const r = this.resolveExport(re.from, name, seen);
                if (r) return r;
            }
        return null;
    }

    exportNames(modId: string, seen = new Set<string>()): Set<string> {
        const out = new Set<string>();
        if (seen.has(modId)) return out;
        seen.add(modId);
        const mod = this.mods.get(modId);
        if (!mod) return out;
        for (const n of mod.exportsOwn.keys()) out.add(n);
        for (const re of mod.reexports) {
            if (!re.from || re.from === 'cc') continue;
            if (re.names) for (const n of re.names.keys()) out.add(n);
            else for (const n of this.exportNames(re.from, seen)) if (n !== 'default') out.add(n);
        }
        return out;
    }

    // ---- choosing what to bind and how to name it
    static dbOf(id: string): string {
        const m = /^db:\/\/([^/]+)\//.exec(id);
        return m ? m[1] : '';
    }

    /** advanced-inspector -> AdvancedInspector (a C# identifier). */
    static pascalWords(s: string): string {
        let n = s
            .split(/[^A-Za-z0-9]+/)
            .filter((w) => w.length > 0)
            .map(pascal)
            .join('');
        if (!n || /^[0-9]/.test(n)) n = '_' + n;
        return n;
    }

    /** The namespace of a db's declarations: the global namespace for the project, Ext.<Package> for an extension. */
    static homeNs(module: string): string {
        const db = InteropGen.dbOf(module);
        return db === 'assets' ? '' : 'Ext.' + InteropGen.pascalWords(db);
    }

    /**
     * Where a name goes when it can't stay in its db's namespace (two modules of the db export it):
     * its folder, below Project (the project) or Ext.<Package>: Project.Scripts.Ui, Ext.VirtualCamera.Core.
     * A module at the db's root uses its file name: Project.Utils.
     */
    static fallbackNs(module: string): string {
        const m = /^db:\/\/([^/]+)\/(.*)$/.exec(module);
        const segs = m ? m[2].split('/') : ['Module'];
        const file = segs.pop() || 'Module';
        const parts = (segs.length ? segs : [file]).map((s) => InteropGen.pascalWords(s));
        return (m && m[1] !== 'assets' ? InteropGen.homeNs(module) : 'Project') + '.' + parts.join('.');
    }

    static fileStem(id: string): string {
        return InteropGen.pascalWords(id.split('/').pop() || 'Module');
    }

    static fullOf(b: Bound): string {
        return (b.ns ? b.ns + '.' : '') + (b.holder ? b.holder + '.' : '') + b.csName;
    }

    choose() {
        // every exported declaration, with the modules that export it
        const candidates = new Map<Decl, { module: string; name: string }[]>();
        for (const mod of this.mods.values()) {
            for (const exp of this.exportNames(mod.id)) {
                const d = this.resolveExport(mod.id, exp);
                if (!d || d === 'cc') continue;
                if (!candidates.has(d)) candidates.set(d, []);
                candidates.get(d)!.push({ module: mod.id, name: exp });
            }
        }
        const kinds: DeclKind[] = ['class', 'interface', 'enum', 'function', 'var'];
        for (const [d, all] of candidates) {
            let list = all;
            if (d.kind === 'alias') continue; // resolved where used
            this.stats.exports++;
            if (kinds.indexOf(d.kind) < 0) continue;
            // `export type { X }` has no value at runtime: import classes, enums, functions from elsewhere
            if (d.kind !== 'interface') list = list.filter((c) => !this.mods.get(c.module)!.typeOnly.has(c.name));
            if (!list.length) {
                this.skip(d, 'only exported with `export type`');
                continue;
            }
            const db = InteropGen.dbOf(d.mod.id);
            const index = 'db://' + db + '/index';
            let pick = db !== 'assets' ? list.find((c) => c.module === index) : undefined;
            pick = pick || list.find((c) => c.module === d.mod.id) || list.slice().sort((a, b) => a.module.length - b.module.length)[0];
            const csName = pick.name === 'default' ? d.name : pick.name;
            if (!validIdent(csName)) {
                this.skip(d, 'the name is not a C# identifier');
                continue;
            }
            this.bound.set(d, { decl: d, module: pick.module, exportName: pick.name, csName, ns: InteropGen.homeNs(pick.module) });
        }
        // decorators: also bound as attribute classes, [ShowIf(...)] for showIf
        for (const b of this.bound.values()) {
            if (b.decl.kind !== 'function' && b.decl.kind !== 'var') continue;
            let deco: DecoInfo | null = null;
            try {
                deco = this.decoratorOf(b.decl);
            } catch (e: any) {
                this.report.push(b.module + ': ' + b.csName + ': decorator analysis failed (' + (e && e.message) + ')');
            }
            if (!deco) continue;
            const base = b.exportName === 'default' ? b.decl.name : b.exportName;
            const db: Bound = { decl: b.decl, module: b.module, exportName: b.exportName, csName: pascal(base) + 'Attribute', ns: b.ns, deco };
            let same: string | null = null;
            try {
                same = this.duplicateOf(db);
            } catch (e: any) {
                this.report.push(b.module + ': ' + b.csName + ': duplicate check failed (' + (e && e.message) + ')');
            }
            if (same) {
                // csharp's own attribute does the same: binding this one would only make it ambiguous (CS0104)
                this.stats.decoratorsDuplicate++;
                const short = db.csName.replace(/Attribute$/, '');
                this.report.push(
                    'duplicate: ' + b.module + ': @' + base + ' is not bound as [' + (db.ns ? db.ns + '.' : '') + short + ']: it ' + same + ', like csharp\'s own [' + short +
                        '], which C# scripts use (JSDoc `@csharp keep` on the decorator binds it anyway)'
                );
                continue;
            }
            this.decos.push(db);
        }
        const all = () => Array.from(this.bound.values()).concat(this.decos);
        const isValue = (b: Bound) => !b.deco && (b.decl.kind === 'function' || b.decl.kind === 'var');
        const ccTypes = new Set(Array.from(this.cc.types.keys()).filter((k) => k.indexOf('.') < 0));
        const move = (b: Bound) => {
            b.ns = InteropGen.fallbackNs(b.module);
            if (isValue(b)) b.holder = InteropGen.fileStem(b.decl.mod.id) + 'Exports';
        };
        // 1. a name exported twice in one namespace: an extension's index module keeps it, the others
        //    (all of them in the project) move to their folder namespace
        const groups = new Map<string, Bound[]>();
        for (const b of all()) {
            const key = (isValue(b) ? 'v:' : 't:') + b.ns + '|' + b.csName;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(b);
        }
        for (const [, list] of groups) {
            if (list.length < 2) continue;
            this.stats.clashes++;
            const ns = list[0].ns;
            const index = 'db://' + InteropGen.dbOf(list[0].module) + '/index';
            const fromIndex = ns ? list.filter((b) => b.module === index) : [];
            for (const b of list) if (fromIndex.length !== 1 || b !== fromIndex[0]) move(b);
            this.report.push('clash: ' + list[0].csName + ' is exported by ' + list.map((b) => b.decl.mod.id).join(' and ') + ' -> ' + list.map(InteropGen.fullOf).join(', '));
        }
        // 2. the project's names live in the global namespace: functions next to cc's (both are
        //    `using static`) would be ambiguous, and Ext / Project / ProjectExports are taken
        for (const b of all()) {
            if (b.ns !== '') continue;
            if (isValue(b) && this.cc.globals.has(b.csName)) {
                this.stats.clashes++;
                move(b);
                this.report.push('clash: ' + b.csName + ' is also a cc function (both would be `using static`) -> ' + InteropGen.fullOf(b));
            } else if (!isValue(b) && (b.csName === 'Ext' || b.csName === 'Project' || b.csName === 'ProjectExports')) {
                this.stats.clashes++;
                move(b);
                this.report.push('clash: ' + b.csName + ' is a namespace or class of the TS interop -> ' + InteropGen.fullOf(b));
            } else if (!isValue(b) && (ccTypes.has(b.csName) || SYSTEM_ATTRIBUTES.indexOf(b.csName) >= 0)) {
                const owner = ccTypes.has(b.csName) ? 'cc.' : 'System.';
                this.report.push('note: the project\'s ' + b.csName + ' hides ' + owner + b.csName + ' in C# (your own names win, as with C# classes); write ' + owner + b.csName + ' for the other one');
            }
        }
        // the same qualified name twice (same folder): keep the first
        for (const b of all()) if (isValue(b) && !b.holder) b.holder = b.ns === '' ? 'ProjectExports' : 'Exports';
        const seen = new Set<string>();
        for (const b of Array.from(this.bound.values())) {
            const full = InteropGen.fullOf(b);
            if (seen.has(full)) {
                this.bound.delete(b.decl);
                this.skip(b.decl, 'another module in the same folder exports the same name');
            } else seen.add(full);
        }
        this.decos = this.decos.filter((b) => {
            const full = InteropGen.fullOf(b);
            if (seen.has(full) || !this.bound.has(b.decl)) {
                this.report.push(b.module + ': [' + b.csName.replace(/Attribute$/, '') + '] skipped: another declaration has the same name');
                return false;
            }
            seen.add(full);
            return true;
        });
        // 3. an extension exporting a type named Exports: its functions go to <Package>Exports
        const typeFull = new Set(all().filter((b) => !isValue(b)).map(InteropGen.fullOf));
        for (const b of all()) {
            if (!isValue(b) || b.holder !== 'Exports' || !typeFull.has(b.ns + '.Exports')) continue;
            b.holder = b.ns.split('.').pop() + 'Exports';
            this.report.push('note: ' + b.ns + ' exports a type named Exports: ' + b.csName + ' is in ' + b.ns + '.' + b.holder);
        }
        // 4. a namespace named like a type of its parent (C# forbids it): the namespace gets a _
        for (const b of all()) {
            const segs = b.ns ? b.ns.split('.') : [];
            for (let i = 2; i < segs.length; i++) if (typeFull.has(segs.slice(0, i).join('.') + '.' + segs[i])) segs[i] += '_';
            b.ns = segs.join('.');
        }
        // 5. extension names Cocos has too: ambiguous (CS0104) where both namespaces are used
        for (const b of all()) {
            if (!b.ns.startsWith('Ext.') || isValue(b) || !ccTypes.has(b.csName)) continue;
            const short = b.deco ? b.csName.replace(/Attribute$/, '') : b.csName;
            const recipe = b.deco
                ? '[' + b.ns + '.' + short + '], or `using X = ' + b.ns + ';` then [X.' + short + ']'
                : b.ns + '.' + short + ', or add `using ' + short + ' = ' + b.ns + '.' + short + ';`';
            this.report.push('note: ' + b.ns + '.' + b.csName + ' is also cc.' + b.csName + ': next to `using ' + b.ns + ';` write ' + recipe);
        }
    }

    skip(d: Decl, why: string) {
        this.stats.skipped++;
        this.report.push(d.mod.id + ': ' + d.name + ' skipped: ' + why);
    }

    // ---- decorators (static analysis of the declarations and of what the functions return)
    /** An exported function / variable as a decorator, or null when it isn't one. */
    decoratorOf(d: Decl): DecoInfo | null {
        const v = this.declValue(d, 0, new Set());
        if (!v || (!v.bare && !v.factory)) return null;
        let bare = false;
        let params: ts.ParameterDeclaration[] = [];
        let targets: DecoTargets;
        // usable both ways without arguments (`@readOnly` / `@readOnly()`): the bare form
        if (v.factory && (v.factory.params.length > 0 || !v.bare)) {
            params = v.factory.params;
            targets = v.factory.targets;
        } else {
            bare = true;
            targets = v.bare!;
        }
        const own: ts.Node[] = d.kind === 'function' ? d.nodes : d.varDecl && d.varDecl.initializer ? [d.varDecl.initializer] : [];
        const declaresProperty = own.some((n) => this.callsCcProperty(n, d.mod, new Set()));
        // repetition makes sense when the decorator adds to a list (`(m.list ??= []).push(...)`)
        const repeatable = !declaresProperty && own.some((n) => this.pushes(n));
        if (declaresProperty) targets = { field: targets.field, method: false, cls: false };
        if (!targets.field && !targets.method && !targets.cls) return null;
        return { bare, params, targets, declaresProperty, repeatable };
    }

    declValue(d: Decl, depth: number, seen: Set<ts.Node>): DecoValue | null {
        if (depth > 8) return null;
        if (d.kind === 'function') return this.fnValue(d.nodes as FnLike[], d.mod, depth + 1, seen);
        if (d.kind === 'var' && d.varDecl) {
            if (d.varDecl.type) return this.typeValue(d.varDecl.type, d.mod, depth + 1);
            return d.varDecl.initializer ? this.valueOf(d.varDecl.initializer, d.mod, depth + 1, null, seen) : null;
        }
        return null;
    }

    /** A function (or its overloads) as a decorator: bare when its signature is one, a factory when it returns one. */
    fnValue(nodes: FnLike[], mod: Mod, depth: number, seen: Set<ts.Node>): DecoValue | null {
        if (depth > 8 || !nodes.length || seen.has(nodes[0])) return null;
        seen.add(nodes[0]);
        const withBody = nodes.filter((n) => !!n.body);
        const sigs = withBody.length && withBody.length < nodes.length ? nodes.filter((n) => !n.body) : nodes;
        let bare: DecoTargets | null = null;
        let factory: DecoValue['factory'] = null;
        for (const s of sigs) {
            const tps = new Set(this.typeParamsOf(s));
            const params = s.parameters.filter((p) => nameOf(p.name) !== 'this');
            const shape = this.sigShape(params, s.type, tps);
            if (shape && this.returnsNothing(s, shape, params, tps)) {
                bare = bare ? { field: bare.field || shape.field, method: bare.method || shape.method, cls: bare.cls || shape.cls } : shape;
                continue;
            }
            const r = this.resultValue(s, mod, depth + 1, seen);
            if (r && r.bare && !factory) factory = { params, targets: r.bare };
        }
        seen.delete(nodes[0]);
        return bare || factory ? { bare, factory } : null;
    }

    /** What calling the signature gives, as a decorator value (its return type, else what it returns). */
    resultValue(s: FnLike, mod: Mod, depth: number, seen: Set<ts.Node>): DecoValue | null {
        if (depth > 8) return null;
        if (s.type) return this.typeValue(s.type, mod, depth + 1);
        if (!s.body) return null;
        if (!ts.isBlock(s.body)) return this.valueOf(s.body as ts.Expression, mod, depth + 1, null, seen);
        const returns: ts.Expression[] = [];
        const visit = (n: ts.Node) => {
            if (ts.isFunctionLike(n)) return;
            if (ts.isReturnStatement(n) && n.expression) returns.push(n.expression);
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(s.body, visit);
        for (const e of returns) {
            const v = this.valueOf(e, mod, depth + 1, s.body as ts.Block, seen);
            if (v) return v;
        }
        return null;
    }

    valueOf(e: ts.Expression, mod: Mod, depth: number, scope: ts.Block | null, seen: Set<ts.Node>): DecoValue | null {
        if (depth > 8) return null;
        if (ts.isParenthesizedExpression(e)) return this.valueOf(e.expression, mod, depth + 1, scope, seen);
        if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) return this.typeValue(e.type, mod, depth + 1) || this.valueOf(e.expression, mod, depth + 1, scope, seen);
        if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return this.fnValue([e], mod, depth + 1, seen);
        if (ts.isIdentifier(e)) {
            const fns = this.functionsNamed(e.text, scope, mod);
            if (fns) return this.fnValue(fns, mod, depth + 1, seen);
            const local = scope ? this.localVar(e.text, scope) : null;
            if (local) return local.type ? this.typeValue(local.type, mod, depth + 1) : local.initializer ? this.valueOf(local.initializer, mod, depth + 1, scope, seen) : null;
            const d = this.resolveLocal(mod, e.text, new Set());
            return d && d !== 'cc' ? this.declValue(d, depth + 1, seen) : null;
        }
        if (ts.isCallExpression(e)) {
            // Object.assign(fn, { ...constants }): the function, with extra members (unity-style's Space)
            if (ts.isPropertyAccessExpression(e.expression) && ts.isIdentifier(e.expression.expression) && e.expression.expression.text === 'Object' && e.expression.name.text === 'assign' && e.arguments.length > 0)
                return this.valueOf(e.arguments[0], mod, depth + 1, scope, seen);
            // what the callee returns
            let fns: FnLike[] | null = null;
            let fmod = mod;
            if (ts.isIdentifier(e.expression)) {
                fns = this.functionsNamed(e.expression.text, scope, mod);
                if (!fns) {
                    const d = this.resolveLocal(mod, e.expression.text, new Set());
                    if (d && d !== 'cc' && d.kind === 'function') {
                        fns = d.nodes as FnLike[];
                        fmod = d.mod;
                    } else if (d && d !== 'cc' && d.kind === 'var' && d.varDecl && d.varDecl.initializer && (ts.isArrowFunction(d.varDecl.initializer) || ts.isFunctionExpression(d.varDecl.initializer))) {
                        fns = [d.varDecl.initializer];
                        fmod = d.mod;
                    }
                }
            } else if (ts.isArrowFunction(e.expression) || ts.isFunctionExpression(e.expression)) fns = [e.expression];
            if (!fns || seen.has(fns[0])) return null;
            const withBody = fns.filter((n) => !!n.body);
            const sigs = withBody.length && withBody.length < fns.length ? fns.filter((n) => !n.body) : fns;
            seen.add(fns[0]);
            try {
                for (const s of sigs) {
                    const r = this.resultValue(s, fmod, depth + 1, seen);
                    if (r) return r;
                }
            } finally {
                seen.delete(fns[0]);
            }
        }
        return null;
    }

    /** Function declarations named `name` in a function body, else at the module's top level. */
    functionsNamed(name: string, scope: ts.Block | null, mod: Mod): FnLike[] | null {
        if (scope) {
            const inScope = scope.statements.filter((s) => ts.isFunctionDeclaration(s) && !!s.name && s.name.text === name) as FnLike[];
            if (inScope.length) return inScope;
        }
        const d = mod.locals.get(name);
        return d && d.kind === 'function' ? (d.nodes as FnLike[]) : null;
    }

    localVar(name: string, scope: ts.Block): ts.VariableDeclaration | null {
        for (const s of scope.statements) {
            if (!ts.isVariableStatement(s)) continue;
            for (const v of s.declarationList.declarations) if (ts.isIdentifier(v.name) && v.name.text === name) return v;
        }
        return null;
    }

    /** A type as a decorator value: `(target, key) => void`, aliases of it, Property/Method/ClassDecorator. */
    typeValue(t: ts.TypeNode | undefined, mod: Mod, depth: number): DecoValue | null {
        if (!t || depth > 8) return null;
        if (ts.isParenthesizedTypeNode(t)) return this.typeValue(t.type, mod, depth + 1);
        if (ts.isFunctionTypeNode(t)) return this.fnValue([t], mod, depth + 1, new Set());
        if (ts.isTypeLiteralNode(t)) {
            const calls = t.members.filter((m) => ts.isCallSignatureDeclaration(m)) as FnLike[];
            return calls.length ? this.fnValue(calls, mod, depth + 1, new Set()) : null;
        }
        if (ts.isTypeReferenceNode(t)) {
            const n = nameOf(t.typeName) || '';
            if (n === 'PropertyDecorator') return { bare: { field: true, method: true, cls: false }, factory: null };
            if (n === 'MethodDecorator') return { bare: { field: false, method: true, cls: false }, factory: null };
            if (n === 'ClassDecorator') return { bare: { field: false, method: false, cls: true }, factory: null };
            const found = this.lookupType(mod, n);
            if (!found || !found.decl) return null;
            const d = found.decl;
            if (d.kind === 'alias') return this.typeValue((d.nodes[0] as ts.TypeAliasDeclaration).type, d.mod, depth + 1);
            if (d.kind === 'interface') {
                const calls: FnLike[] = [];
                for (const node of d.nodes) for (const m of (node as ts.InterfaceDeclaration).members) if (ts.isCallSignatureDeclaration(m)) calls.push(m);
                return calls.length ? this.fnValue(calls, d.mod, depth + 1, new Set()) : null;
            }
        }
        return null;
    }

    /** (target, key, descriptor?) -> a member decorator; (ctor) -> a class decorator. */
    sigShape(params: ts.ParameterDeclaration[], ret: ts.TypeNode | undefined, tps: Set<string>): DecoTargets | null {
        if (params.some((p) => !!p.dotDotDotToken || !!p.initializer)) return null;
        const kw = (t: ts.TypeNode | undefined, kinds: ts.SyntaxKind[]) => !!t && kinds.indexOf(t.kind) >= 0;
        const refName = (t: ts.TypeNode | undefined) => (t && ts.isTypeReferenceNode(t) ? nameOf(t.typeName) || '' : '');
        const loose = [ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.ObjectKeyword];
        const targetLike = (t?: ts.TypeNode) => !t || kw(t, loose) || ['Object', 'Function', 'Record'].indexOf(refName(t)) >= 0 || tps.has(refName(t)) || (ts.isTypeLiteralNode(t) && t.members.length === 0);
        const keyLike = (t?: ts.TypeNode): boolean =>
            !t ||
            kw(t, [ts.SyntaxKind.StringKeyword, ts.SyntaxKind.SymbolKeyword, ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.UnknownKeyword]) ||
            refName(t) === 'PropertyKey' ||
            (ts.isTypeOperatorNode(t) && t.operator === ts.SyntaxKind.KeyOfKeyword) ||
            (ts.isUnionTypeNode(t) && t.types.every((x) => keyLike(x)));
        const descriptorLike = (t?: ts.TypeNode) => !t || kw(t, loose) || ['PropertyDescriptor', 'TypedPropertyDescriptor', 'Object'].indexOf(refName(t)) >= 0;
        if (params.length === 2 || params.length === 3) {
            if (!targetLike(params[0].type) || !keyLike(params[1].type)) return null;
            if (params.length === 3 && !descriptorLike(params[2].type)) return null;
            if (ret && !this.voidLike(ret) && !descriptorLike(ret)) return null;
            const fieldOk = params.length === 2 || !!params[2].questionToken;
            return { field: fieldOk, method: true, cls: false };
        }
        if (params.length === 1) {
            const p = params[0];
            const t = p.type;
            const ctorLike = t
                ? kw(t, [ts.SyntaxKind.AnyKeyword]) || refName(t) === 'Function' || /Constructor|Ctor|Class/.test(refName(t)) || tps.has(refName(t)) || ts.isConstructorTypeNode(t) || ts.isTypeQueryNode(t) || (ts.isTypeLiteralNode(t) && t.members.some((m) => ts.isConstructSignatureDeclaration(m)))
                : /^(target|ctor|constructor|cls|clazz|klass)$/i.test(nameOf(p.name) || '');
            if (!ctorLike) return null;
            if (ret && !this.voidLike(ret) && !tps.has(refName(ret))) return null;
            return { field: false, method: false, cls: true };
        }
        return null;
    }

    voidLike(t: ts.TypeNode): boolean {
        return t.kind === ts.SyntaxKind.VoidKeyword || t.kind === ts.SyntaxKind.UndefinedKeyword || t.kind === ts.SyntaxKind.AnyKeyword;
    }

    /** A decorator signature's result is ignored: void, nothing returned, or (class decorators) the class itself. */
    returnsNothing(s: FnLike, shape: DecoTargets, params: ts.ParameterDeclaration[], tps: Set<string>): boolean {
        if (s.type) return this.voidLike(s.type) || (shape.cls && ts.isTypeReferenceNode(s.type) && tps.has(nameOf(s.type.typeName) || ''));
        if (!s.body || !ts.isBlock(s.body)) return false;
        const self = shape.cls && params[0] ? nameOf(params[0].name) : null;
        let value = false;
        const visit = (n: ts.Node) => {
            if (value || ts.isFunctionLike(n)) return;
            if (ts.isReturnStatement(n) && n.expression && !(self && ts.isIdentifier(n.expression) && n.expression.text === self)) value = true;
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(s.body, visit);
        return !value;
    }

    /** Local names of cc's property decorator: `const { property } = _decorator` (_decorator from 'cc'). */
    ccPropertyCache = new Map<Mod, Set<string>>();
    ccPropertyNames(mod: Mod): Set<string> {
        let set = this.ccPropertyCache.get(mod);
        if (set) return set;
        set = new Set();
        for (const st of mod.sf.statements) {
            if (!ts.isVariableStatement(st)) continue;
            for (const v of st.declarationList.declarations) {
                if (!ts.isObjectBindingPattern(v.name) || !v.initializer || !this.isCcDecoratorNs(v.initializer, mod)) continue;
                for (const el of v.name.elements) {
                    const prop = el.propertyName ? nameOf(el.propertyName as ts.PropertyName) : nameOf(el.name);
                    if (prop === 'property' && ts.isIdentifier(el.name)) set.add(el.name.text);
                }
            }
        }
        this.ccPropertyCache.set(mod, set);
        return set;
    }

    /** `_decorator` imported from cc, or `cc._decorator` with `import * as cc from 'cc'`. */
    isCcDecoratorNs(e: ts.Expression, mod: Mod): boolean {
        if (ts.isIdentifier(e)) {
            const imp = mod.imports.get(e.text);
            return !!imp && imp.from === 'cc' && imp.name === '_decorator';
        }
        if (ts.isPropertyAccessExpression(e) && e.name.text === '_decorator' && ts.isIdentifier(e.expression)) {
            const imp = mod.imports.get(e.expression.text);
            return !!imp && imp.from === 'cc' && imp.name === '*';
        }
        return false;
    }

    /** Whether the code (and the module functions it calls) calls cc's property(...). */
    callsCcProperty(node: ts.Node, mod: Mod, visited: Set<ts.Node>): boolean {
        let found = false;
        const visit = (n: ts.Node) => {
            if (found) return;
            if (ts.isCallExpression(n)) {
                const c = n.expression;
                if (ts.isIdentifier(c) && this.ccPropertyNames(mod).has(c.text)) found = true;
                else if (ts.isPropertyAccessExpression(c) && c.name.text === 'property' && this.isCcDecoratorNs(c.expression, mod)) found = true;
                else if (ts.isIdentifier(c)) {
                    const d = mod.locals.get(c.text);
                    if (d && d.kind === 'function' && !visited.has(d.nodes[0])) {
                        visited.add(d.nodes[0]);
                        for (const fn of d.nodes) if (this.callsCcProperty(fn, mod, visited)) found = true;
                    }
                }
            }
            if (!found) ts.forEachChild(n, visit);
        };
        visit(node);
        return found;
    }

    /**
     * Why a decorator duplicates a csharp built-in attribute ("wraps cc's tooltip"), or null: same
     * attribute name, and the same Cocos meaning (see BUILTIN_ATTRIBUTES). JSDoc `@csharp keep` on
     * the decorator keeps it bound.
     */
    duplicateOf(b: Bound): string | null {
        const builtin = BUILTIN_ATTRIBUTES[b.csName];
        if (!builtin) return null;
        const d = b.decl;
        const own: ts.Node[] = d.kind === 'function' ? d.nodes : d.varDecl && d.varDecl.initializer ? [d.varDecl.initializer] : [];
        const docNodes: ts.Node[] = d.kind === 'function' ? d.nodes : d.varDecl ? [d.varDecl] : [];
        if (docNodes.some((n) => docTag(n, 'csharp').indexOf('keep') >= 0)) return null;
        const uses = new Set<string>();
        for (const n of own) this.ccDecoratorUses(n, d.mod, uses, new Set());
        if (!builtin.length) return uses.size === 0 && own.length > 0 && own.every((n) => this.inert(n, d.mod, new Set())) ? 'does nothing to Cocos' : null;
        const hit = builtin.filter((x) => uses.has(x));
        return hit.length ? "wraps cc's " + hit.join(', ') : null;
    }

    /** Module-level names of cc's `_decorator`: `const d: any = _decorator` (the namespace), `const { tooltip: tip } = _decorator` (members). */
    ccDecoratorAliasCache = new Map<Mod, { ns: Set<string>; members: Map<string, string> }>();
    ccDecoratorAliases(mod: Mod): { ns: Set<string>; members: Map<string, string> } {
        let a = this.ccDecoratorAliasCache.get(mod);
        if (a) return a;
        a = { ns: new Set(), members: new Map() };
        for (const st of mod.sf.statements) {
            if (!ts.isVariableStatement(st)) continue;
            for (const v of st.declarationList.declarations) {
                let init = v.initializer;
                while (init && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init) || ts.isTypeAssertionExpression(init))) init = init.expression;
                if (!init || !this.isCcDecoratorNs(init, mod)) continue;
                if (ts.isIdentifier(v.name)) a.ns.add(v.name.text);
                else if (ts.isObjectBindingPattern(v.name))
                    for (const el of v.name.elements) {
                        const prop = el.propertyName ? nameOf(el.propertyName as ts.PropertyName) : nameOf(el.name);
                        if (prop && ts.isIdentifier(el.name)) a.members.set(el.name.text, prop);
                    }
            }
        }
        this.ccDecoratorAliasCache.set(mod, a);
        return a;
    }

    /** The cc `_decorator` members the code uses (called or passed on), following the module's own functions it calls. */
    ccDecoratorUses(node: ts.Node, mod: Mod, out: Set<string>, visited: Set<ts.Node>) {
        const al = this.ccDecoratorAliases(mod);
        const visit = (n: ts.Node) => {
            if (ts.isPropertyAccessExpression(n) && (this.isCcDecoratorNs(n.expression, mod) || (ts.isIdentifier(n.expression) && al.ns.has(n.expression.text)))) out.add(n.name.text);
            else if (ts.isIdentifier(n) && al.members.has(n.text) && !(n.parent && ts.isBindingElement(n.parent))) out.add(al.members.get(n.text)!);
            if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
                const d = mod.locals.get(n.expression.text);
                if (d && d.kind === 'function' && !visited.has(d.nodes[0])) {
                    visited.add(d.nodes[0]);
                    for (const fn of d.nodes) this.ccDecoratorUses(fn, mod, out, visited);
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(node);
    }

    /** Code that changes nothing: no assignment, no `new`, no method call on an object (module functions it calls are checked too). */
    inert(node: ts.Node, mod: Mod, visited: Set<ts.Node>): boolean {
        let ok = true;
        const visit = (n: ts.Node) => {
            if (!ok) return;
            if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ok = false;
            else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) ok = false;
            else if (ts.isNewExpression(n) || ts.isDeleteExpression(n)) ok = false;
            else if (ts.isCallExpression(n)) {
                const c = n.expression;
                if (!ts.isIdentifier(c)) ok = false;
                else {
                    const d = mod.locals.get(c.text);
                    if (d && d.kind === 'function' && !visited.has(d.nodes[0])) {
                        visited.add(d.nodes[0]);
                        for (const fn of d.nodes) if (!this.inert(fn, mod, visited)) ok = false;
                    } else if (!d && mod.imports.has(c.text)) ok = false; // an imported function may do anything
                }
            }
            if (ok) ts.forEachChild(n, visit);
        };
        visit(node);
        return ok;
    }

    pushes(node: ts.Node): boolean {
        let found = false;
        const visit = (n: ts.Node) => {
            if (found) return;
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'push') found = true;
            else ts.forEachChild(n, visit);
        };
        visit(node);
        return found;
    }

    /** The options object among a factory's parameters: the last one typed as an object type (interface or literal). */
    optionsOf(params: ts.ParameterDeclaration[], mod: Mod): { index: number; members: { name: string; type?: ts.TypeNode; optional: boolean }[]; required: boolean; mod: Mod } | null {
        for (let i = params.length - 1; i >= 0; i--) {
            const p = params[i];
            if (p.dotDotDotToken) return null;
            const om = this.objectMembers(p.type, mod, 0);
            if (om) return { index: i, members: om.members, required: !p.questionToken && !p.initializer, mod: om.mod };
        }
        return null;
    }

    objectMembers(t: ts.TypeNode | undefined, mod: Mod, depth: number): { members: { name: string; type?: ts.TypeNode; optional: boolean }[]; mod: Mod } | null {
        if (!t || depth > 6) return null;
        if (ts.isParenthesizedTypeNode(t)) return this.objectMembers(t.type, mod, depth + 1);
        if (ts.isUnionTypeNode(t)) {
            const parts = t.types.filter((x) => x.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword));
            return parts.length === 1 ? this.objectMembers(parts[0], mod, depth + 1) : null;
        }
        const read = (members: ts.NodeArray<ts.TypeElement>) =>
            members.filter((m) => ts.isPropertySignature(m)).map((m) => ({ name: nameOf((m as ts.PropertySignature).name) || '', type: (m as ts.PropertySignature).type, optional: !!m.questionToken }));
        if (ts.isTypeLiteralNode(t)) return t.members.some((m) => ts.isCallSignatureDeclaration(m)) ? null : { members: read(t.members), mod };
        if (ts.isTypeReferenceNode(t)) {
            const found = this.lookupType(mod, nameOf(t.typeName) || '');
            if (!found || !found.decl) return null;
            const d = found.decl;
            if (d.kind === 'alias') return this.objectMembers((d.nodes[0] as ts.TypeAliasDeclaration).type, d.mod, depth + 1);
            if (d.kind === 'interface') {
                const members: { name: string; type?: ts.TypeNode; optional: boolean }[] = [];
                for (const node of d.nodes) {
                    const decl = node as ts.InterfaceDeclaration;
                    if (decl.members.some((m) => ts.isCallSignatureDeclaration(m))) return null;
                    for (const m of read(decl.members)) if (!members.some((x) => x.name === m.name)) members.push(m);
                }
                return { members, mod: d.mod };
            }
        }
        return null;
    }

    /** The C# type of a decorator argument: constants, typeof, enums and arrays only; null when it has none. */
    attrType(t: ts.TypeNode | undefined, mod: Mod, depth = 0): string | null {
        if (!t || depth > 8) return 'object';
        switch (t.kind) {
            case ts.SyntaxKind.StringKeyword:
                return 'string';
            case ts.SyntaxKind.NumberKeyword:
                return 'double';
            case ts.SyntaxKind.BooleanKeyword:
                return 'bool';
            case ts.SyntaxKind.AnyKeyword:
            case ts.SyntaxKind.UnknownKeyword:
            case ts.SyntaxKind.ObjectKeyword:
                return 'object';
        }
        const arrayOf = (el: string | null) => (el && (ATTR_SCALARS.has(el) || this.enumNames.has(el)) ? el + '[]' : null);
        if (ts.isParenthesizedTypeNode(t)) return this.attrType(t.type, mod, depth + 1);
        if (ts.isLiteralTypeNode(t)) {
            if (ts.isStringLiteral(t.literal)) return 'string';
            if (ts.isNumericLiteral(t.literal) || ts.isPrefixUnaryExpression(t.literal)) return 'double';
            if (t.literal.kind === ts.SyntaxKind.TrueKeyword || t.literal.kind === ts.SyntaxKind.FalseKeyword) return 'bool';
            return null;
        }
        if (ts.isTypeOperatorNode(t)) return t.operator === ts.SyntaxKind.ReadonlyKeyword ? this.attrType(t.type, mod, depth + 1) : t.operator === ts.SyntaxKind.KeyOfKeyword ? 'string' : null;
        if (ts.isArrayTypeNode(t)) return arrayOf(this.attrType(t.elementType, mod, depth + 1));
        if (ts.isUnionTypeNode(t)) {
            const parts = t.types.filter((x) => x.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword));
            const mapped = parts.map((x) => this.attrType(x, mod, depth + 1));
            if (mapped.length && mapped[0] && mapped.every((m) => m === mapped[0])) return mapped[0];
            return 'object';
        }
        if (ts.isTypeQueryNode(t) || ts.isConstructorTypeNode(t)) return 'global::System.Type';
        if (ts.isTypeReferenceNode(t)) {
            const n = nameOf(t.typeName) || '';
            if ((n === 'Array' || n === 'ReadonlyArray') && t.typeArguments && t.typeArguments.length === 1) return arrayOf(this.attrType(t.typeArguments[0], mod, depth + 1));
            if (n === 'Function') return 'global::System.Type';
            const found = this.lookupType(mod, n);
            if (!found || !found.decl) return null;
            const d = found.decl;
            if (d.kind === 'alias') {
                const al = d.nodes[0] as ts.TypeAliasDeclaration;
                return al.typeParameters && al.typeParameters.length ? 'object' : this.attrType(al.type, d.mod, depth + 1);
            }
            if (d.kind === 'enum') {
                if (this.isStringEnum(d)) return 'string';
                const b = this.bound.get(d);
                if (!b) return 'double';
                this.enumNames.add(this.fullName(b));
                return this.fullName(b);
            }
        }
        return null;
    }

    attrDefault(p: ts.ParameterDeclaration, t: string): string {
        const init = p.initializer;
        if (init) {
            const num = ts.isNumericLiteral(init) || (ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(init.operand));
            if (t === 'double' && num) return ' = ' + init.getText();
            if (t === 'string' && ts.isStringLiteral(init)) return ' = ' + lit(init.text);
            if (t === 'bool' && (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword)) return ' = ' + init.getText();
        }
        return t === 'double' || t === 'bool' || this.enumNames.has(t) ? ' = default' : ' = null';
    }

    emitDecorator(b: Bound, indent: number) {
        const di = b.deco!;
        const mod = b.decl.mod;
        const opts = di.bare ? null : this.optionsOf(di.params, mod);
        const left: string[] = [];
        const ctorParams: string[] = [];
        di.params.forEach((p, i) => {
            if (opts && i === opts.index) return;
            let pn = nameOf(p.name) || 'arg' + i;
            if (!validIdent(pn)) pn = 'arg' + i;
            if (p.dotDotDotToken) {
                let el = 'object';
                if (p.type && ts.isArrayTypeNode(p.type)) el = this.attrType(p.type.elementType, mod) || 'object';
                ctorParams.push('params ' + (el.endsWith('[]') ? 'object' : el) + '[] ' + csIdent(pn));
                return;
            }
            // untyped with a default (`before = 8`): the default's type
            const init = p.initializer;
            let t: string | null = p.type || !init
                ? this.attrType(p.type, mod)
                : ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)
                ? 'string'
                : ts.isNumericLiteral(init) || (ts.isPrefixUnaryExpression(init) && ts.isNumericLiteral(init.operand))
                ? 'double'
                : init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword
                ? 'bool'
                : 'object';
            if (!t) {
                t = 'object';
                left.push(pn);
            }
            ctorParams.push(t + ' ' + csIdent(pn) + (p.questionToken || p.initializer ? this.attrDefault(p, t) : ''));
        });
        // C# has no optional parameter before a required one
        let required = false;
        for (let k = ctorParams.length - 1; k >= 0; k--) {
            if (ctorParams[k].startsWith('params ')) continue;
            if (ctorParams[k].indexOf(' = ') < 0) required = true;
            else if (required) ctorParams[k] = ctorParams[k].replace(/ = .*$/, '');
        }
        const props: string[] = [];
        let typeOption = false;
        let propertyOptions: string | null = null;
        const short = b.csName.replace(/Attribute$/, '');
        if (opts)
            for (const m of opts.members) {
                if (!validIdent(m.name)) continue;
                const t = this.attrType(m.type, opts.mod);
                if (!t) {
                    // cc @property options (Record<string, any>): filled from the member's other attributes
                    if (di.declaresProperty && m.name === 'property') propertyOptions = m.name;
                    else left.push(m.name);
                    continue;
                }
                if (m.name === 'type' && !m.optional) typeOption = true;
                let pn = pascal(m.name);
                if (pn === b.csName || pn === short) pn += '_';
                props.push('[global::cc.TsName(' + lit(m.name) + ')] public ' + t + ' ' + csIdent(pn) + ' { get; set; }');
            }
        const targets: string[] = [];
        if (di.targets.cls) targets.push('Class');
        if (di.targets.field) targets.push('Field', 'Property');
        if (di.targets.method && !di.declaresProperty) targets.push('Method');
        const td: string[] = [];
        if (di.bare) td.push('Bare = true');
        if (di.declaresProperty) td.push('DeclaresProperty = true');
        if (opts) td.push('OptionsIndex = ' + opts.index);
        if (opts && opts.required) td.push('OptionsRequired = true');
        if (typeOption) td.push('TypeOption = "type"');
        if (propertyOptions) td.push('PropertyOptions = ' + lit(propertyOptions));
        const name = b.exportName === 'default' ? b.decl.name : b.exportName;
        this.line(indent, '/// <summary>The TypeScript decorator <c>@' + name + '</c> (' + b.module + ').</summary>');
        this.line(
            indent,
            this.attr(b) +
                '[global::cc.TsDecorator' +
                (td.length ? '(' + td.join(', ') + ')' : '') +
                '] [global::System.AttributeUsage(' +
                targets.map((x) => 'global::System.AttributeTargets.' + x).join(' | ') +
                (di.repeatable ? ', AllowMultiple = true' : '') +
                ')]'
        );
        this.line(indent, 'public sealed class ' + b.csName + ' : global::System.Attribute');
        this.line(indent, '{');
        this.line(indent + 1, 'public ' + b.csName + '(' + ctorParams.join(', ') + ') { }');
        for (const p of props) this.line(indent + 1, p);
        this.line(indent, '}');
        this.stats.decorators++;
        if (left.length) this.stats.decoratorsPartial++;
        const named = props.map((p) => / (\w+) \{ get/.exec(p)![1]);
        this.report.push(
            'decorator: ' + b.module + ': @' + name + ' -> [' + (b.ns ? b.ns + '.' : '') + short + (di.bare ? '' : '(' + ctorParams.join(', ') + ')') + ']' +
                (named.length ? ' named ' + named.join(', ') : '') +
                ' on ' + targets.join('/').toLowerCase() +
                (di.bare ? ', bare' : '') +
                (di.repeatable ? ', repeatable' : '') +
                (di.declaresProperty ? ', declares the property' + (typeOption ? ' (Type filled from the member)' : '') + (propertyOptions ? ' (other @property options go to ' + propertyOptions + ')' : '') : '') +
                (left.length ? '; not expressible in C#: ' + left.join(', ') : '')
        );
    }

    // ---- type mapping
    fullName(b: Bound): string {
        return 'global::' + (b.ns ? b.ns + '.' : '') + csIdent(b.csName);
    }

    typeParamsOf(node: ts.Node): string[] {
        const tps = (node as any).typeParameters as ts.NodeArray<ts.TypeParameterDeclaration> | undefined;
        return tps ? tps.map((t) => t.name.text) : [];
    }

    /** A type reference as seen from a module: a bound declaration, a Cocos type, or nothing. */
    lookupType(mod: Mod, name: string): { decl?: Decl; cc?: string } | null {
        const parts = name.split('.');
        const first = parts[0];
        const local = mod.locals.get(first);
        if (local && parts.length === 1) return { decl: local };
        const imp = mod.imports.get(first);
        if (!imp || !imp.from) return null;
        if (imp.from === 'cc') {
            const ccName = (imp.name === '*' ? parts.slice(1) : [imp.name].concat(parts.slice(1))).join('.');
            return this.cc.types.has(ccName) ? { cc: ccName } : null;
        }
        if (imp.name === '*') {
            if (parts.length !== 2) return null;
            const d = this.resolveExport(imp.from, parts[1]);
            return d && d !== 'cc' ? { decl: d } : null;
        }
        if (parts.length !== 1) return null;
        const d = this.resolveExport(imp.from, imp.name);
        return d && d !== 'cc' ? { decl: d } : null;
    }

    mapType(node: ts.TypeNode | undefined, mod: Mod, tps: Set<string>, position: 'param' | 'other' = 'other', depth = 0): string[] {
        const dyn = () => {
            this.dynamicCount++;
            return ['dynamic'];
        };
        if (!node) return dyn();
        if (depth > 10) return dyn();
        switch (node.kind) {
            case ts.SyntaxKind.NumberKeyword:
                return ['double'];
            case ts.SyntaxKind.StringKeyword:
                return ['string'];
            case ts.SyntaxKind.BooleanKeyword:
                return ['bool'];
            case ts.SyntaxKind.VoidKeyword:
                return ['void'];
            case ts.SyntaxKind.AnyKeyword:
                return dyn();
            case ts.SyntaxKind.UnknownKeyword:
            case ts.SyntaxKind.ObjectKeyword:
            case ts.SyntaxKind.NullKeyword:
            case ts.SyntaxKind.UndefinedKeyword:
            case ts.SyntaxKind.NeverKeyword:
                return ['object'];
        }
        if (node.kind === ts.SyntaxKind.ThisType) return this.thisType ? [this.thisType] : dyn();
        if (ts.isParenthesizedTypeNode(node)) return this.mapType(node.type, mod, tps, position, depth + 1);
        if (ts.isLiteralTypeNode(node)) {
            if (ts.isStringLiteral(node.literal)) return ['string'];
            if (ts.isNumericLiteral(node.literal) || ts.isPrefixUnaryExpression(node.literal)) return ['double'];
            if (node.literal.kind === ts.SyntaxKind.TrueKeyword || node.literal.kind === ts.SyntaxKind.FalseKeyword) return ['bool'];
            return ['object'];
        }
        if (ts.isTypeOperatorNode(node)) return node.operator === ts.SyntaxKind.ReadonlyKeyword ? this.mapType(node.type, mod, tps, position, depth + 1) : node.operator === ts.SyntaxKind.KeyOfKeyword ? ['string'] : dyn();
        if (ts.isArrayTypeNode(node)) {
            const el = this.mapType(node.elementType, mod, tps, 'other', depth + 1)[0];
            return [(el === 'void' ? 'object' : el) + '[]'];
        }
        if (ts.isTupleTypeNode(node)) return ['object[]'];
        if (ts.isUnionTypeNode(node)) {
            const parts = node.types.filter((t) => t.kind !== ts.SyntaxKind.NullKeyword && t.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword));
            if (!parts.length) return ['object'];
            const mapped: string[] = [];
            for (const p of parts) for (const m of this.mapType(p, mod, tps, position, depth + 1)) if (mapped.indexOf(m) < 0) mapped.push(m);
            if (mapped.length === 1) return mapped;
            if (mapped.every((m) => m === 'string')) return ['string'];
            if (position === 'param' && mapped.length <= 4 && mapped.indexOf('dynamic') < 0 && !mapped.some((m) => /Action|Func|Delegate/.test(m))) return mapped;
            // a coroutine slot (unity-style's StartCoroutine(IteratorLike | string | (() => IteratorLike))):
            // overloads too, so a C# IEnumerator is typed; one callback type can't make a lambda ambiguous
            if (
                position === 'param' && mapped.length <= 4 && mapped.indexOf('dynamic') < 0 &&
                mapped.some((m) => /^global::System\.Collections\.(Generic\.)?IEnumerator\b/.test(m)) &&
                mapped.filter((m) => /Action|Func|Delegate/.test(m)).length <= 1
            )
                return mapped;
            return dyn();
        }
        if (ts.isIntersectionTypeNode(node)) {
            for (const t of node.types) {
                const m = this.mapType(t, mod, tps, 'other', depth + 1)[0];
                if (m !== 'dynamic' && m !== 'object') return [m];
            }
            return dyn();
        }
        if (ts.isFunctionTypeNode(node)) {
            if (node.typeParameters && node.typeParameters.length) return ['global::System.Delegate'];
            const ps: string[] = [];
            for (const p of node.parameters) {
                if (nameOf(p.name) === 'this') continue;
                if (p.dotDotDotToken) {
                    ps.push('object[]');
                    continue;
                }
                const m = this.mapType(p.type, mod, tps, 'other', depth + 1)[0];
                ps.push(m === 'void' ? 'object' : m);
            }
            if (ps.length > 16) return ['global::System.Delegate'];
            const ret = this.mapType(node.type, mod, tps, 'other', depth + 1)[0];
            if (ret === 'void') return [ps.length ? 'global::System.Action<' + ps.join(', ') + '>' : 'global::System.Action'];
            return ['global::System.Func<' + ps.concat([ret]).join(', ') + '>'];
        }
        if (ts.isTypeQueryNode(node) || ts.isConstructorTypeNode(node)) return ['global::System.Type'];
        if (ts.isTypeReferenceNode(node)) return this.mapRef(node, mod, tps, position, depth);
        return dyn();
    }

    mapRef(node: ts.TypeReferenceNode, mod: Mod, tps: Set<string>, position: 'param' | 'other', depth: number): string[] {
        const name = nameOf(node.typeName) || '';
        const args = node.typeArguments || ([] as unknown as ts.NodeArray<ts.TypeNode>);
        const arg = (i: number) => (args[i] ? this.mapType(args[i], mod, tps, 'other', depth + 1)[0] : 'dynamic');
        const dyn = () => {
            this.dynamicCount++;
            return ['dynamic'];
        };
        if (tps.has(name)) return [csIdent(name)];
        switch (name) {
            case 'Readonly':
            case 'Required':
            case 'NonNullable':
            case 'Partial':
                return args.length ? this.mapType(args[0], mod, tps, position, depth + 1) : dyn();
            case 'Array':
            case 'ReadonlyArray':
                return [(arg(0) === 'void' ? 'object' : arg(0)) + '[]'];
            case 'Promise':
            case 'PromiseLike': {
                const a = arg(0);
                return [a === 'void' ? 'global::System.Threading.Tasks.Task' : 'global::System.Threading.Tasks.Task<' + a + '>'];
            }
            case 'Map':
            case 'ReadonlyMap':
                return ['global::System.Collections.Generic.Dictionary<' + arg(0) + ', ' + arg(1) + '>'];
            case 'Set':
            case 'ReadonlySet':
                return ['global::System.Collections.Generic.HashSet<' + arg(0) + '>'];
            case 'Function':
                return ['global::System.Delegate'];
            case 'Object':
                return ['object'];
            case 'String':
                return ['string'];
            case 'Number':
                return ['double'];
            case 'Boolean':
                return ['bool'];
            case 'Error':
                return ['global::System.Exception'];
            case 'Record':
                return dyn();
            // JavaScript iterators (generators) are C#'s: a C# iterator method (`IEnumerator Blink()`,
            // a generator in the TypeScript) passes where TypeScript takes one
            case 'Iterator':
            case 'IterableIterator':
            case 'IteratorObject':
            case 'Generator':
                return [this.iteratorType('IEnumerator', args[0], mod, tps, depth)];
            case 'Iterable':
                return [this.iteratorType('IEnumerable', args[0], mod, tps, depth)];
        }
        const found = this.lookupType(mod, name);
        if (!found) return dyn();
        // an interface shaped like an iterator (unity-style's IteratorLike: next(), return?(), throw?())
        if (found.decl && found.decl.kind === 'interface' && this.isIteratorInterface(found.decl)) return ['global::System.Collections.IEnumerator'];
        if (found.cc) {
            const info = this.cc.types.get(found.cc)!;
            if (info.kind === 'stringEnum') return ['string'];
            if (info.kind === 'any' || info.kind === 'enumAlias') return dyn();
            const cs = 'global::cc.' + found.cc.split('.').map(csIdent).join('.');
            if (!info.arity) return [cs];
            const targs: string[] = [];
            for (let i = 0; i < info.arity; i++) targs.push(args[i] ? this.mapType(args[i], mod, tps, 'other', depth + 1)[0].replace(/^void$/, 'object') : 'dynamic');
            return [cs + '<' + targs.join(', ') + '>'];
        }
        const d = found.decl!;
        if (d.kind === 'alias') {
            const al = d.nodes[0] as ts.TypeAliasDeclaration;
            if (al.typeParameters && al.typeParameters.length) return dyn();
            return this.mapType(al.type, d.mod, new Set(), position, depth + 1);
        }
        if (d.kind === 'enum' && this.isStringEnum(d)) return ['string'];
        const b = this.bound.get(d);
        if (!b || (d.kind !== 'class' && d.kind !== 'interface' && d.kind !== 'enum')) return dyn();
        const arity = this.typeParamsOf(d.nodes[0]).length;
        if (!arity) return [this.fullName(b)];
        const targs: string[] = [];
        for (let i = 0; i < arity; i++) targs.push(args[i] ? this.mapType(args[i], mod, tps, 'other', depth + 1)[0].replace(/^void$/, 'object') : 'dynamic');
        return [this.fullName(b) + '<' + targs.join(', ') + '>'];
    }

    /** IEnumerator / IEnumerable, generic over the element type when it has one (not any / unknown). */
    iteratorType(kind: 'IEnumerator' | 'IEnumerable', el: ts.TypeNode | undefined, mod: Mod, tps: Set<string>, depth: number): string {
        const loose = !el || el.kind === ts.SyntaxKind.AnyKeyword || el.kind === ts.SyntaxKind.UnknownKeyword;
        const t = loose ? null : this.mapType(el, mod, tps, 'other', depth + 1)[0];
        if (!t || t === 'dynamic' || t === 'object' || t === 'void') return 'global::System.Collections.' + kind;
        return 'global::System.Collections.Generic.' + kind + '<' + t + '>';
    }

    /** A non-generic interface with next() and nothing but return() / throw() besides. */
    isIteratorInterface(d: Decl): boolean {
        if (this.typeParamsOf(d.nodes[0]).length) return false;
        let next = false;
        for (const node of d.nodes) {
            const decl = node as ts.InterfaceDeclaration;
            if (decl.heritageClauses && decl.heritageClauses.length) return false;
            for (const m of decl.members) {
                const n = m.name ? nameOf(m.name as ts.PropertyName) : null;
                if (n !== 'next' && n !== 'return' && n !== 'throw') return false;
                if (n === 'next') next = ts.isMethodSignature(m);
            }
        }
        return next;
    }

    /** A type naming a project string enum (or a union of them with null/undefined): bound as string. */
    isStringEnumType(node: ts.TypeNode | undefined, mod: Mod): boolean {
        if (!node) return false;
        if (ts.isParenthesizedTypeNode(node)) return this.isStringEnumType(node.type, mod);
        if (ts.isUnionTypeNode(node)) {
            const parts = node.types.filter((t) => t.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword));
            return parts.length > 0 && parts.every((t) => this.isStringEnumType(t, mod));
        }
        if (!ts.isTypeReferenceNode(node)) return false;
        const found = this.lookupType(mod, nameOf(node.typeName) || '');
        return !!(found && found.decl && found.decl.kind === 'enum' && this.isStringEnum(found.decl));
    }

    isStringEnum(d: Decl): boolean {
        for (const n of d.nodes) for (const m of (n as ts.EnumDeclaration).members) if (m.initializer && ts.isStringLiteral(m.initializer)) return true;
        return false;
    }

    /** The type of a property / variable without annotation, from its initializer. */
    inferType(init: ts.Expression | undefined, mod: Mod, tps: Set<string>): string {
        if (!init) {
            this.dynamicCount++;
            return 'dynamic';
        }
        if (ts.isNumericLiteral(init) || (ts.isPrefixUnaryExpression(init) && ts.isNumericLiteral(init.operand))) return 'double';
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isTemplateExpression(init)) return 'string';
        if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) return 'bool';
        if (ts.isNewExpression(init) && ts.isIdentifier(init.expression)) {
            const t = this.mapRef(ts.factory.createTypeReferenceNode(init.expression.text, init.typeArguments), mod, tps, 'other', 0)[0];
            return t;
        }
        if (ts.isAsExpression(init)) return this.mapType(init.type, mod, tps)[0];
        this.dynamicCount++;
        return 'dynamic';
    }

    // ---- emitting
    out: string[] = [];
    line(indent: number, s: string) {
        this.out.push('    '.repeat(indent) + s);
    }

    attr(b: Bound, member = false): string {
        const exp = b.exportName !== b.csName ? ', Export = ' + lit(b.exportName) : '';
        void member;
        return '[global::cc.TsModule(' + lit(b.module) + exp + ')] ';
    }

    params(ps: readonly ts.ParameterDeclaration[], mod: Mod, tps: Set<string>): string[][] {
        let variants: string[][] = [[]];
        const used = new Set<string>();
        let i = 0;
        for (const p of ps) {
            let pn = nameOf(p.name) || 'arg' + i;
            if (pn === 'this') continue;
            if (!validIdent(pn)) pn = 'arg' + i;
            while (used.has(pn) || tps.has(pn)) pn += '_';
            used.add(pn);
            const optional = !!p.questionToken || !!p.initializer;
            let types: string[];
            if (p.dotDotDotToken) {
                let el = 'object';
                if (p.type && ts.isArrayTypeNode(p.type)) el = this.mapType(p.type.elementType, mod, tps)[0];
                types = ['params ' + (el === 'void' ? 'object' : el) + '[]'];
            } else {
                types = p.type ? this.mapType(p.type, mod, tps, 'param') : [this.inferType(p.initializer, mod, tps)];
                if (types.length === 1 && types[0] === 'dynamic' && /callback|handler|listener|^(cb|fn|func)$/i.test(pn)) types = ['global::System.Delegate'];
            }
            const mark = types.length === 1 && types[0] === 'string' && this.isStringEnumType(p.type, mod) ? STRING_ENUM_MARK : '';
            const next: string[][] = [];
            for (const v of variants) for (const t of types) next.push(v.concat([mark + (t === 'void' ? 'object' : t) + ' ' + csIdent(pn) + (optional && !p.dotDotDotToken ? ' = default' : '')]));
            variants = next.slice(0, 8);
            i++;
        }
        for (const v of variants) {
            let seenOpt = false;
            for (let k = 0; k < v.length; k++) {
                if (/ = default$/.test(v[k])) seenOpt = true;
                else if (seenOpt && !v[k].startsWith('params ')) v[k] += ' = default';
            }
            const pi = v.findIndex((e) => e.startsWith('params '));
            if (pi >= 0 && pi !== v.length - 1) v[pi] = v[pi].replace(/^params /, '');
        }
        return variants;
    }

    sigKey(name: string, arity: number, list: string[]): string {
        return name + '`' + arity + '(' + list.map((e) => e.replace(/ = default$/, '').replace(/^\[[^\]]*\] /, '').replace(/^params /, '').split(' ').slice(0, -1).join(' ').replace(/\bdynamic\b/g, 'object')).join(',') + ')';
    }

    /** Return type of a function/method: its annotation, else void when it returns nothing. */
    returnType(fn: ts.SignatureDeclarationBase & { body?: ts.Node }, mod: Mod, tps: Set<string>): string {
        if (fn.type) return this.mapType(fn.type, mod, tps)[0];
        const isAsync = hasMod(fn, ts.SyntaxKind.AsyncKeyword);
        let returnsValue = false;
        const visit = (n: ts.Node) => {
            if (returnsValue) return;
            if (ts.isFunctionLike(n) && n !== fn) return;
            if (ts.isReturnStatement(n) && n.expression) returnsValue = true;
            ts.forEachChild(n, visit);
        };
        if (fn.body) visit(fn.body);
        if (!returnsValue) return isAsync ? 'global::System.Threading.Tasks.Task' : 'void';
        this.dynamicCount++;
        return isAsync ? 'global::System.Threading.Tasks.Task<dynamic>' : 'dynamic';
    }

    emitFunction(b: Bound, indent: number) {
        const nodes = b.decl.nodes as ts.FunctionDeclaration[];
        // with overload signatures, the implementation is not callable
        const sigs = nodes.some((n) => !n.body) ? nodes.filter((n) => !n.body) : nodes;
        const seen = new Set<string>();
        for (const fn of sigs) {
            const tps = this.typeParamsOf(fn);
            const tpSet = new Set(tps);
            const ret = this.returnType(fn, b.decl.mod, tpSet);
            for (const v of this.params(fn.parameters, b.decl.mod, tpSet)) {
                const key = this.sigKey(b.csName, tps.length, v);
                if (seen.has(key)) continue;
                seen.add(key);
                const tpl = tps.length ? '<' + tps.map(csIdent).join(', ') + '>' : '';
                this.line(indent, this.attr(b) + 'public static ' + ret + ' ' + csIdent(b.csName) + tpl + '(' + v.join(', ') + ')' + (ret === 'void' ? ' { }' : ' => throw null;'));
            }
        }
    }

    emitVar(b: Bound, indent: number) {
        const v = b.decl.varDecl!;
        const t = v.type ? this.mapType(v.type, b.decl.mod, new Set())[0] : this.inferType(v.initializer, b.decl.mod, new Set());
        const type = t === 'void' ? 'object' : t;
        // get-only even for `export let`: an imported binding cannot be assigned from another module
        this.line(indent, this.attr(b) + 'public static ' + type + ' ' + csIdent(b.csName) + ' { get => throw null; }');
    }

    emitEnum(b: Bound, indent: number) {
        const nodes = b.decl.nodes as ts.EnumDeclaration[];
        if (this.isStringEnum(b.decl)) {
            this.line(indent, this.attr(b) + '[global::cc.TsStringEnum] public static partial class ' + csIdent(b.csName));
            this.line(indent, '{');
            for (const n of nodes)
                for (const m of n.members) {
                    const mn = nameOf(m.name);
                    if (!mn || !validIdent(mn) || mn === b.csName) continue;
                    if (m.initializer && ts.isStringLiteral(m.initializer)) this.line(indent + 1, 'public const string ' + csIdent(mn) + ' = ' + lit(m.initializer.text) + ';');
                    else if (m.initializer && ts.isNumericLiteral(m.initializer)) this.line(indent + 1, 'public const double ' + csIdent(mn) + ' = ' + m.initializer.text + ';');
                }
            this.line(indent, '}');
            return;
        }
        const isConst = nodes.some((n) => hasMod(n, ts.SyntaxKind.ConstKeyword));
        this.line(indent, this.attr(b) + (isConst ? '[global::cc.TsConstEnum] ' : '') + 'public enum ' + csIdent(b.csName) + ' : long');
        this.line(indent, '{');
        let next = 0;
        const values = new Map<string, number>();
        for (const n of nodes)
            for (const m of n.members) {
                const mn = nameOf(m.name);
                if (!mn) continue;
                let val: number | null = null;
                const init = m.initializer;
                if (!init) val = next;
                else if (ts.isNumericLiteral(init)) val = Number(init.text);
                else if (ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(init.operand)) val = -Number(init.operand.text);
                else if (ts.isBinaryExpression(init) && init.operatorToken.kind === ts.SyntaxKind.LessThanLessThanToken && ts.isNumericLiteral(init.left) && ts.isNumericLiteral(init.right)) val = Number(init.left.text) << Number(init.right.text);
                else if (ts.isIdentifier(init) && values.has(init.text)) val = values.get(init.text)!;
                if (val === null || !Number.isInteger(val) || !validIdent(mn)) {
                    this.report.push(b.module + ': ' + b.csName + '.' + mn + ' skipped (computed enum value)');
                    continue;
                }
                values.set(mn, val);
                next = val + 1;
                this.line(indent + 1, csIdent(mn) + ' = ' + val + ',');
            }
        this.line(indent, '}');
    }

    emitInterface(b: Bound, indent: number) {
        const nodes = b.decl.nodes as ts.InterfaceDeclaration[];
        const tps = this.typeParamsOf(nodes[0]);
        const tpSet = new Set(tps);
        const mod = b.decl.mod;
        const id = csIdent(b.csName);
        this.thisType = this.fullName(b) + (tps.length ? '<' + tps.map(csIdent).join(', ') + '>' : '');
        this.line(indent, this.attr(b) + 'public partial interface ' + id + (tps.length ? '<' + tps.map(csIdent).join(', ') + '>' : ''));
        this.line(indent, '{');
        const seen = new Set<string>();
        for (const n of nodes)
            for (const m of n.members) {
                const mn = m.name ? nameOf(m.name as ts.PropertyName) : null;
                if (!mn || !validIdent(mn) || mn === b.csName) continue;
                if (ts.isPropertySignature(m)) {
                    if (seen.has('P:' + mn)) continue;
                    seen.add('P:' + mn);
                    const t = this.mapType(m.type, mod, tpSet)[0].replace(/^void$/, 'object');
                    this.line(indent + 1, (t === 'string' && this.isStringEnumType(m.type, mod) ? STRING_ENUM_MARK : '') + t + ' ' + csIdent(mn) + (hasMod(m, ts.SyntaxKind.ReadonlyKeyword) ? ' { get => throw null; }' : ' { get => throw null; set => throw null; }'));
                } else if (ts.isMethodSignature(m)) {
                    if (seen.has('P:' + mn)) continue;
                    const mtps = this.typeParamsOf(m);
                    const all = new Set([...tpSet, ...mtps]);
                    const ret = this.mapType(m.type, mod, all)[0];
                    for (const v of this.params(m.parameters, mod, all)) {
                        const key = this.sigKey(mn, mtps.length, v);
                        if (seen.has(key)) continue;
                        seen.add(key);
                        this.line(indent + 1, ret + ' ' + csIdent(mn) + (mtps.length ? '<' + mtps.map(csIdent).join(', ') + '>' : '') + '(' + v.join(', ') + ')' + (ret === 'void' ? ' { }' : ' => throw null;'));
                    }
                }
            }
        this.line(indent, '}');
    }

    /** The bound or Cocos class a TS class extends, as C#. */
    baseOf(cl: ts.ClassDeclaration, mod: Mod, tpSet: Set<string>): string | null {
        const h = cl.heritageClauses?.find((x) => x.token === ts.SyntaxKind.ExtendsKeyword);
        if (!h || !h.types[0]) return null;
        const et = h.types[0];
        if (!ts.isIdentifier(et.expression) && !ts.isPropertyAccessExpression(et.expression)) return null;
        const name = et.expression.getText();
        const found = this.lookupType(mod, name);
        if (!found) return null;
        if (found.cc && this.cc.types.get(found.cc)!.kind !== 'class') return null;
        if (found.decl && (found.decl.kind !== 'class' || !this.bound.has(found.decl))) return null;
        const t = this.mapRef(ts.factory.createTypeReferenceNode(name, et.typeArguments), mod, tpSet, 'other', 0)[0];
        return t === 'dynamic' ? null : t;
    }

    /** Whether a class extends a Cocos class (directly or through bound TS classes). */
    extendsCc(cl: ts.ClassDeclaration, mod: Mod, depth = 0): boolean {
        const h = cl.heritageClauses?.find((x) => x.token === ts.SyntaxKind.ExtendsKeyword);
        if (!h || !h.types[0] || depth > 20) return false;
        const et = h.types[0].expression;
        if (!ts.isIdentifier(et) && !ts.isPropertyAccessExpression(et)) return false;
        const found = this.lookupType(mod, et.getText());
        if (!found) return false;
        if (found.cc) return true;
        const d = found.decl!;
        return d.kind === 'class' && this.extendsCc(d.nodes[0] as ts.ClassDeclaration, d.mod, depth + 1);
    }

    emitClass(b: Bound, indent: number) {
        const cl = b.decl.nodes[0] as ts.ClassDeclaration;
        const mod = b.decl.mod;
        // Cocos lifecycle methods are inherited as `protected virtual` from cc.Component: redeclaring
        // them public would stop C# subclasses from overriding them
        const lifecycle = this.extendsCc(cl, mod) ? LIFECYCLE : null;
        const tps = this.typeParamsOf(cl);
        const tpSet = new Set(tps);
        const id = csIdent(b.csName);
        const base = this.baseOf(cl, mod, tpSet);
        const ext = cl.heritageClauses?.find((x) => x.token === ts.SyntaxKind.ExtendsKeyword);
        if (ext && !base) this.report.push(b.module + ': ' + b.csName + ' extends ' + ext.types[0].expression.getText() + ', which is not bound: the base class is left out');
        // @ccclass('Name') -> serializable from C#
        let ccName: string | null = null;
        const decos = ts.canHaveDecorators(cl) ? ts.getDecorators(cl) || [] : [];
        for (const d of decos) {
            const e = d.expression;
            const callee = ts.isCallExpression(e) ? e.expression : e;
            if (ts.isIdentifier(callee) && callee.text === 'ccclass') {
                ccName = ts.isCallExpression(e) && e.arguments[0] && ts.isStringLiteral(e.arguments[0]) ? e.arguments[0].text : b.csName;
            }
        }
        const abs = hasMod(cl, ts.SyntaxKind.AbstractKeyword) ? 'abstract ' : '';
        this.thisType = this.fullName(b) + (tps.length ? '<' + tps.map(csIdent).join(', ') + '>' : '');
        // `/** @unityMessages */`: the class calls Unity-named methods (Awake, Update...) of its subclasses
        // itself, so the transpiler doesn't warn CSX2010 on them
        const messages = b.decl.nodes.some((n) => docTag(n, 'unityMessages').length > 0);
        if (messages) this.report.push('note: ' + InteropGen.fullOf(b) + ' handles Unity messages (@unityMessages): Awake, Start, Update... in C# subclasses are not misspelt Cocos hooks');
        this.line(indent, this.attr(b) + (ccName ? '[global::cc.TsCcclass(' + lit(ccName) + ')] ' : '') + (messages ? '[global::cc.TsUnityMessages] ' : '') + 'public ' + abs + 'partial class ' + id + (tps.length ? '<' + tps.map(csIdent).join(', ') + '>' : '') + (base ? ' : ' + base : ''));
        this.line(indent, '{');
        const chain = base ? ' : base(default(global::cc.TsInit))' : '';
        this.line(indent + 1, 'protected ' + id + '(global::cc.TsInit _)' + (base ? ' : base(_)' : '') + ' { }');
        const seen = new Set<string>();
        const ctors = cl.members.filter((m) => ts.isConstructorDeclaration(m) && !hasMod(m, ts.SyntaxKind.PrivateKeyword)) as ts.ConstructorDeclaration[];
        const ctorSigs = ctors.some((c) => !c.body) ? ctors.filter((c) => !c.body) : ctors;
        if (!ctorSigs.length) this.line(indent + 1, 'public ' + id + '()' + chain + ' { }');
        for (const c of ctorSigs)
            for (const v of this.params(c.parameters, mod, tpSet)) {
                const key = this.sigKey('.ctor', 0, v);
                if (seen.has(key)) continue;
                seen.add(key);
                this.line(indent + 1, (hasMod(c, ts.SyntaxKind.ProtectedKeyword) ? 'protected ' : 'public ') + id + '(' + v.join(', ') + ')' + chain + ' { }');
            }
        // properties and accessors
        const props = new Map<string, { type?: ts.TypeNode; init?: ts.Expression; isStatic: boolean; prot: boolean; get: boolean; set: boolean }>();
        const methods = new Map<string, ts.MethodDeclaration[]>();
        // constructor parameter properties: constructor(readonly node: Node, public speed = 1)
        for (const c of ctors)
            for (const p of c.parameters) {
                if (!ts.isParameterPropertyDeclaration(p, c) || hasMod(p, ts.SyntaxKind.PrivateKeyword) || !ts.isIdentifier(p.name)) continue;
                const pn = p.name.text;
                if (!validIdent(pn)) continue;
                props.set('I:' + pn, { type: p.type, init: p.initializer, isStatic: false, prot: hasMod(p, ts.SyntaxKind.ProtectedKeyword), get: true, set: !hasMod(p, ts.SyntaxKind.ReadonlyKeyword) });
            }
        for (const m of cl.members) {
            if (hasMod(m, ts.SyntaxKind.PrivateKeyword)) continue;
            const mn = m.name ? nameOf(m.name as ts.PropertyName) : null;
            if (!mn || mn.startsWith('#') || !validIdent(mn)) continue;
            const isStatic = hasMod(m, ts.SyntaxKind.StaticKeyword);
            const prot = hasMod(m, ts.SyntaxKind.ProtectedKeyword);
            const key = (isStatic ? 'S:' : 'I:') + mn;
            if (ts.isPropertyDeclaration(m)) {
                const ro = hasMod(m, ts.SyntaxKind.ReadonlyKeyword);
                props.set(key, { type: m.type, init: m.initializer, isStatic, prot, get: true, set: !ro });
            } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
                const p = props.get(key) || { isStatic, prot, get: false, set: false };
                if (ts.isGetAccessorDeclaration(m)) {
                    p.get = true;
                    if (m.type) p.type = m.type;
                } else {
                    p.set = true;
                    if (!p.type && m.parameters[0] && m.parameters[0].type) p.type = m.parameters[0].type;
                }
                props.set(key, p);
            } else if (ts.isMethodDeclaration(m)) {
                if (!methods.has(key)) methods.set(key, []);
                methods.get(key)!.push(m);
            }
        }
        const names = new Set<string>();
        for (const [key, p] of props) {
            const mn = key.slice(2);
            if (names.has(mn) || mn === b.csName) continue;
            names.add(mn);
            const t = (p.type ? this.mapType(p.type, mod, tpSet)[0] : this.inferType(p.init, mod, tpSet)).replace(/^void$/, 'object');
            const acc = p.prot ? 'protected ' : 'public ';
            const mods = p.isStatic ? 'static ' : 'virtual ';
            this.line(indent + 1, (t === 'string' && this.isStringEnumType(p.type, mod) ? STRING_ENUM_MARK : '') + acc + mods + t + ' ' + csIdent(mn) + (p.set ? ' { get => throw null; set => throw null; }' : ' { get => throw null; }'));
        }
        for (const [key, list] of methods) {
            const mn = key.slice(2);
            if (names.has(mn) && !seen.has('M:' + mn)) continue;
            if (mn === b.csName) continue;
            if (lifecycle && key.startsWith('I:') && lifecycle.has(mn)) continue;
            names.add(mn);
            seen.add('M:' + mn);
            const isStatic = key.startsWith('S:');
            const sigs = list.some((m) => !m.body) && list.some((m) => !!m.body) ? list.filter((m) => !m.body) : list;
            for (const m of sigs) {
                const mtps = this.typeParamsOf(m);
                const all = new Set([...tpSet, ...mtps]);
                const ret = this.returnType(m, mod, all);
                const acc = hasMod(m, ts.SyntaxKind.ProtectedKeyword) ? 'protected ' : 'public ';
                for (const v of this.params(m.parameters, mod, all)) {
                    const sk = this.sigKey(mn, mtps.length, v);
                    if (seen.has(sk)) continue;
                    seen.add(sk);
                    this.line(indent + 1, acc + (isStatic ? 'static ' : 'virtual ') + ret + ' ' + csIdent(mn) + (mtps.length ? '<' + mtps.map(csIdent).join(', ') + '>' : '') + '(' + v.join(', ') + ')' + (ret === 'void' ? ' { }' : ' => throw null;'));
                }
            }
        }
        this.line(indent, '}');
    }

    emit() {
        this.out.push('// <auto-generated> TypeScript exports visible to C# scripts (extensions/csharp, TS interop).');
        this.out.push('// Declarations only. Regenerated when project or extension .ts files change.');
        this.out.push('#pragma warning disable');
        const byNs = new Map<string, Bound[]>();
        for (const b of Array.from(this.bound.values()).concat(this.decos)) {
            if (!byNs.has(b.ns)) byNs.set(b.ns, []);
            byNs.get(b.ns)!.push(b);
        }
        // the project's names first, in the global namespace (no namespace block)
        if (!byNs.has('')) byNs.set('', []);
        const order = Array.from(byNs.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        for (const ns of order) {
            const list = byNs.get(ns)!.sort((a, b) => (a.module + a.csName < b.module + b.csName ? -1 : 1));
            const ind = ns ? 1 : 0;
            if (ns) {
                this.out.push('namespace ' + ns);
                this.out.push('{');
            }
            const holders = new Map<string, Bound[]>();
            for (const b of list) {
                const before = this.dynamicCount;
                const start = this.out.length;
                try {
                    if (b.deco) {
                        this.emitDecorator(b, ind);
                        continue;
                    }
                    if (b.decl.kind === 'function' || b.decl.kind === 'var') {
                        const h = b.holder || 'Exports';
                        if (!holders.has(h)) holders.set(h, []);
                        holders.get(h)!.push(b);
                        continue;
                    }
                    if (b.decl.kind === 'class') this.emitClass(b, ind);
                    else if (b.decl.kind === 'interface') this.emitInterface(b, ind);
                    else if (b.decl.kind === 'enum') this.emitEnum(b, ind);
                    this.thisType = null;
                    this.count(this.dynamicCount > before);
                } catch (e: any) {
                    this.thisType = null;
                    this.out.length = start;
                    this.skip(b.decl, 'failed: ' + (e && e.message));
                }
            }
            if (ns === '' && !holders.has('ProjectExports')) holders.set('ProjectExports', []);
            for (const [h, members] of holders) {
                const doc = ns === '' && h === 'ProjectExports' ? ' of the project; <c>using static ProjectExports</c> is global.' : ': <c>using static ' + ns + '.' + h + ';</c>';
                this.line(ind, '/// <summary>Exported TypeScript functions and variables' + doc + '</summary>');
                this.line(ind, 'public static partial class ' + h);
                this.line(ind, '{');
                for (const b of members) {
                    const before = this.dynamicCount;
                    const start = this.out.length;
                    try {
                        if (b.decl.kind === 'function') this.emitFunction(b, ind + 1);
                        else this.emitVar(b, ind + 1);
                        this.count(this.dynamicCount > before);
                    } catch (e: any) {
                        this.out.length = start;
                        this.skip(b.decl, 'failed: ' + (e && e.message));
                    }
                }
                this.line(ind, '}');
            }
            if (ns) this.out.push('}');
        }
    }

    count(partial: boolean) {
        if (partial) this.stats.partial++;
        else this.stats.bound++;
    }
}

/** Generates the C# stubs of the exported TypeScript of the given modules. Never throws on odd input. */
export function generateTsInterop(modules: InteropModule[], cc: CcNames): InteropResult {
    const g = new InteropGen(cc);
    for (const m of modules) {
        try {
            g.add(m);
        } catch (e: any) {
            g.report.push(m.id + ': could not be parsed (' + (e && e.message) + ')');
        }
    }
    g.stats.modules = g.mods.size;
    g.parseAll();
    g.choose();
    g.emit();
    return { code: g.out.join('\n') + '\n', report: g.report, stats: g.stats };
}

// exclusions live with the other path helpers (no TypeScript compiler needed there)
export { globToRegExp, isExcluded } from '../shared/interop-paths';
