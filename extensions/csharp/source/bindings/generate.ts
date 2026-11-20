/**
 * Generates the C# bindings of the Cocos API from cc.d.ts (TypeScript compiler API).
 *
 * Names stay exactly as in TypeScript, so the Cocos docs apply 1:1 and the transpiler can
 * emit a member's C# name as is. When a name can't be kept (a C# keyword is escaped with @;
 * `$`, or a member named like its class, is renamed) the member carries [TsName("original")].
 *
 * Shape of the output (namespace cc):
 * - classes -> partial classes (members with `throw null` bodies, instance members virtual
 *   so components can override start/update...), constructors chain to a hidden marker ctor;
 * - interfaces -> interfaces with default member bodies; classes that structurally match an
 *   interface (all its required member names) implement it, so `Vec3` passes as `IVec3Like`;
 * - numeric enums -> enums; string enums -> static classes of string constants [TsStringEnum];
 * - TS namespaces -> static classes (merged into a class of the same name when there is one);
 * - module-level functions and variables -> static class `Globals` (`using static cc.Globals`);
 * - `static X: typeof SomeEnum` -> a nested static class copying the enum members;
 * - number -> double, any -> dynamic, unions -> overloads in parameters (object elsewhere),
 *   callbacks -> Action/Func, Constructor<T> -> System.Type plus a generic overload without
 *   that parameter ([TsCtorArg]) so `getComponent<Sprite>()` works.
 * Anything that can't be mapped is skipped and listed in the report; it never throws.
 */
import * as ts from 'typescript';

export interface BindingsResult {
    code: string;
    report: string[];
    stats: { classes: number; interfaces: number; enums: number; functions: number; variables: number; members: number; skipped: number };
}

type Kind = 'class' | 'interface' | 'enum' | 'alias' | 'namespace';

interface Decl {
    name: string;
    path: string; // qualified TS path, e.g. "Node", "__private._cocos_x", "gfx.Texture"
    parent: Decl | null;
    classes: ts.ClassDeclaration[];
    interfaces: ts.InterfaceDeclaration[];
    enums: ts.EnumDeclaration[];
    aliases: ts.TypeAliasDeclaration[];
    namespaces: ts.ModuleDeclaration[];
    functions: ts.FunctionDeclaration[];
    variables: { decl: ts.VariableDeclaration; isConst: boolean }[];
    children: Map<string, Decl>;
    /** `const X: new (...args) => A & IMixin`: bound as a class (Cocos mixins such as EventTarget). */
    ctorConst?: ts.ConstructorTypeNode;
    /** `const X: typeof SomeEnum`: bound as a copy of the enum. */
    enumAlias?: string;
    /** Where names inside this declaration resolve (its original namespace, if it was moved). */
    scope?: Decl | null;
    /** `export import X = a.b.X;` in this container. */
    imports: { name: string; target: string }[];
    /** Children moved to another container by an import alias (still reachable as a.b.X). */
    moved?: Map<string, Decl>;
}

const CS_KEYWORDS = new Set(
    ('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while').split(' ')
);

/** Names of types the C# side gives special meaning or that would clash with System. */
const SKIP_ROOT = new Set(['_decorator']);

function newDecl(name: string, parent: Decl | null): Decl {
    return {
        name,
        path: parent && parent.path ? parent.path + '.' + name : name,
        parent,
        classes: [],
        interfaces: [],
        enums: [],
        aliases: [],
        namespaces: [],
        functions: [],
        variables: [],
        children: new Map(),
        imports: [],
    };
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    const mods = (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) || [];
    return mods.some((m) => m.kind === kind);
}

function nameText(n: ts.PropertyName | ts.BindingName | ts.EntityName | undefined): string | null {
    if (!n) return null;
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
    if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
    if (ts.isQualifiedName(n)) return nameText(n.left) + '.' + n.right.text;
    return null;
}

function validIdent(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/** A C# identifier for a TS name, and whether a [TsName] is needed. */
function csIdent(name: string): { id: string; renamed: boolean } {
    if (!validIdent(name)) {
        // each invalid character becomes _xHH_ so different names stay different
        let id = name.replace(/\$/g, '_S_').replace(/[^A-Za-z0-9_]/g, (c) => '_x' + c.charCodeAt(0).toString(16) + '_');
        if (!/^[A-Za-z_]/.test(id)) id = '_' + id;
        return { id, renamed: true };
    }
    if (CS_KEYWORDS.has(name)) return { id: '@' + name, renamed: false };
    return { id: name, renamed: false };
}

function lit(s: string): string {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

interface MapCtx {
    container: Decl; // for name resolution
    typeParams: Set<string>;
    selfType: string | null; // C# name of the class for `this`
    depth: number;
}

interface CsType {
    cs: string;
    /** System.Type for a Constructor<T>: T's TS type parameter name, if any. */
    ctorOf?: string;
}

class Generator {
    root: Decl = newDecl('', null);
    report: string[] = [];
    stats = { classes: 0, interfaces: 0, enums: 0, functions: 0, variables: 0, members: 0, skipped: 0 };
    out: string[] = [];
    /** TS path -> C# qualified type name for every emitted type. */
    csTypeName = new Map<string, string>();
    /** TS path -> kind of the emitted entity. */
    kindOf = new Map<string, Kind | 'stringEnum'>();
    /** Interfaces: TS path -> required member names (for structural implements). */
    ifaceMembers = new Map<string, string[]>();
    /** Classes: TS path -> member names (own). */
    classMembers = new Map<string, Set<string>>();
    classBase = new Map<string, string | null>();
    /** Constructor signatures per class path (TS parameter lists). */
    ctorSigs = new Map<string, ts.NodeArray<ts.ParameterDeclaration>[]>();
    genericArity = new Map<string, number>();

    // ------------------------------------------------------------------ collect
    collect(body: ts.ModuleBlock, into: Decl) {
        for (const st of body.statements) {
            let name: string | null = null;
            if (ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isEnumDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isFunctionDeclaration(st)) {
                name = st.name ? st.name.text : null;
            } else if (ts.isModuleDeclaration(st)) {
                name = nameText(st.name);
            } else if (ts.isImportEqualsDeclaration(st)) {
                if (!ts.isExternalModuleReference(st.moduleReference)) {
                    const target = nameText(st.moduleReference);
                    if (target) into.imports.push({ name: st.name.text, target });
                }
                continue;
            } else if (ts.isVariableStatement(st)) {
                const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
                for (const d of st.declarationList.declarations) {
                    const n = nameText(d.name);
                    if (!n) continue;
                    // mixin constructors become classes; `typeof Enum` aliases become enum copies
                    const existing = into.children.get(n);
                    const free = !existing || (!existing.classes.length && !existing.enums.length && !existing.interfaces.length);
                    if (d.type && ts.isConstructorTypeNode(d.type) && free) {
                        const c = existing || newDecl(n, into);
                        c.ctorConst = d.type;
                        into.children.set(n, c);
                        continue;
                    }
                    if (d.type && ts.isTypeQueryNode(d.type) && free) {
                        const q = nameText(d.type.exprName);
                        if (q) {
                            const c = existing || newDecl(n, into);
                            c.enumAlias = q;
                            into.children.set(n, c);
                            continue;
                        }
                    }
                    into.variables.push({ decl: d, isConst });
                }
                continue;
            } else continue;
            if (!name) continue;
            if (ts.isFunctionDeclaration(st)) {
                into.functions.push(st);
                continue;
            }
            let d = into.children.get(name);
            if (!d) {
                d = newDecl(name, into);
                into.children.set(name, d);
            }
            if (ts.isClassDeclaration(st)) d.classes.push(st);
            else if (ts.isInterfaceDeclaration(st)) d.interfaces.push(st);
            else if (ts.isEnumDeclaration(st)) d.enums.push(st);
            else if (ts.isTypeAliasDeclaration(st)) d.aliases.push(st);
            else if (ts.isModuleDeclaration(st)) {
                d.namespaces.push(st);
                if (st.body && ts.isModuleBlock(st.body)) this.collect(st.body, d);
            }
            // a real class/enum/interface wins over a const of the same name seen earlier
            if (ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) {
                d.ctorConst = undefined;
                d.enumAlias = undefined;
            }
        }
    }

    /**
     * `export import Vec3 = math.Vec3;`: the type moves to the container of the alias (one C#
     * type, at the place users know it from); functions and constants are copied.
     */
    applyImports(d: Decl) {
        for (const c of Array.from(d.children.values())) this.applyImports(c);
        for (const im of d.imports) {
            const lastDot = im.target.lastIndexOf('.');
            const owner = lastDot > 0 ? this.resolve(im.target.slice(0, lastDot), d) : d;
            const leaf = im.target.slice(lastDot + 1);
            const t = this.resolve(im.target, d);
            if (t && t.parent !== d) {
                if (im.name !== leaf || d.children.has(im.name)) {
                    this.skip((d.path ? d.path + '.' : '') + im.name, 'alias of ' + im.target + ' (bound under its own name)');
                } else if (t.parent) {
                    t.parent.children.delete(leaf);
                    (t.parent.moved = t.parent.moved || new Map()).set(leaf, t);
                    t.scope = t.scope || t.parent;
                    t.parent = d;
                    d.children.set(leaf, t);
                }
            }
            if (owner) {
                for (const f of owner.functions) if (f.name && f.name.text === leaf && im.name === leaf) d.functions.push(f);
                for (const v of owner.variables) if (nameText(v.decl.name) === leaf && im.name === leaf) d.variables.push(v);
            }
        }
    }

    /** Recomputes qualified paths after moves. */
    fixPaths(d: Decl) {
        for (const c of d.children.values()) {
            c.path = d.path ? d.path + '.' + c.name : c.name;
            this.fixPaths(c);
        }
    }

    /** Where names used inside a declaration resolve. */
    scopeOf(d: Decl): Decl {
        return d.scope || d.parent || this.root;
    }

    // ------------------------------------------------------------------ resolve
    /** Finds the declaration a (possibly dotted) name refers to, from a container outward. */
    resolve(name: string, from: Decl): Decl | null {
        const parts = name.split('.');
        const child = (c: Decl, n: string) => c.children.get(n) || (c.moved ? c.moved.get(n) : undefined);
        for (let c: Decl | null = from; c; c = c.scope || c.parent) {
            let d: Decl | undefined = child(c, parts[0]);
            for (let i = 1; d && i < parts.length; i++) d = child(d, parts[i]);
            if (d) return d;
        }
        return null;
    }

    declKind(d: Decl): Kind | 'stringEnum' | 'functionNs' {
        if (d.classes.length || d.ctorConst) return 'class';
        if (d.enumAlias) {
            const t = this.resolve(d.enumAlias, this.scopeOf(d));
            if (t && t.enums.length) return this.isStringEnum(t.enums) ? 'stringEnum' : 'enum';
            return 'alias';
        }
        if (d.enums.length) return this.isStringEnum(d.enums) ? 'stringEnum' : 'enum';
        if (d.interfaces.length) return 'interface';
        if (d.aliases.length) return 'alias';
        return 'namespace';
    }

    isStringEnum(enums: ts.EnumDeclaration[]): boolean {
        for (const e of enums) for (const m of e.members) if (m.initializer && ts.isStringLiteral(m.initializer)) return true;
        return false;
    }

    /** C# type name of a declaration (fully qualified). */
    csNameOf(d: Decl): string {
        const parts: string[] = [];
        for (let c: Decl | null = d; c && c.name; c = c.parent) parts.unshift(csIdent(this.typeMemberName(c)).id);
        return 'global::cc.' + parts.join('.');
    }

    /** The C# name used for a declaration as a type (namespace merged with a function gets a suffix). */
    typeMemberName(d: Decl): string {
        if (d.parent && !d.classes.length && !d.enums.length && !d.interfaces.length && d.parent.functions.some((f) => f.name && f.name.text === d.name)) return d.name + '_ns';
        if (d.parent && !d.classes.length && !d.enums.length && !d.interfaces.length && d.parent.variables.some((v) => nameText(v.decl.name) === d.name)) return d.name + '_ns';
        return d.name;
    }

    // ------------------------------------------------------------------ type mapping
    mapType(node: ts.TypeNode | undefined, ctx: MapCtx, position: 'param' | 'other' = 'other'): CsType[] {
        if (!node) return [{ cs: 'dynamic' }];
        if (ctx.depth > 12) return [{ cs: 'dynamic' }];
        const sub = { ...ctx, depth: ctx.depth + 1 };
        switch (node.kind) {
            case ts.SyntaxKind.NumberKeyword:
                return [{ cs: 'double' }];
            case ts.SyntaxKind.StringKeyword:
                return [{ cs: 'string' }];
            case ts.SyntaxKind.BooleanKeyword:
                return [{ cs: 'bool' }];
            case ts.SyntaxKind.VoidKeyword:
                return [{ cs: 'void' }];
            case ts.SyntaxKind.AnyKeyword:
                return [{ cs: 'dynamic' }];
            case ts.SyntaxKind.UnknownKeyword:
            case ts.SyntaxKind.ObjectKeyword:
                return [{ cs: 'object' }];
            case ts.SyntaxKind.NeverKeyword:
            case ts.SyntaxKind.UndefinedKeyword:
            case ts.SyntaxKind.NullKeyword:
                return [{ cs: 'object' }];
            case ts.SyntaxKind.BigIntKeyword:
                return [{ cs: 'long' }];
            case ts.SyntaxKind.SymbolKeyword:
                return [{ cs: 'object' }];
            case ts.SyntaxKind.ThisType:
                return [{ cs: ctx.selfType || 'dynamic' }];
        }
        if (ts.isParenthesizedTypeNode(node)) return this.mapType(node.type, sub, position);
        if (ts.isLiteralTypeNode(node)) {
            const l = node.literal;
            if (ts.isStringLiteral(l)) return [{ cs: 'string' }];
            if (ts.isNumericLiteral(l) || ts.isPrefixUnaryExpression(l)) return [{ cs: 'double' }];
            if (l.kind === ts.SyntaxKind.TrueKeyword || l.kind === ts.SyntaxKind.FalseKeyword) return [{ cs: 'bool' }];
            return [{ cs: 'object' }];
        }
        if (ts.isTypeOperatorNode(node)) {
            if (node.operator === ts.SyntaxKind.ReadonlyKeyword) return this.mapType(node.type, sub, position);
            if (node.operator === ts.SyntaxKind.KeyOfKeyword) return [{ cs: 'string' }];
            return [{ cs: 'dynamic' }];
        }
        if (ts.isArrayTypeNode(node)) {
            const el = this.mapType(node.elementType, sub)[0];
            if (el.cs === 'void') return [{ cs: 'object[]' }];
            return [{ cs: el.cs + '[]' }];
        }
        if (ts.isTupleTypeNode(node)) return [{ cs: 'object[]' }];
        if (ts.isUnionTypeNode(node)) return this.mapUnion(node, sub, position);
        if (ts.isIntersectionTypeNode(node)) {
            for (const t of node.types) {
                const m = this.mapType(t, sub)[0];
                if (m.cs !== 'dynamic' && m.cs !== 'object') return [m];
            }
            return [{ cs: 'dynamic' }];
        }
        if (ts.isFunctionTypeNode(node)) return [{ cs: this.mapFunctionType(node, sub) }];
        if (ts.isConstructorTypeNode(node)) {
            const r = node.type && ts.isTypeReferenceNode(node.type) ? nameText(node.type.typeName) : null;
            return [{ cs: 'global::System.Type', ctorOf: r && ctx.typeParams.has(r) ? r : undefined }];
        }
        if (ts.isTypeQueryNode(node)) {
            const n = nameText(node.exprName);
            const d = n ? this.resolve(n, ctx.container) : null;
            if (d && d.classes.length) return [{ cs: 'global::System.Type' }];
            return [{ cs: 'dynamic' }];
        }
        if (ts.isTypeLiteralNode(node) || ts.isMappedTypeNode(node) || ts.isConditionalTypeNode(node) || ts.isIndexedAccessTypeNode(node)) return [{ cs: 'dynamic' }];
        if (ts.isTypePredicateNode(node)) return [{ cs: node.assertsModifier ? 'void' : 'bool' }];
        if (ts.isTypeReferenceNode(node)) return this.mapRef(node, sub, position);
        return [{ cs: 'dynamic' }];
    }

    mapUnion(node: ts.UnionTypeNode, ctx: MapCtx, position: 'param' | 'other'): CsType[] {
        const parts = node.types.filter((t) => t.kind !== ts.SyntaxKind.NullKeyword && t.kind !== ts.SyntaxKind.UndefinedKeyword && t.kind !== ts.SyntaxKind.VoidKeyword && !(ts.isLiteralTypeNode(t) && (t.literal.kind === ts.SyntaxKind.NullKeyword)));
        if (!parts.length) return [{ cs: 'object' }];
        if (parts.length === 1) return this.mapType(parts[0], ctx, position);
        const mapped: CsType[] = [];
        for (const p of parts) for (const m of this.mapType(p, ctx, position)) if (!mapped.some((x) => x.cs === m.cs)) mapped.push(m);
        if (mapped.length === 1) return mapped;
        // true | false and string literals collapse
        if (mapped.every((m) => m.cs === 'string')) return [{ cs: 'string' }];
        if (position === 'param' && mapped.length <= 4 && !mapped.some((m) => m.cs === 'dynamic')) return mapped;
        if (mapped.some((m) => m.cs.startsWith('global::System.Action') || m.cs.startsWith('global::System.Func') || m.cs === 'global::System.Delegate')) return [{ cs: 'dynamic' }];
        return [{ cs: position === 'param' ? 'dynamic' : 'dynamic' }];
    }

    mapFunctionType(node: ts.FunctionTypeNode, ctx: MapCtx): string {
        if (node.typeParameters && node.typeParameters.length) return 'global::System.Delegate';
        const ps: string[] = [];
        for (const p of node.parameters) {
            const pn = nameText(p.name);
            if (pn === 'this') continue;
            if (p.dotDotDotToken) {
                ps.push('object[]');
                continue;
            }
            const m = this.mapType(p.type, ctx)[0];
            ps.push(m.cs === 'void' ? 'object' : m.cs);
        }
        if (ps.length > 16) return 'global::System.Delegate';
        const ret = this.mapType(node.type, ctx)[0].cs;
        if (ret === 'void') return ps.length ? 'global::System.Action<' + ps.join(', ') + '>' : 'global::System.Action';
        return 'global::System.Func<' + ps.concat([ret]).join(', ') + '>';
    }

    mapRef(node: ts.TypeReferenceNode, ctx: MapCtx, position: 'param' | 'other'): CsType[] {
        const name = nameText(node.typeName) || '';
        const args = node.typeArguments || ([] as unknown as ts.NodeArray<ts.TypeNode>);
        const arg = (i: number) => (args[i] ? this.mapType(args[i], ctx)[0] : { cs: 'dynamic' });
        if (ctx.typeParams.has(name)) return [{ cs: csIdent(name).id }];
        const last = name.split('.').pop() || name;
        // built-in TS / lib types
        switch (name) {
            case 'Readonly':
            case 'Required':
            case 'NonNullable':
            case 'Partial':
            case 'DeepReadonly':
                return args.length ? this.mapType(args[0], ctx, position) : [{ cs: 'dynamic' }];
            case 'Array':
            case 'ReadonlyArray': {
                const el = arg(0);
                return [{ cs: (el.cs === 'void' ? 'object' : el.cs) + '[]' }];
            }
            case 'Promise':
            case 'PromiseLike': {
                const el = arg(0);
                return [{ cs: el.cs === 'void' || el.cs === 'object' && !args.length ? 'global::System.Threading.Tasks.Task' : 'global::System.Threading.Tasks.Task<' + el.cs + '>' }];
            }
            case 'Map':
            case 'ReadonlyMap':
                return [{ cs: 'global::System.Collections.Generic.Dictionary<' + arg(0).cs + ', ' + arg(1).cs + '>' }];
            case 'Set':
            case 'ReadonlySet':
                return [{ cs: 'global::System.Collections.Generic.HashSet<' + arg(0).cs + '>' }];
            case 'Function':
            case 'CallableFunction':
                return [{ cs: 'global::System.Delegate' }];
            case 'Object':
                return [{ cs: 'object' }];
            case 'String':
                return [{ cs: 'string' }];
            case 'Number':
                return [{ cs: 'double' }];
            case 'Boolean':
                return [{ cs: 'bool' }];
            case 'Error':
                return [{ cs: 'global::System.Exception' }];
            case 'Record':
                return [{ cs: 'dynamic' }];
        }
        // constructors
        if (/(^|\.|_)(Constructor|AbstractedConstructor|ComponentConstructor|AssetType|CCClassConstructor)$/.test(last) || /Constructor$/.test(last)) {
            const a0 = args[0];
            const tp = a0 && ts.isTypeReferenceNode(a0) ? nameText(a0.typeName) : null;
            return [{ cs: 'global::System.Type', ctorOf: tp && ctx.typeParams.has(tp) ? tp : undefined }];
        }
        if (/AnyFunction$/.test(last)) return [{ cs: 'global::System.Delegate' }];
        let d = this.resolve(name, ctx.container);
        if (!d) return [{ cs: 'dynamic' }];
        // `const X: typeof Enum` used as a type: the enum (unless a type alias of that name exists)
        if (d.enumAlias && !d.aliases.length) {
            const t = this.resolve(d.enumAlias, this.scopeOf(d));
            if (!t || !t.enums.length) return [{ cs: 'dynamic' }];
            d = t;
        }
        const kind = d.aliases.length && !d.classes.length && !d.enums.length && !d.interfaces.length && !d.ctorConst ? 'alias' : this.declKind(d);
        if (kind === 'stringEnum') return [{ cs: 'string' }];
        if (kind === 'enum') return [{ cs: this.csNameOf(d) }];
        if (kind === 'alias') {
            const al = d.aliases[0];
            const tps = new Set(ctx.typeParams);
            // generic aliases: their parameters become dynamic
            if (al.typeParameters) for (const tp of al.typeParameters) tps.delete(tp.name.text);
            const inner = this.mapType(al.type, { container: this.scopeOf(d), typeParams: tps, selfType: ctx.selfType, depth: ctx.depth + 1 }, position);
            // a generic alias parameter that leaks out maps to dynamic
            return inner.map((m) => (al.typeParameters && al.typeParameters.some((tp) => m.cs === tp.name.text || m.cs.includes('<' + tp.name.text + '>')) ? { cs: 'dynamic' } : m));
        }
        if (kind === 'class' || kind === 'interface') {
            const arity = this.genericArity.get(d.path) || 0;
            const base = this.csNameOf(d);
            if (!arity) return [{ cs: base }];
            const targs: string[] = [];
            for (let i = 0; i < arity; i++) {
                const m = args[i] ? this.mapType(args[i], ctx)[0].cs : 'dynamic';
                targs.push(m === 'void' ? 'object' : m);
            }
            return [{ cs: base + '<' + targs.join(', ') + '>' }];
        }
        return [{ cs: 'dynamic' }];
    }

    /** Whether a declaration becomes a C# type (pure type aliases don't). */
    emitsType(c: Decl): boolean {
        if (c.classes.length || c.interfaces.length || c.enums.length || c.ctorConst || c.namespaces.length) return true;
        if (c.enumAlias) {
            const t = this.resolve(c.enumAlias, this.scopeOf(c));
            return !!(t && t.enums.length);
        }
        return false;
    }

    // ------------------------------------------------------------------ classes and mixins
    /** The class parts and interface parts of a mixin constructor's instance type `A & IMixin`. */
    ctorParts(c: Decl): { cls: Decl | null; clsNode: ts.TypeReferenceNode | null; ifaces: Decl[] } {
        const out = { cls: null as Decl | null, clsNode: null as ts.TypeReferenceNode | null, ifaces: [] as Decl[] };
        const t = c.ctorConst && c.ctorConst.type;
        if (!t) return out;
        const parts = ts.isIntersectionTypeNode(t) ? t.types : [t];
        for (const p of parts) {
            if (!ts.isTypeReferenceNode(p)) continue;
            const pd = this.resolve(nameText(p.typeName) || '', this.scopeOf(c));
            if (!pd) continue;
            if ((pd.classes.length || pd.ctorConst) && !out.cls) {
                out.cls = pd;
                out.clsNode = p;
            } else if (pd.interfaces.length) out.ifaces.push(pd);
        }
        return out;
    }

    /** Members a mixin constructor adds (its interface parts, with their base interfaces). */
    mixinMembers(c: Decl): ts.TypeElement[] {
        if (!c.ctorConst) return [];
        const out: ts.TypeElement[] = [];
        const seen = new Set<Decl>();
        const add = (d: Decl) => {
            if (seen.has(d)) return;
            seen.add(d);
            for (const i of d.interfaces) {
                out.push(...i.members);
                for (const h of i.heritageClauses || [])
                    for (const ht of h.types) {
                        const bd = this.resolve(ht.expression.getText(), this.scopeOf(d));
                        if (bd && bd.interfaces.length) add(bd);
                    }
            }
        };
        for (const d of this.ctorParts(c).ifaces) add(d);
        return out;
    }

    /** The declaration a class extends (a class, or a mixin constructor bound as a class). */
    baseDecl(c: Decl): Decl | null {
        if (c.ctorConst) return this.ctorParts(c).cls;
        const cl = c.classes[0];
        const h = cl && cl.heritageClauses ? cl.heritageClauses.find((x) => x.token === ts.SyntaxKind.ExtendsKeyword) : undefined;
        if (!h || !h.types[0]) return null;
        const bd = this.resolve(h.types[0].expression.getText(), this.scopeOf(c));
        return bd && this.declKind(bd) === 'class' ? bd : null;
    }

    // ------------------------------------------------------------------ emit helpers
    line(indent: number, s: string) {
        this.out.push('    '.repeat(indent) + s);
    }

    skip(where: string, why: string) {
        this.stats.skipped++;
        this.report.push(where + ': ' + why);
    }

    /**
     * Type parameters. Constraints are kept on methods (getComponent<T> where T : Component),
     * not on types: TS generics are structural, a C# constraint on a type would reject
     * arguments the API itself passes.
     */
    typeParamsOf(decls: readonly ts.TypeParameterDeclaration[] | undefined, ctx: MapCtx, constraints = true): { list: string; where: string; names: string[] } {
        if (!decls || !decls.length) return { list: '', where: '', names: [] };
        const names = decls.map((t) => csIdent(t.name.text).id);
        const wheres: string[] = [];
        if (constraints) for (const t of decls) {
            if (!t.constraint) continue;
            const c = this.mapType(t.constraint, ctx)[0].cs;
            if (c.startsWith('global::cc.') && !c.includes('<' + t.name.text) && this.isClassOrIface(c)) wheres.push('where ' + csIdent(t.name.text).id + ' : ' + c);
            else if (c === 'global::System.Delegate') wheres.push('where ' + csIdent(t.name.text).id + ' : global::System.Delegate');
        }
        return { list: '<' + names.join(', ') + '>', where: wheres.length ? ' ' + wheres.join(' ') : '', names };
    }

    isClassOrIface(cs: string): boolean {
        for (const [p, n] of this.csTypeName) if (n === cs.replace(/<.*$/, '')) return this.kindOf.get(p) === 'class' || this.kindOf.get(p) === 'interface';
        return false;
    }

    /** Parameter lists for one TS signature (unions in parameters expand to several lists). */
    paramVariants(params: readonly ts.ParameterDeclaration[], ctx: MapCtx): { list: string[]; ctor?: { index: number; tp: string } }[] {
        let variants: { list: string[]; ctor?: { index: number; tp: string } }[] = [{ list: [] }];
        const used = new Set<string>();
        let idx = 0;
        for (const p of params) {
            let pn = nameText(p.name) || 'arg' + idx;
            if (pn === 'this') continue;
            if (!validIdent(pn)) pn = 'arg' + idx;
            while (used.has(pn) || ctx.typeParams.has(pn)) pn = pn + '_';
            used.add(pn);
            const id = csIdent(pn).id;
            const optional = !!p.questionToken || !!p.initializer;
            let types: CsType[];
            if (p.dotDotDotToken) {
                let el: CsType = { cs: 'object' };
                if (p.type && ts.isArrayTypeNode(p.type)) el = this.mapType(p.type.elementType, ctx)[0];
                else if (p.type && ts.isTypeReferenceNode(p.type) && p.type.typeArguments && p.type.typeArguments.length) el = this.mapType(p.type.typeArguments[0], ctx)[0];
                types = [{ cs: 'params ' + (el.cs === 'void' ? 'object' : el.cs) + '[]' }];
            } else types = this.mapType(p.type, ctx, 'param');
            // `callback: any` -> System.Delegate, so methods and lambdas can be passed (C# can't convert them to dynamic)
            if (types.length === 1 && types[0].cs === 'dynamic' && /callback|handler|listener|^(cb|fn|func|selector|complete|oncomplete|onprogress|onfinish|task)$|_?fn$|func$/i.test(pn))
                types = [{ cs: 'global::System.Delegate' }];
            const next: typeof variants = [];
            for (const v of variants) {
                for (const t of types) {
                    const cs = t.cs === 'void' ? 'object' : t.cs;
                    const entry = cs + ' ' + id + (optional && !p.dotDotDotToken ? ' = default' : '');
                    const nv = { list: v.list.concat([entry]), ctor: v.ctor };
                    if (t.ctorOf && !nv.ctor) nv.ctor = { index: idx, tp: t.ctorOf };
                    next.push(nv);
                }
            }
            variants = next.slice(0, 8);
            idx++;
        }
        // C#: optional parameters must come last, params array too
        for (const v of variants) {
            let seenOpt = false;
            for (let i = 0; i < v.list.length; i++) {
                if (/ = default$/.test(v.list[i])) seenOpt = true;
                else if (seenOpt && !v.list[i].startsWith('params ')) v.list[i] += ' = default';
            }
            // a params array can't have a default
            v.list = v.list.map((e) => (e.startsWith('params ') ? e.replace(/ = default$/, '') : e));
            // a params array must be the last parameter
            const pi = v.list.findIndex((e) => e.startsWith('params '));
            if (pi >= 0 && pi !== v.list.length - 1) v.list[pi] = v.list[pi].replace(/^params /, '');
        }
        return variants;
    }

    sigKey(name: string, tpCount: number, list: string[]): string {
        // dynamic and object are the same parameter type for C# overloading
        return name + '`' + tpCount + '(' + list.map((e) => e.replace(/ = default$/, '').replace(/^params /, '').split(' ').slice(0, -1).join(' ').replace(/\bdynamic\b/g, 'object')).join(',') + ')';
    }

    tsNameAttr(orig: string, id: string): string {
        return id.replace(/^@/, '') !== orig ? '[global::cc.TsName(' + lit(orig) + ')] ' : '';
    }

    // ------------------------------------------------------------------ emit
    emitAll(): void {
        // pass: register names and arities
        const visit = (d: Decl) => {
            for (const c of d.children.values()) {
                const k = this.declKind(c);
                if (k !== 'functionNs') this.kindOf.set(c.path, k);
                this.csTypeName.set(c.path, this.csNameOf(c));
                const tps = c.classes[0]?.typeParameters || c.interfaces[0]?.typeParameters;
                if ((k === 'class' || k === 'interface') && tps) this.genericArity.set(c.path, tps.length);
                if (k === 'interface') {
                    const names: string[] = [];
                    for (const i of c.interfaces)
                        for (const m of i.members) {
                            const n = m.name ? nameText(m.name as ts.PropertyName) : null;
                            if (n && !(m as any).questionToken) names.push(n);
                        }
                    this.ifaceMembers.set(c.path, names);
                }
                if (k === 'class') {
                    const names = new Set<string>();
                    for (const cl of c.classes) for (const m of cl.members) if (m.name) names.add(nameText(m.name as ts.PropertyName) || '');
                    for (const i of c.interfaces) for (const m of i.members) if (m.name) names.add(nameText(m.name as ts.PropertyName) || '');
                    for (const m of this.mixinMembers(c)) if (m.name) names.add(nameText(m.name as ts.PropertyName) || '');
                    this.classMembers.set(c.path, names);
                    const bd = this.baseDecl(c);
                    this.classBase.set(c.path, bd ? bd.path : null);
                    const ctors: ts.NodeArray<ts.ParameterDeclaration>[] = [];
                    for (const cl of c.classes) for (const m of cl.members) if (ts.isConstructorDeclaration(m) && !hasModifier(m, ts.SyntaxKind.PrivateKeyword)) ctors.push(m.parameters);
                    this.ctorSigs.set(c.path, ctors);
                }
                visit(c);
            }
        };
        visit(this.root);

        this.out.push('// <auto-generated> Cocos Creator API bindings for C# scripting, generated from cc.d.ts by extensions/csharp.');
        this.out.push('// Declarations only: every body is `throw null`. The transpiler turns calls into TypeScript.');
        this.out.push('#pragma warning disable');
        this.out.push('namespace cc');
        this.out.push('{');
        this.emitContainerMembers(this.root, 1, true);
        this.out.push('}');
    }

    /** Emits the children (types) of a container, and its functions/variables (static members). */
    emitContainerMembers(d: Decl, indent: number, isRoot: boolean) {
        for (const c of d.children.values()) {
            if (isRoot && SKIP_ROOT.has(c.name)) continue;
            try {
                this.emitDecl(c, indent);
            } catch (e: any) {
                this.skip(c.path, 'failed: ' + (e && e.message));
            }
        }
        if (isRoot) {
            this.line(indent, '/// <summary>Module-level functions and variables of \'cc\' (director, input, instantiate, tween...). Use <c>using static cc.Globals;</c></summary>');
            this.line(indent, 'public static partial class Globals');
            this.line(indent, '{');
            this.emitStatics(d, indent + 1, null);
            this.line(indent, '}');
        }
    }

    emitStatics(d: Decl, indent: number, selfType: string | null) {
        const ctx: MapCtx = { container: d, typeParams: new Set(), selfType, depth: 0 };
        const seen = new Set<string>();
        // `const X: typeof notAnEnum` (functions, classes): a dynamic static
        const dynAliases: string[] = [];
        for (const c of d.children.values()) {
            if (!c.enumAlias) continue;
            const t = this.resolve(c.enumAlias, d);
            if (!t || !t.enums.length) dynAliases.push(c.name);
        }
        const memberNames = new Set<string>(
            Array.from(d.children.keys())
                .filter((k) => dynAliases.indexOf(k) < 0)
                .map((k) => this.typeMemberName(d.children.get(k)!))
        );
        for (const n of dynAliases) {
            const id = csIdent(n);
            if (memberNames.has(n)) continue;
            seen.add('P:' + n);
            this.line(indent, this.tsNameAttr(n, id.id) + 'public static dynamic ' + id.id + ' { get => throw null; }');
            this.stats.variables++;
        }
        // members can't be named like their class: `namespace js { function js() }`
        const selfId = d.name ? csIdent(this.typeMemberName(d)).id : 'Globals';
        for (const f of d.functions) this.emitMethod(f, ctx, indent, true, seen, d.path || 'cc', memberNames, false, false, selfId);
        for (const v of d.variables) {
            const n = nameText(v.decl.name);
            if (!n) continue;
            if (csIdent(n).id === selfId) {
                this.skip((d.path ? d.path + '.' : '') + n, 'variable named like its namespace');
                continue;
            }
            if (memberNames.has(n) && !d.children.get(n)?.namespaces.length) {
                this.skip((d.path ? d.path + '.' : '') + n, 'variable clashes with a type of the same name');
                continue;
            }
            const key = 'P:' + n;
            if (seen.has(key)) continue;
            seen.add(key);
            const type = this.varType(v.decl, d, indent);
            if (!type) continue;
            const id = csIdent(n);
            this.line(indent, this.tsNameAttr(n, id.id) + 'public static ' + type + ' ' + id.id + (v.isConst ? ' { get => throw null; }' : ' { get => throw null; set => throw null; }'));
            this.stats.variables++;
        }
    }

    /** The C# type of a module variable; object literal types become a nested class. */
    varType(v: ts.VariableDeclaration, d: Decl, indent: number): string | null {
        const n = nameText(v.name) || '';
        const t = v.type;
        const ctx: MapCtx = { container: d, typeParams: new Set(), selfType: null, depth: 0 };
        if (t && ts.isTypeLiteralNode(t)) {
            const cls = csIdent(n + '_t').id;
            this.line(indent, '[global::cc.TsAny] public sealed partial class ' + cls);
            this.line(indent, '{');
            this.emitTypeLiteralMembers(t, { ...ctx, selfType: cls }, indent + 1);
            this.line(indent, '}');
            return cls;
        }
        if (t && ts.isTypeQueryNode(t)) {
            const q = nameText(t.exprName);
            const qd = q ? this.resolve(q, d) : null;
            if (qd && (qd.enums.length || qd.classes.length)) {
                // `const X: typeof Y`: X can be used like Y's static side, but C# has no alias members
                this.skip((d.path ? d.path + '.' : '') + n, 'typeof alias variable');
                return 'dynamic';
            }
        }
        const m = this.mapType(t, ctx)[0].cs;
        return m === 'void' ? 'object' : m;
    }

    emitTypeLiteralMembers(t: ts.TypeLiteralNode, ctx: MapCtx, indent: number) {
        const seen = new Set<string>();
        for (const m of t.members) {
            if (ts.isPropertySignature(m)) {
                const n = nameText(m.name);
                if (!n || seen.has('P:' + n)) continue;
                seen.add('P:' + n);
                const id = csIdent(n);
                if (id.id === ctx.selfType) continue;
                const type = this.mapType(m.type, ctx)[0].cs;
                this.line(indent, this.tsNameAttr(n, id.id) + 'public ' + (type === 'void' ? 'object' : type) + ' ' + id.id + (hasModifier(m, ts.SyntaxKind.ReadonlyKeyword) ? ' { get => throw null; }' : ' { get => throw null; set => throw null; }'));
                this.stats.members++;
            } else if (ts.isMethodSignature(m)) {
                this.emitMethod(m, ctx, indent, false, seen, ctx.selfType || '', new Set(), false);
            }
        }
    }

    emitDecl(d: Decl, indent: number) {
        if (d.enumAlias) {
            const t = this.resolve(d.enumAlias, this.scopeOf(d));
            if (t && t.enums.length) {
                this.emitEnumCopy(t, d.name, indent);
                this.stats.variables++;
            }
            // other `typeof` aliases are bound as dynamic statics by emitStatics
            return;
        }
        const k = this.declKind(d);
        if (k === 'alias' && !d.namespaces.length) return; // aliases resolve at use sites
        if (k === 'class') return this.emitClass(d, indent);
        if (k === 'interface') return this.emitInterface(d, indent);
        if (k === 'enum') return this.emitEnum(d, indent);
        if (k === 'stringEnum') return this.emitStringEnum(d, indent);
        // namespace (possibly merged with an alias)
        if (d.namespaces.length) return this.emitNamespace(d, indent);
    }

    emitNamespace(d: Decl, indent: number) {
        const id = csIdent(this.typeMemberName(d));
        this.line(indent, this.tsNameAttr(d.name, id.id).replace(d.name, this.typeMemberName(d) === d.name ? d.name : d.name) + 'public static partial class ' + id.id);
        this.line(indent, '{');
        this.emitContainerMembers(d, indent + 1, false);
        this.emitStatics(d, indent + 1, null);
        this.line(indent, '}');
    }

    emitEnum(d: Decl, indent: number) {
        const id = csIdent(d.name);
        let next = 0;
        let big = false;
        const members: string[] = [];
        const seen = new Set<string>();
        for (const e of d.enums)
            for (const m of e.members) {
                const n = nameText(m.name);
                if (!n || seen.has(n)) continue;
                seen.add(n);
                let val: number | null = null;
                if (!m.initializer) val = next;
                else if (ts.isNumericLiteral(m.initializer)) val = Number(m.initializer.text);
                else if (ts.isPrefixUnaryExpression(m.initializer) && m.initializer.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(m.initializer.operand)) val = -Number(m.initializer.operand.text);
                if (val === null || !Number.isInteger(val)) {
                    this.skip(d.path + '.' + n, 'non-integer enum value');
                    continue;
                }
                if (val > 2147483647 || val < -2147483648) big = true;
                next = val + 1;
                const mid = csIdent(n);
                members.push(this.tsNameAttr(n, mid.id) + mid.id + ' = ' + val + ',');
            }
        const isConst = d.enums.some((e) => hasModifier(e, ts.SyntaxKind.ConstKeyword));
        this.line(indent, (isConst ? '[global::cc.TsConstEnum] ' : '') + this.tsNameAttr(d.name, id.id) + 'public enum ' + id.id + (big ? ' : long' : ''));
        this.line(indent, '{');
        for (const m of members) this.line(indent + 1, m);
        this.line(indent, '}');
        this.stats.enums++;
        if (d.namespaces.length) this.skip(d.path, 'namespace merged with an enum: its members are not bound');
    }

    emitStringEnum(d: Decl, indent: number, asName?: string) {
        const id = csIdent(asName || d.name);
        this.line(indent, '[global::cc.TsStringEnum] ' + this.tsNameAttr(asName || d.name, id.id) + 'public static partial class ' + id.id);
        this.line(indent, '{');
        const seen = new Set<string>();
        for (const e of d.enums)
            for (const m of e.members) {
                const n = nameText(m.name);
                if (!n || seen.has(n)) continue;
                seen.add(n);
                const mid = csIdent(n);
                if (mid.id === id.id) continue;
                if (m.initializer && ts.isStringLiteral(m.initializer)) this.line(indent + 1, this.tsNameAttr(n, mid.id) + 'public const string ' + mid.id + ' = ' + lit(m.initializer.text) + ';');
                else if (m.initializer && ts.isNumericLiteral(m.initializer)) this.line(indent + 1, this.tsNameAttr(n, mid.id) + 'public const double ' + mid.id + ' = ' + m.initializer.text + ';');
            }
        this.line(indent, '}');
        if (!asName) this.stats.enums++;
    }

    /** Copies an enum as a nested class (for `static EventType: typeof NodeEventType`). */
    emitEnumCopy(target: Decl, name: string, indent: number) {
        if (this.declKind(target) === 'stringEnum') return this.emitStringEnum(target, indent, name);
        const id = csIdent(name);
        const enumCs = this.csNameOf(target);
        this.line(indent, '[global::cc.TsEnumAlias] ' + this.tsNameAttr(name, id.id) + 'public static partial class ' + id.id);
        this.line(indent, '{');
        const seen = new Set<string>();
        for (const e of target.enums)
            for (const m of e.members) {
                const n = nameText(m.name);
                if (!n || seen.has(n)) continue;
                seen.add(n);
                const mid = csIdent(n);
                if (mid.id === id.id) continue;
                this.line(indent + 1, this.tsNameAttr(n, mid.id) + 'public const ' + enumCs + ' ' + mid.id + ' = ' + enumCs + '.' + mid.id + ';');
            }
        this.line(indent, '}');
    }

    implementsFor(d: Decl): string[] {
        // declared implements + structural matches (all required member names present)
        const out: string[] = [];
        const all = new Set<string>();
        for (let p: string | null | undefined = d.path; p; p = this.classBase.get(p)) {
            const ms = this.classMembers.get(p);
            if (ms) for (const m of ms) all.add(m);
        }
        for (const [ipath, names] of this.ifaceMembers) {
            if (this.genericArity.get(ipath)) continue;
            if (!names.length || names.length > 40) continue;
            if (names.every((n) => all.has(n))) out.push(this.csTypeName.get(ipath)!);
        }
        return out;
    }

    emitClass(d: Decl, indent: number) {
        const cl = d.classes[0] as ts.ClassDeclaration | undefined;
        const tps = cl ? cl.typeParameters : undefined;
        const tpCtx: MapCtx = { container: this.scopeOf(d), typeParams: new Set((tps || []).map((t) => t.name.text)), selfType: null, depth: 0 };
        const tp = this.typeParamsOf(tps, tpCtx, false);
        const id = csIdent(d.name);
        const selfCs = id.id + tp.list;
        // `this` maps to the qualified name, so `this | Node` collapses to one type
        const ctx: MapCtx = { ...tpCtx, selfType: this.csNameOf(d) + tp.list };
        // base class: `extends X` (X may be a mixin constructor bound as a class)
        let baseCs: string | null = null;
        const bd = this.baseDecl(d);
        let baseArgs: readonly ts.TypeNode[] | undefined;
        if (cl) {
            const ext = cl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
            baseArgs = ext && ext.types[0] ? ext.types[0].typeArguments : undefined;
            if (ext && ext.types[0] && !bd) this.skip(d.path, 'base class "' + ext.types[0].expression.getText() + '" not bound');
        } else if (d.ctorConst) {
            const parts = this.ctorParts(d);
            baseArgs = parts.clsNode ? parts.clsNode.typeArguments : undefined;
        }
        if (bd) {
            const arity = this.genericArity.get(bd.path) || 0;
            const targs: string[] = [];
            for (let i = 0; i < arity; i++) targs.push(baseArgs && baseArgs[i] ? this.mapType(baseArgs[i], ctx)[0].cs : 'dynamic');
            baseCs = this.csNameOf(bd) + (arity ? '<' + targs.map((t) => (t === 'void' ? 'object' : t)).join(', ') + '>' : '');
        }
        const ifaces = this.implementsFor(d).filter((i) => i !== this.csNameOf(d));
        const heads = (baseCs ? [baseCs] : []).concat(ifaces);
        const abs = cl && hasModifier(cl, ts.SyntaxKind.AbstractKeyword) ? 'abstract ' : '';
        this.line(indent, this.tsNameAttr(d.name, id.id) + 'public ' + abs + 'partial class ' + selfCs + (heads.length ? ' : ' + heads.join(', ') : '') + tp.where);
        this.line(indent, '{');
        this.stats.classes++;
        const seen = new Set<string>();
        // nested C# types of the merged namespace (type aliases are not types in C#)
        const childNames = new Set<string>(Array.from(d.children.values()).filter((c) => this.emitsType(c)).map((c) => c.name));
        // marker constructor, so derived bindings never depend on a base signature
        this.line(indent + 1, 'protected ' + id.id + '(global::cc.TsInit _)' + (baseCs ? ' : base(_)' : '') + ' { }');
        // constructors: declared, else inherited signatures
        let ctorParams = this.ctorSigs.get(d.path) || [];
        for (let p = this.classBase.get(d.path); !ctorParams.length && p; p = this.classBase.get(p)) ctorParams = this.ctorSigs.get(p) || [];
        if (!ctorParams.length) ctorParams = [ts.factory.createNodeArray([])];
        for (const ps of ctorParams) {
            for (const v of this.paramVariants(ps, ctx)) {
                const key = this.sigKey('.ctor', 0, v.list);
                if (seen.has(key)) continue;
                seen.add(key);
                this.line(indent + 1, 'public ' + id.id + '(' + v.list.join(', ') + ')' + (baseCs ? ' : base(default(global::cc.TsInit))' : '') + ' { }');
            }
        }
        // members of the class and of interfaces merged into it
        const members: ts.ClassElement[] = [];
        for (const c of d.classes) members.push(...c.members);
        const ifaceMembers: ts.TypeElement[] = [];
        for (const i of d.interfaces) ifaceMembers.push(...i.members);
        // a mixin constructor's interface parts (EventTarget's on/off/emit...) become real members
        ifaceMembers.push(...this.mixinMembers(d));
        this.emitMembers(members, ifaceMembers, ctx, indent + 1, seen, d, childNames, id.id);
        // namespace merged into the class: nested types and statics
        if (d.namespaces.length) {
            this.emitContainerMembers(d, indent + 1, false);
            this.emitStatics(d, indent + 1, null);
        }
        this.line(indent, '}');
    }

    emitMembers(members: readonly ts.ClassElement[], ifaceMembers: readonly ts.TypeElement[], ctx: MapCtx, indent: number, seen: Set<string>, d: Decl, childNames: Set<string>, selfId: string) {
        // properties first (getter/setter pairs merge)
        const props = new Map<string, { type?: ts.TypeNode; get: boolean; set: boolean; isStatic: boolean; protectedAcc: boolean; readonly: boolean; typeQuery?: Decl }>();
        const methods: (ts.MethodDeclaration | ts.MethodSignature)[] = [];
        const addProp = (n: string, type: ts.TypeNode | undefined, isStatic: boolean, prot: boolean, get: boolean, set: boolean, ro: boolean) => {
            const key = (isStatic ? 'S:' : 'I:') + n;
            const p = props.get(key) || { type, get: false, set: false, isStatic, protectedAcc: prot, readonly: ro };
            if (!p.type && type) p.type = type;
            p.get = p.get || get;
            p.set = p.set || set;
            p.readonly = p.readonly && ro;
            props.set(key, p);
        };
        for (const m of members) {
            if (hasModifier(m, ts.SyntaxKind.PrivateKeyword)) continue;
            const n = m.name ? nameText(m.name as ts.PropertyName) : null;
            if (!n || n.startsWith('#')) continue;
            const isStatic = hasModifier(m, ts.SyntaxKind.StaticKeyword);
            const prot = hasModifier(m, ts.SyntaxKind.ProtectedKeyword);
            if (ts.isPropertyDeclaration(m)) {
                if (m.type && ts.isFunctionTypeNode(m.type) && m.questionToken && !isStatic) {
                    // optional callback members such as `onLoad?(): void` declared as properties: treat as methods
                }
                addProp(n, m.type, isStatic, prot, true, !hasModifier(m, ts.SyntaxKind.ReadonlyKeyword), hasModifier(m, ts.SyntaxKind.ReadonlyKeyword));
            } else if (ts.isGetAccessorDeclaration(m)) addProp(n, m.type, isStatic, prot, true, false, true);
            else if (ts.isSetAccessorDeclaration(m)) addProp(n, m.parameters[0] && m.parameters[0].type, isStatic, prot, false, true, false);
            else if (ts.isMethodDeclaration(m)) methods.push(m);
        }
        for (const m of ifaceMembers) {
            const n = m.name ? nameText(m.name as ts.PropertyName) : null;
            if (!n) continue;
            if (ts.isPropertySignature(m)) addProp(n, m.type, false, false, true, !hasModifier(m, ts.SyntaxKind.ReadonlyKeyword), hasModifier(m, ts.SyntaxKind.ReadonlyKeyword));
            else if (ts.isMethodSignature(m)) methods.push(m);
        }
        const methodNames = new Set(methods.map((m) => nameText(m.name as ts.PropertyName) || ''));
        // overloads taking a constructor (load<T>(path, type, cb)) first: their generic variant without
        // that argument (load<T>(path, cb) passing T) wins over an untyped overload with the same C# signature
        const hasCtorParam = (m: ts.MethodDeclaration | ts.MethodSignature) => m.parameters.some((p) => !!p.type && /Constructor|AssetType/.test(p.type.getText()));
        methods.sort((a, b) => Number(hasCtorParam(b)) - Number(hasCtorParam(a)));
        for (const [key, p] of props) {
            const n = key.slice(2);
            let id = csIdent(n);
            if (id.id === selfId) id = { id: n + '_', renamed: true };
            if (childNames.has(n)) {
                // a nested type of the same name (namespace merge): `static EventType: typeof NodeEventType`
                continue;
            }
            if (seen.has('P:' + n) || seen.has('M:' + n)) {
                this.skip(d.path + '.' + n, 'member name used twice (static and instance, or property and method)');
                continue;
            }
            // `static X: typeof SomeEnum` -> nested class copying the enum
            if (p.isStatic && p.type && ts.isTypeQueryNode(p.type)) {
                const q = nameText(p.type.exprName);
                const qd = q ? this.resolve(q, this.scopeOf(d)) : null;
                if (qd && qd.enums.length) {
                    seen.add('P:' + n);
                    this.emitEnumCopy(qd, n, indent);
                    this.stats.members++;
                    continue;
                }
            }
            if (methodNames.has(n)) {
                this.skip(d.path + '.' + n, 'property and method share a name; the property is kept');
            }
            seen.add('P:' + n);
            let type = this.mapType(p.type, ctx)[0].cs;
            if (type === 'void') type = 'object';
            const acc = p.protectedAcc ? 'protected ' : 'public ';
            const mod = p.isStatic ? 'static ' : 'virtual ';
            const body = p.set && !p.readonly ? ' { get => throw null; set => throw null; }' : ' { get => throw null; }';
            this.line(indent, this.tsNameAttr(n, id.id) + acc + mod + type + ' ' + id.id + body);
            this.stats.members++;
        }
        for (const m of methods) {
            const n = nameText(m.name as ts.PropertyName) || '';
            if (seen.has('P:' + n)) continue;
            const isStatic = hasModifier(m, ts.SyntaxKind.StaticKeyword);
            const prot = hasModifier(m, ts.SyntaxKind.ProtectedKeyword);
            if (childNames.has(n)) {
                this.skip(d.path + '.' + n, 'method clashes with a nested type');
                continue;
            }
            this.emitMethod(m, ctx, indent, isStatic, seen, d.path, new Set(), true, prot, selfId);
        }
    }

    emitMethod(m: ts.FunctionDeclaration | ts.MethodDeclaration | ts.MethodSignature, outer: MapCtx, indent: number, isStatic: boolean, seen: Set<string>, where: string, typeNames: Set<string>, virt = false, prot = false, selfId = '') {
        const n = m.name ? nameText(m.name as ts.PropertyName) : null;
        if (!n) return;
        if (typeNames.has(n)) {
            this.skip(where + '.' + n, 'function clashes with a type of the same name');
            return;
        }
        let id = csIdent(n);
        if (id.id === selfId) id = { id: n + '_', renamed: true };
        const ctx: MapCtx = { ...outer, typeParams: new Set([...outer.typeParams, ...((m.typeParameters || []).map((t) => t.name.text))]) };
        const tp = this.typeParamsOf(m.typeParameters, ctx);
        let ret = this.mapType(m.type, ctx)[0].cs;
        if (ret.startsWith('params ')) ret = ret.slice(7);
        const acc = prot ? 'protected ' : 'public ';
        const mod = isStatic ? 'static ' : virt ? 'virtual ' : '';
        for (const v of this.paramVariants(m.parameters, ctx)) {
            const key = this.sigKey(n, tp.names.length, v.list);
            if (seen.has(key)) continue;
            seen.add(key);
            seen.add('M:' + n);
            const body = ret === 'void' ? ' { }' : ' => throw null;';
            this.line(indent, this.tsNameAttr(n, id.id) + acc + mod + ret + ' ' + id.id + tp.list + '(' + v.list.join(', ') + ')' + tp.where + body);
            this.stats.members++;
            if (!isStatic && !virt) this.stats.functions++;
            if (isStatic && where && !where.includes('.') && typeNames.size) this.stats.functions++;
            // generic overload without the constructor argument: getComponent<Sprite>()
            if (v.ctor) {
                const tpIndex = tp.names.indexOf(csIdent(v.ctor.tp).id);
                if (tpIndex >= 0) {
                    const list2 = v.list.filter((_, i) => i !== v.ctor!.index);
                    // parameters after a removed one may now need defaults
                    const key2 = this.sigKey(n, tp.names.length, list2);
                    if (!seen.has(key2)) {
                        seen.add(key2);
                        this.line(indent, '[global::cc.TsCtorArg(' + v.ctor.index + ', ' + tpIndex + ')] ' + this.tsNameAttr(n, id.id) + acc + mod + ret + ' ' + id.id + tp.list + '(' + list2.join(', ') + ')' + tp.where + body);
                        this.stats.members++;
                    }
                }
            }
        }
    }

    emitInterface(d: Decl, indent: number) {
        const it = d.interfaces[0];
        const ctx: MapCtx = { container: this.scopeOf(d), typeParams: new Set((it.typeParameters || []).map((t) => t.name.text)), selfType: null, depth: 0 };
        const tp = this.typeParamsOf(it.typeParameters, ctx, false);
        const id = csIdent(d.name);
        const bases: string[] = [];
        for (const i of d.interfaces)
            for (const h of i.heritageClauses || [])
                for (const t of h.types) {
                    const bn = t.expression.getText();
                    const bd = this.resolve(bn, this.scopeOf(d));
                    if (bd && this.declKind(bd) === 'interface' && !this.genericArity.get(bd.path) && bd !== d) bases.push(this.csNameOf(bd));
                }
        this.line(indent, this.tsNameAttr(d.name, id.id) + 'public partial interface ' + id.id + tp.list + (bases.length ? ' : ' + Array.from(new Set(bases)).join(', ') : '') + tp.where);
        this.line(indent, '{');
        this.stats.interfaces++;
        const seen = new Set<string>();
        for (const i of d.interfaces)
            for (const m of i.members) {
                const n = m.name ? nameText(m.name as ts.PropertyName) : null;
                if (!n) continue;
                let mid = csIdent(n);
                if (mid.id === id.id) mid = { id: n + '_', renamed: true };
                if (ts.isPropertySignature(m)) {
                    if (seen.has('P:' + n)) continue;
                    seen.add('P:' + n);
                    let type = this.mapType(m.type, { ...ctx, selfType: id.id + tp.list })[0].cs;
                    if (type === 'void') type = 'object';
                    this.line(indent + 1, this.tsNameAttr(n, mid.id) + type + ' ' + mid.id + (hasModifier(m, ts.SyntaxKind.ReadonlyKeyword) ? ' { get => throw null; }' : ' { get => throw null; set => throw null; }'));
                    this.stats.members++;
                } else if (ts.isMethodSignature(m)) {
                    if (seen.has('P:' + n)) continue;
                    const mctx: MapCtx = { ...ctx, selfType: id.id + tp.list, typeParams: new Set([...ctx.typeParams, ...((m.typeParameters || []).map((t) => t.name.text))]) };
                    const mtp = this.typeParamsOf(m.typeParameters, mctx);
                    const ret = this.mapType(m.type, mctx)[0].cs;
                    for (const v of this.paramVariants(m.parameters, mctx)) {
                        const key = this.sigKey(n, mtp.names.length, v.list);
                        if (seen.has(key)) continue;
                        seen.add(key);
                        this.line(indent + 1, this.tsNameAttr(n, mid.id) + ret + ' ' + mid.id + mtp.list + '(' + v.list.join(', ') + ')' + mtp.where + (ret === 'void' ? ' { }' : ' => throw null;'));
                        this.stats.members++;
                    }
                }
            }
        this.line(indent, '}');
        if (d.namespaces.length) {
            // interface + namespace: the namespace becomes a sibling static class
            this.line(indent, 'public static partial class ' + id.id + '_ns');
            this.line(indent, '{');
            this.emitContainerMembers(d, indent + 1, false);
            this.emitStatics(d, indent + 1, null);
            this.line(indent, '}');
            this.skip(d.path, 'namespace merged with an interface is bound as ' + d.name + '_ns');
        }
    }
}

/** Generates the bindings from the text of cc.d.ts. */
export function generateBindings(dts: string): BindingsResult {
    const sf = ts.createSourceFile('cc.d.ts', dts, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const g = new Generator();
    for (const st of sf.statements) {
        if (ts.isModuleDeclaration(st) && st.name.text === 'cc' && st.body && ts.isModuleBlock(st.body)) g.collect(st.body, g.root);
    }
    g.applyImports(g.root);
    g.fixPaths(g.root);
    g.emitAll();
    return { code: g.out.join('\n') + '\n', report: g.report, stats: g.stats };
}
