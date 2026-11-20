"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
)), __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// source/bindings/generate.ts
var generate_exports = {};
__export(generate_exports, {
  generateBindings: () => generateBindings
});
module.exports = __toCommonJS(generate_exports);
var ts = __toESM(require("typescript")), CS_KEYWORDS = new Set(
  "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while".split(" ")
), SKIP_ROOT = /* @__PURE__ */ new Set(["_decorator"]);
function newDecl(name, parent) {
  return {
    name,
    path: parent && parent.path ? parent.path + "." + name : name,
    parent,
    classes: [],
    interfaces: [],
    enums: [],
    aliases: [],
    namespaces: [],
    functions: [],
    variables: [],
    children: /* @__PURE__ */ new Map(),
    imports: []
  };
}
function hasModifier(node, kind) {
  return ((ts.canHaveModifiers(node) ? ts.getModifiers(node) : void 0) || []).some((m) => m.kind === kind);
}
function nameText(n) {
  return n ? ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : ts.isQualifiedName(n) ? nameText(n.left) + "." + n.right.text : null : null;
}
function validIdent(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
function csIdent(name) {
  if (!validIdent(name)) {
    let id = name.replace(/\$/g, "_S_").replace(/[^A-Za-z0-9_]/g, (c) => "_x" + c.charCodeAt(0).toString(16) + "_");
    return /^[A-Za-z_]/.test(id) || (id = "_" + id), { id, renamed: !0 };
  }
  return CS_KEYWORDS.has(name) ? { id: "@" + name, renamed: !1 } : { id: name, renamed: !1 };
}
function lit(s) {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}
var Generator = class {
  constructor() {
    this.root = newDecl("", null);
    this.report = [];
    this.stats = { classes: 0, interfaces: 0, enums: 0, functions: 0, variables: 0, members: 0, skipped: 0 };
    this.out = [];
    /** TS path -> C# qualified type name for every emitted type. */
    this.csTypeName = /* @__PURE__ */ new Map();
    /** TS path -> kind of the emitted entity. */
    this.kindOf = /* @__PURE__ */ new Map();
    /** Interfaces: TS path -> required member names (for structural implements). */
    this.ifaceMembers = /* @__PURE__ */ new Map();
    /** Classes: TS path -> member names (own). */
    this.classMembers = /* @__PURE__ */ new Map();
    this.classBase = /* @__PURE__ */ new Map();
    /** Constructor signatures per class path (TS parameter lists). */
    this.ctorSigs = /* @__PURE__ */ new Map();
    this.genericArity = /* @__PURE__ */ new Map();
  }
  // ------------------------------------------------------------------ collect
  collect(body, into) {
    for (let st of body.statements) {
      let name = null;
      if (ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isEnumDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isFunctionDeclaration(st))
        name = st.name ? st.name.text : null;
      else if (ts.isModuleDeclaration(st))
        name = nameText(st.name);
      else if (ts.isImportEqualsDeclaration(st)) {
        if (!ts.isExternalModuleReference(st.moduleReference)) {
          let target = nameText(st.moduleReference);
          target && into.imports.push({ name: st.name.text, target });
        }
        continue;
      } else if (ts.isVariableStatement(st)) {
        let isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
        for (let d2 of st.declarationList.declarations) {
          let n = nameText(d2.name);
          if (!n) continue;
          let existing = into.children.get(n), free = !existing || !existing.classes.length && !existing.enums.length && !existing.interfaces.length;
          if (d2.type && ts.isConstructorTypeNode(d2.type) && free) {
            let c = existing || newDecl(n, into);
            c.ctorConst = d2.type, into.children.set(n, c);
            continue;
          }
          if (d2.type && ts.isTypeQueryNode(d2.type) && free) {
            let q = nameText(d2.type.exprName);
            if (q) {
              let c = existing || newDecl(n, into);
              c.enumAlias = q, into.children.set(n, c);
              continue;
            }
          }
          into.variables.push({ decl: d2, isConst });
        }
        continue;
      } else continue;
      if (!name) continue;
      if (ts.isFunctionDeclaration(st)) {
        into.functions.push(st);
        continue;
      }
      let d = into.children.get(name);
      d || (d = newDecl(name, into), into.children.set(name, d)), ts.isClassDeclaration(st) ? d.classes.push(st) : ts.isInterfaceDeclaration(st) ? d.interfaces.push(st) : ts.isEnumDeclaration(st) ? d.enums.push(st) : ts.isTypeAliasDeclaration(st) ? d.aliases.push(st) : ts.isModuleDeclaration(st) && (d.namespaces.push(st), st.body && ts.isModuleBlock(st.body) && this.collect(st.body, d)), (ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && (d.ctorConst = void 0, d.enumAlias = void 0);
    }
  }
  /**
   * `export import Vec3 = math.Vec3;`: the type moves to the container of the alias (one C#
   * type, at the place users know it from); functions and constants are copied.
   */
  applyImports(d) {
    for (let c of Array.from(d.children.values())) this.applyImports(c);
    for (let im of d.imports) {
      let lastDot = im.target.lastIndexOf("."), owner = lastDot > 0 ? this.resolve(im.target.slice(0, lastDot), d) : d, leaf = im.target.slice(lastDot + 1), t = this.resolve(im.target, d);
      if (t && t.parent !== d && (im.name !== leaf || d.children.has(im.name) ? this.skip((d.path ? d.path + "." : "") + im.name, "alias of " + im.target + " (bound under its own name)") : t.parent && (t.parent.children.delete(leaf), (t.parent.moved = t.parent.moved || /* @__PURE__ */ new Map()).set(leaf, t), t.scope = t.scope || t.parent, t.parent = d, d.children.set(leaf, t))), owner) {
        for (let f of owner.functions) f.name && f.name.text === leaf && im.name === leaf && d.functions.push(f);
        for (let v of owner.variables) nameText(v.decl.name) === leaf && im.name === leaf && d.variables.push(v);
      }
    }
  }
  /** Recomputes qualified paths after moves. */
  fixPaths(d) {
    for (let c of d.children.values())
      c.path = d.path ? d.path + "." + c.name : c.name, this.fixPaths(c);
  }
  /** Where names used inside a declaration resolve. */
  scopeOf(d) {
    return d.scope || d.parent || this.root;
  }
  // ------------------------------------------------------------------ resolve
  /** Finds the declaration a (possibly dotted) name refers to, from a container outward. */
  resolve(name, from) {
    let parts = name.split("."), child = (c, n) => c.children.get(n) || (c.moved ? c.moved.get(n) : void 0);
    for (let c = from; c; c = c.scope || c.parent) {
      let d = child(c, parts[0]);
      for (let i = 1; d && i < parts.length; i++) d = child(d, parts[i]);
      if (d) return d;
    }
    return null;
  }
  declKind(d) {
    if (d.classes.length || d.ctorConst) return "class";
    if (d.enumAlias) {
      let t = this.resolve(d.enumAlias, this.scopeOf(d));
      return t && t.enums.length ? this.isStringEnum(t.enums) ? "stringEnum" : "enum" : "alias";
    }
    return d.enums.length ? this.isStringEnum(d.enums) ? "stringEnum" : "enum" : d.interfaces.length ? "interface" : d.aliases.length ? "alias" : "namespace";
  }
  isStringEnum(enums) {
    for (let e of enums) for (let m of e.members) if (m.initializer && ts.isStringLiteral(m.initializer)) return !0;
    return !1;
  }
  /** C# type name of a declaration (fully qualified). */
  csNameOf(d) {
    let parts = [];
    for (let c = d; c && c.name; c = c.parent) parts.unshift(csIdent(this.typeMemberName(c)).id);
    return "global::cc." + parts.join(".");
  }
  /** The C# name used for a declaration as a type (namespace merged with a function gets a suffix). */
  typeMemberName(d) {
    return d.parent && !d.classes.length && !d.enums.length && !d.interfaces.length && d.parent.functions.some((f) => f.name && f.name.text === d.name) || d.parent && !d.classes.length && !d.enums.length && !d.interfaces.length && d.parent.variables.some((v) => nameText(v.decl.name) === d.name) ? d.name + "_ns" : d.name;
  }
  // ------------------------------------------------------------------ type mapping
  mapType(node, ctx, position = "other") {
    if (!node) return [{ cs: "dynamic" }];
    if (ctx.depth > 12) return [{ cs: "dynamic" }];
    let sub = { ...ctx, depth: ctx.depth + 1 };
    switch (node.kind) {
      case ts.SyntaxKind.NumberKeyword:
        return [{ cs: "double" }];
      case ts.SyntaxKind.StringKeyword:
        return [{ cs: "string" }];
      case ts.SyntaxKind.BooleanKeyword:
        return [{ cs: "bool" }];
      case ts.SyntaxKind.VoidKeyword:
        return [{ cs: "void" }];
      case ts.SyntaxKind.AnyKeyword:
        return [{ cs: "dynamic" }];
      case ts.SyntaxKind.UnknownKeyword:
      case ts.SyntaxKind.ObjectKeyword:
        return [{ cs: "object" }];
      case ts.SyntaxKind.NeverKeyword:
      case ts.SyntaxKind.UndefinedKeyword:
      case ts.SyntaxKind.NullKeyword:
        return [{ cs: "object" }];
      case ts.SyntaxKind.BigIntKeyword:
        return [{ cs: "long" }];
      case ts.SyntaxKind.SymbolKeyword:
        return [{ cs: "object" }];
      case ts.SyntaxKind.ThisType:
        return [{ cs: ctx.selfType || "dynamic" }];
    }
    if (ts.isParenthesizedTypeNode(node)) return this.mapType(node.type, sub, position);
    if (ts.isLiteralTypeNode(node)) {
      let l = node.literal;
      return ts.isStringLiteral(l) ? [{ cs: "string" }] : ts.isNumericLiteral(l) || ts.isPrefixUnaryExpression(l) ? [{ cs: "double" }] : l.kind === ts.SyntaxKind.TrueKeyword || l.kind === ts.SyntaxKind.FalseKeyword ? [{ cs: "bool" }] : [{ cs: "object" }];
    }
    if (ts.isTypeOperatorNode(node))
      return node.operator === ts.SyntaxKind.ReadonlyKeyword ? this.mapType(node.type, sub, position) : node.operator === ts.SyntaxKind.KeyOfKeyword ? [{ cs: "string" }] : [{ cs: "dynamic" }];
    if (ts.isArrayTypeNode(node)) {
      let el = this.mapType(node.elementType, sub)[0];
      return el.cs === "void" ? [{ cs: "object[]" }] : [{ cs: el.cs + "[]" }];
    }
    if (ts.isTupleTypeNode(node)) return [{ cs: "object[]" }];
    if (ts.isUnionTypeNode(node)) return this.mapUnion(node, sub, position);
    if (ts.isIntersectionTypeNode(node)) {
      for (let t of node.types) {
        let m = this.mapType(t, sub)[0];
        if (m.cs !== "dynamic" && m.cs !== "object") return [m];
      }
      return [{ cs: "dynamic" }];
    }
    if (ts.isFunctionTypeNode(node)) return [{ cs: this.mapFunctionType(node, sub) }];
    if (ts.isConstructorTypeNode(node)) {
      let r = node.type && ts.isTypeReferenceNode(node.type) ? nameText(node.type.typeName) : null;
      return [{ cs: "global::System.Type", ctorOf: r && ctx.typeParams.has(r) ? r : void 0 }];
    }
    if (ts.isTypeQueryNode(node)) {
      let n = nameText(node.exprName), d = n ? this.resolve(n, ctx.container) : null;
      return d && d.classes.length ? [{ cs: "global::System.Type" }] : [{ cs: "dynamic" }];
    }
    return ts.isTypeLiteralNode(node) || ts.isMappedTypeNode(node) || ts.isConditionalTypeNode(node) || ts.isIndexedAccessTypeNode(node) ? [{ cs: "dynamic" }] : ts.isTypePredicateNode(node) ? [{ cs: node.assertsModifier ? "void" : "bool" }] : ts.isTypeReferenceNode(node) ? this.mapRef(node, sub, position) : [{ cs: "dynamic" }];
  }
  mapUnion(node, ctx, position) {
    let parts = node.types.filter((t) => t.kind !== ts.SyntaxKind.NullKeyword && t.kind !== ts.SyntaxKind.UndefinedKeyword && t.kind !== ts.SyntaxKind.VoidKeyword && !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword));
    if (!parts.length) return [{ cs: "object" }];
    if (parts.length === 1) return this.mapType(parts[0], ctx, position);
    let mapped = [];
    for (let p of parts) for (let m of this.mapType(p, ctx, position)) mapped.some((x) => x.cs === m.cs) || mapped.push(m);
    return mapped.length === 1 ? mapped : mapped.every((m) => m.cs === "string") ? [{ cs: "string" }] : position === "param" && mapped.length <= 4 && !mapped.some((m) => m.cs === "dynamic") ? mapped : mapped.some((m) => m.cs.startsWith("global::System.Action") || m.cs.startsWith("global::System.Func") || m.cs === "global::System.Delegate") ? [{ cs: "dynamic" }] : [{ cs: "dynamic" }];
  }
  mapFunctionType(node, ctx) {
    if (node.typeParameters && node.typeParameters.length) return "global::System.Delegate";
    let ps = [];
    for (let p of node.parameters) {
      if (nameText(p.name) === "this") continue;
      if (p.dotDotDotToken) {
        ps.push("object[]");
        continue;
      }
      let m = this.mapType(p.type, ctx)[0];
      ps.push(m.cs === "void" ? "object" : m.cs);
    }
    if (ps.length > 16) return "global::System.Delegate";
    let ret = this.mapType(node.type, ctx)[0].cs;
    return ret === "void" ? ps.length ? "global::System.Action<" + ps.join(", ") + ">" : "global::System.Action" : "global::System.Func<" + ps.concat([ret]).join(", ") + ">";
  }
  mapRef(node, ctx, position) {
    let name = nameText(node.typeName) || "", args = node.typeArguments || [], arg = (i) => args[i] ? this.mapType(args[i], ctx)[0] : { cs: "dynamic" };
    if (ctx.typeParams.has(name)) return [{ cs: csIdent(name).id }];
    let last = name.split(".").pop() || name;
    switch (name) {
      case "Readonly":
      case "Required":
      case "NonNullable":
      case "Partial":
      case "DeepReadonly":
        return args.length ? this.mapType(args[0], ctx, position) : [{ cs: "dynamic" }];
      case "Array":
      case "ReadonlyArray": {
        let el = arg(0);
        return [{ cs: (el.cs === "void" ? "object" : el.cs) + "[]" }];
      }
      case "Promise":
      case "PromiseLike": {
        let el = arg(0);
        return [{ cs: el.cs === "void" || el.cs === "object" && !args.length ? "global::System.Threading.Tasks.Task" : "global::System.Threading.Tasks.Task<" + el.cs + ">" }];
      }
      case "Map":
      case "ReadonlyMap":
        return [{ cs: "global::System.Collections.Generic.Dictionary<" + arg(0).cs + ", " + arg(1).cs + ">" }];
      case "Set":
      case "ReadonlySet":
        return [{ cs: "global::System.Collections.Generic.HashSet<" + arg(0).cs + ">" }];
      case "Function":
      case "CallableFunction":
        return [{ cs: "global::System.Delegate" }];
      case "Object":
        return [{ cs: "object" }];
      case "String":
        return [{ cs: "string" }];
      case "Number":
        return [{ cs: "double" }];
      case "Boolean":
        return [{ cs: "bool" }];
      case "Error":
        return [{ cs: "global::System.Exception" }];
      case "Record":
        return [{ cs: "dynamic" }];
    }
    if (/(^|\.|_)(Constructor|AbstractedConstructor|ComponentConstructor|AssetType|CCClassConstructor)$/.test(last) || /Constructor$/.test(last)) {
      let a0 = args[0], tp = a0 && ts.isTypeReferenceNode(a0) ? nameText(a0.typeName) : null;
      return [{ cs: "global::System.Type", ctorOf: tp && ctx.typeParams.has(tp) ? tp : void 0 }];
    }
    if (/AnyFunction$/.test(last)) return [{ cs: "global::System.Delegate" }];
    let d = this.resolve(name, ctx.container);
    if (!d) return [{ cs: "dynamic" }];
    if (d.enumAlias && !d.aliases.length) {
      let t = this.resolve(d.enumAlias, this.scopeOf(d));
      if (!t || !t.enums.length) return [{ cs: "dynamic" }];
      d = t;
    }
    let kind = d.aliases.length && !d.classes.length && !d.enums.length && !d.interfaces.length && !d.ctorConst ? "alias" : this.declKind(d);
    if (kind === "stringEnum") return [{ cs: "string" }];
    if (kind === "enum") return [{ cs: this.csNameOf(d) }];
    if (kind === "alias") {
      let al = d.aliases[0], tps = new Set(ctx.typeParams);
      if (al.typeParameters) for (let tp of al.typeParameters) tps.delete(tp.name.text);
      return this.mapType(al.type, { container: this.scopeOf(d), typeParams: tps, selfType: ctx.selfType, depth: ctx.depth + 1 }, position).map((m) => al.typeParameters && al.typeParameters.some((tp) => m.cs === tp.name.text || m.cs.includes("<" + tp.name.text + ">")) ? { cs: "dynamic" } : m);
    }
    if (kind === "class" || kind === "interface") {
      let arity = this.genericArity.get(d.path) || 0, base = this.csNameOf(d);
      if (!arity) return [{ cs: base }];
      let targs = [];
      for (let i = 0; i < arity; i++) {
        let m = args[i] ? this.mapType(args[i], ctx)[0].cs : "dynamic";
        targs.push(m === "void" ? "object" : m);
      }
      return [{ cs: base + "<" + targs.join(", ") + ">" }];
    }
    return [{ cs: "dynamic" }];
  }
  /** Whether a declaration becomes a C# type (pure type aliases don't). */
  emitsType(c) {
    if (c.classes.length || c.interfaces.length || c.enums.length || c.ctorConst || c.namespaces.length) return !0;
    if (c.enumAlias) {
      let t = this.resolve(c.enumAlias, this.scopeOf(c));
      return !!(t && t.enums.length);
    }
    return !1;
  }
  // ------------------------------------------------------------------ classes and mixins
  /** The class parts and interface parts of a mixin constructor's instance type `A & IMixin`. */
  ctorParts(c) {
    let out = { cls: null, clsNode: null, ifaces: [] }, t = c.ctorConst && c.ctorConst.type;
    if (!t) return out;
    let parts = ts.isIntersectionTypeNode(t) ? t.types : [t];
    for (let p of parts) {
      if (!ts.isTypeReferenceNode(p)) continue;
      let pd = this.resolve(nameText(p.typeName) || "", this.scopeOf(c));
      pd && ((pd.classes.length || pd.ctorConst) && !out.cls ? (out.cls = pd, out.clsNode = p) : pd.interfaces.length && out.ifaces.push(pd));
    }
    return out;
  }
  /** Members a mixin constructor adds (its interface parts, with their base interfaces). */
  mixinMembers(c) {
    if (!c.ctorConst) return [];
    let out = [], seen = /* @__PURE__ */ new Set(), add = (d) => {
      if (!seen.has(d)) {
        seen.add(d);
        for (let i of d.interfaces) {
          out.push(...i.members);
          for (let h of i.heritageClauses || [])
            for (let ht of h.types) {
              let bd = this.resolve(ht.expression.getText(), this.scopeOf(d));
              bd && bd.interfaces.length && add(bd);
            }
        }
      }
    };
    for (let d of this.ctorParts(c).ifaces) add(d);
    return out;
  }
  /** The declaration a class extends (a class, or a mixin constructor bound as a class). */
  baseDecl(c) {
    if (c.ctorConst) return this.ctorParts(c).cls;
    let cl = c.classes[0], h = cl && cl.heritageClauses ? cl.heritageClauses.find((x) => x.token === ts.SyntaxKind.ExtendsKeyword) : void 0;
    if (!h || !h.types[0]) return null;
    let bd = this.resolve(h.types[0].expression.getText(), this.scopeOf(c));
    return bd && this.declKind(bd) === "class" ? bd : null;
  }
  // ------------------------------------------------------------------ emit helpers
  line(indent, s) {
    this.out.push("    ".repeat(indent) + s);
  }
  skip(where, why) {
    this.stats.skipped++, this.report.push(where + ": " + why);
  }
  /**
   * Type parameters. Constraints are kept on methods (getComponent<T> where T : Component),
   * not on types: TS generics are structural, a C# constraint on a type would reject
   * arguments the API itself passes.
   */
  typeParamsOf(decls, ctx, constraints = !0) {
    if (!decls || !decls.length) return { list: "", where: "", names: [] };
    let names = decls.map((t) => csIdent(t.name.text).id), wheres = [];
    if (constraints) for (let t of decls) {
      if (!t.constraint) continue;
      let c = this.mapType(t.constraint, ctx)[0].cs;
      c.startsWith("global::cc.") && !c.includes("<" + t.name.text) && this.isClassOrIface(c) ? wheres.push("where " + csIdent(t.name.text).id + " : " + c) : c === "global::System.Delegate" && wheres.push("where " + csIdent(t.name.text).id + " : global::System.Delegate");
    }
    return { list: "<" + names.join(", ") + ">", where: wheres.length ? " " + wheres.join(" ") : "", names };
  }
  isClassOrIface(cs) {
    for (let [p, n] of this.csTypeName) if (n === cs.replace(/<.*$/, "")) return this.kindOf.get(p) === "class" || this.kindOf.get(p) === "interface";
    return !1;
  }
  /** Parameter lists for one TS signature (unions in parameters expand to several lists). */
  paramVariants(params, ctx) {
    let variants = [{ list: [] }], used = /* @__PURE__ */ new Set(), idx = 0;
    for (let p of params) {
      let pn = nameText(p.name) || "arg" + idx;
      if (pn === "this") continue;
      for (validIdent(pn) || (pn = "arg" + idx); used.has(pn) || ctx.typeParams.has(pn); ) pn = pn + "_";
      used.add(pn);
      let id = csIdent(pn).id, optional = !!p.questionToken || !!p.initializer, types;
      if (p.dotDotDotToken) {
        let el = { cs: "object" };
        p.type && ts.isArrayTypeNode(p.type) ? el = this.mapType(p.type.elementType, ctx)[0] : p.type && ts.isTypeReferenceNode(p.type) && p.type.typeArguments && p.type.typeArguments.length && (el = this.mapType(p.type.typeArguments[0], ctx)[0]), types = [{ cs: "params " + (el.cs === "void" ? "object" : el.cs) + "[]" }];
      } else types = this.mapType(p.type, ctx, "param");
      types.length === 1 && types[0].cs === "dynamic" && /callback|handler|listener|^(cb|fn|func|selector|complete|oncomplete|onprogress|onfinish|task)$|_?fn$|func$/i.test(pn) && (types = [{ cs: "global::System.Delegate" }]);
      let next = [];
      for (let v of variants)
        for (let t of types) {
          let entry = (t.cs === "void" ? "object" : t.cs) + " " + id + (optional && !p.dotDotDotToken ? " = default" : ""), nv = { list: v.list.concat([entry]), ctor: v.ctor };
          t.ctorOf && !nv.ctor && (nv.ctor = { index: idx, tp: t.ctorOf }), next.push(nv);
        }
      variants = next.slice(0, 8), idx++;
    }
    for (let v of variants) {
      let seenOpt = !1;
      for (let i = 0; i < v.list.length; i++)
        / = default$/.test(v.list[i]) ? seenOpt = !0 : seenOpt && !v.list[i].startsWith("params ") && (v.list[i] += " = default");
      v.list = v.list.map((e) => e.startsWith("params ") ? e.replace(/ = default$/, "") : e);
      let pi = v.list.findIndex((e) => e.startsWith("params "));
      pi >= 0 && pi !== v.list.length - 1 && (v.list[pi] = v.list[pi].replace(/^params /, ""));
    }
    return variants;
  }
  sigKey(name, tpCount, list) {
    return name + "`" + tpCount + "(" + list.map((e) => e.replace(/ = default$/, "").replace(/^params /, "").split(" ").slice(0, -1).join(" ").replace(/\bdynamic\b/g, "object")).join(",") + ")";
  }
  tsNameAttr(orig, id) {
    return id.replace(/^@/, "") !== orig ? "[global::cc.TsName(" + lit(orig) + ")] " : "";
  }
  // ------------------------------------------------------------------ emit
  emitAll() {
    let visit = (d) => {
      var _a, _b;
      for (let c of d.children.values()) {
        let k = this.declKind(c);
        k !== "functionNs" && this.kindOf.set(c.path, k), this.csTypeName.set(c.path, this.csNameOf(c));
        let tps = ((_a = c.classes[0]) == null ? void 0 : _a.typeParameters) || ((_b = c.interfaces[0]) == null ? void 0 : _b.typeParameters);
        if ((k === "class" || k === "interface") && tps && this.genericArity.set(c.path, tps.length), k === "interface") {
          let names = [];
          for (let i of c.interfaces)
            for (let m of i.members) {
              let n = m.name ? nameText(m.name) : null;
              n && !m.questionToken && names.push(n);
            }
          this.ifaceMembers.set(c.path, names);
        }
        if (k === "class") {
          let names = /* @__PURE__ */ new Set();
          for (let cl of c.classes) for (let m of cl.members) m.name && names.add(nameText(m.name) || "");
          for (let i of c.interfaces) for (let m of i.members) m.name && names.add(nameText(m.name) || "");
          for (let m of this.mixinMembers(c)) m.name && names.add(nameText(m.name) || "");
          this.classMembers.set(c.path, names);
          let bd = this.baseDecl(c);
          this.classBase.set(c.path, bd ? bd.path : null);
          let ctors = [];
          for (let cl of c.classes) for (let m of cl.members) ts.isConstructorDeclaration(m) && !hasModifier(m, ts.SyntaxKind.PrivateKeyword) && ctors.push(m.parameters);
          this.ctorSigs.set(c.path, ctors);
        }
        visit(c);
      }
    };
    visit(this.root), this.out.push("// <auto-generated> Cocos Creator API bindings for C# scripting, generated from cc.d.ts by extensions/csharp."), this.out.push("// Declarations only: every body is `throw null`. The transpiler turns calls into TypeScript."), this.out.push("#pragma warning disable"), this.out.push("namespace cc"), this.out.push("{"), this.emitContainerMembers(this.root, 1, !0), this.out.push("}");
  }
  /** Emits the children (types) of a container, and its functions/variables (static members). */
  emitContainerMembers(d, indent, isRoot) {
    for (let c of d.children.values())
      if (!(isRoot && SKIP_ROOT.has(c.name)))
        try {
          this.emitDecl(c, indent);
        } catch (e) {
          this.skip(c.path, "failed: " + (e && e.message));
        }
    isRoot && (this.line(indent, "/// <summary>Module-level functions and variables of 'cc' (director, input, instantiate, tween...). Use <c>using static cc.Globals;</c></summary>"), this.line(indent, "public static partial class Globals"), this.line(indent, "{"), this.emitStatics(d, indent + 1, null), this.line(indent, "}"));
  }
  emitStatics(d, indent, selfType) {
    var _a;
    let ctx = { container: d, typeParams: /* @__PURE__ */ new Set(), selfType, depth: 0 }, seen = /* @__PURE__ */ new Set(), dynAliases = [];
    for (let c of d.children.values()) {
      if (!c.enumAlias) continue;
      let t = this.resolve(c.enumAlias, d);
      (!t || !t.enums.length) && dynAliases.push(c.name);
    }
    let memberNames = new Set(
      Array.from(d.children.keys()).filter((k) => dynAliases.indexOf(k) < 0).map((k) => this.typeMemberName(d.children.get(k)))
    );
    for (let n of dynAliases) {
      let id = csIdent(n);
      memberNames.has(n) || (seen.add("P:" + n), this.line(indent, this.tsNameAttr(n, id.id) + "public static dynamic " + id.id + " { get => throw null; }"), this.stats.variables++);
    }
    let selfId = d.name ? csIdent(this.typeMemberName(d)).id : "Globals";
    for (let f of d.functions) this.emitMethod(f, ctx, indent, !0, seen, d.path || "cc", memberNames, !1, !1, selfId);
    for (let v of d.variables) {
      let n = nameText(v.decl.name);
      if (!n) continue;
      if (csIdent(n).id === selfId) {
        this.skip((d.path ? d.path + "." : "") + n, "variable named like its namespace");
        continue;
      }
      if (memberNames.has(n) && !((_a = d.children.get(n)) != null && _a.namespaces.length)) {
        this.skip((d.path ? d.path + "." : "") + n, "variable clashes with a type of the same name");
        continue;
      }
      let key = "P:" + n;
      if (seen.has(key)) continue;
      seen.add(key);
      let type = this.varType(v.decl, d, indent);
      if (!type) continue;
      let id = csIdent(n);
      this.line(indent, this.tsNameAttr(n, id.id) + "public static " + type + " " + id.id + (v.isConst ? " { get => throw null; }" : " { get => throw null; set => throw null; }")), this.stats.variables++;
    }
  }
  /** The C# type of a module variable; object literal types become a nested class. */
  varType(v, d, indent) {
    let n = nameText(v.name) || "", t = v.type, ctx = { container: d, typeParams: /* @__PURE__ */ new Set(), selfType: null, depth: 0 };
    if (t && ts.isTypeLiteralNode(t)) {
      let cls = csIdent(n + "_t").id;
      return this.line(indent, "[global::cc.TsAny] public sealed partial class " + cls), this.line(indent, "{"), this.emitTypeLiteralMembers(t, { ...ctx, selfType: cls }, indent + 1), this.line(indent, "}"), cls;
    }
    if (t && ts.isTypeQueryNode(t)) {
      let q = nameText(t.exprName), qd = q ? this.resolve(q, d) : null;
      if (qd && (qd.enums.length || qd.classes.length))
        return this.skip((d.path ? d.path + "." : "") + n, "typeof alias variable"), "dynamic";
    }
    let m = this.mapType(t, ctx)[0].cs;
    return m === "void" ? "object" : m;
  }
  emitTypeLiteralMembers(t, ctx, indent) {
    let seen = /* @__PURE__ */ new Set();
    for (let m of t.members)
      if (ts.isPropertySignature(m)) {
        let n = nameText(m.name);
        if (!n || seen.has("P:" + n)) continue;
        seen.add("P:" + n);
        let id = csIdent(n);
        if (id.id === ctx.selfType) continue;
        let type = this.mapType(m.type, ctx)[0].cs;
        this.line(indent, this.tsNameAttr(n, id.id) + "public " + (type === "void" ? "object" : type) + " " + id.id + (hasModifier(m, ts.SyntaxKind.ReadonlyKeyword) ? " { get => throw null; }" : " { get => throw null; set => throw null; }")), this.stats.members++;
      } else ts.isMethodSignature(m) && this.emitMethod(m, ctx, indent, !1, seen, ctx.selfType || "", /* @__PURE__ */ new Set(), !1);
  }
  emitDecl(d, indent) {
    if (d.enumAlias) {
      let t = this.resolve(d.enumAlias, this.scopeOf(d));
      t && t.enums.length && (this.emitEnumCopy(t, d.name, indent), this.stats.variables++);
      return;
    }
    let k = this.declKind(d);
    if (!(k === "alias" && !d.namespaces.length)) {
      if (k === "class") return this.emitClass(d, indent);
      if (k === "interface") return this.emitInterface(d, indent);
      if (k === "enum") return this.emitEnum(d, indent);
      if (k === "stringEnum") return this.emitStringEnum(d, indent);
      if (d.namespaces.length) return this.emitNamespace(d, indent);
    }
  }
  emitNamespace(d, indent) {
    let id = csIdent(this.typeMemberName(d));
    this.line(indent, this.tsNameAttr(d.name, id.id).replace(d.name, (this.typeMemberName(d) === d.name, d.name)) + "public static partial class " + id.id), this.line(indent, "{"), this.emitContainerMembers(d, indent + 1, !1), this.emitStatics(d, indent + 1, null), this.line(indent, "}");
  }
  emitEnum(d, indent) {
    let id = csIdent(d.name), next = 0, big = !1, members = [], seen = /* @__PURE__ */ new Set();
    for (let e of d.enums)
      for (let m of e.members) {
        let n = nameText(m.name);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        let val = null;
        if (m.initializer ? ts.isNumericLiteral(m.initializer) ? val = Number(m.initializer.text) : ts.isPrefixUnaryExpression(m.initializer) && m.initializer.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(m.initializer.operand) && (val = -Number(m.initializer.operand.text)) : val = next, val === null || !Number.isInteger(val)) {
          this.skip(d.path + "." + n, "non-integer enum value");
          continue;
        }
        (val > 2147483647 || val < -2147483648) && (big = !0), next = val + 1;
        let mid = csIdent(n);
        members.push(this.tsNameAttr(n, mid.id) + mid.id + " = " + val + ",");
      }
    let isConst = d.enums.some((e) => hasModifier(e, ts.SyntaxKind.ConstKeyword));
    this.line(indent, (isConst ? "[global::cc.TsConstEnum] " : "") + this.tsNameAttr(d.name, id.id) + "public enum " + id.id + (big ? " : long" : "")), this.line(indent, "{");
    for (let m of members) this.line(indent + 1, m);
    this.line(indent, "}"), this.stats.enums++, d.namespaces.length && this.skip(d.path, "namespace merged with an enum: its members are not bound");
  }
  emitStringEnum(d, indent, asName) {
    let id = csIdent(asName || d.name);
    this.line(indent, "[global::cc.TsStringEnum] " + this.tsNameAttr(asName || d.name, id.id) + "public static partial class " + id.id), this.line(indent, "{");
    let seen = /* @__PURE__ */ new Set();
    for (let e of d.enums)
      for (let m of e.members) {
        let n = nameText(m.name);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        let mid = csIdent(n);
        mid.id !== id.id && (m.initializer && ts.isStringLiteral(m.initializer) ? this.line(indent + 1, this.tsNameAttr(n, mid.id) + "public const string " + mid.id + " = " + lit(m.initializer.text) + ";") : m.initializer && ts.isNumericLiteral(m.initializer) && this.line(indent + 1, this.tsNameAttr(n, mid.id) + "public const double " + mid.id + " = " + m.initializer.text + ";"));
      }
    this.line(indent, "}"), asName || this.stats.enums++;
  }
  /** Copies an enum as a nested class (for `static EventType: typeof NodeEventType`). */
  emitEnumCopy(target, name, indent) {
    if (this.declKind(target) === "stringEnum") return this.emitStringEnum(target, indent, name);
    let id = csIdent(name), enumCs = this.csNameOf(target);
    this.line(indent, "[global::cc.TsEnumAlias] " + this.tsNameAttr(name, id.id) + "public static partial class " + id.id), this.line(indent, "{");
    let seen = /* @__PURE__ */ new Set();
    for (let e of target.enums)
      for (let m of e.members) {
        let n = nameText(m.name);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        let mid = csIdent(n);
        mid.id !== id.id && this.line(indent + 1, this.tsNameAttr(n, mid.id) + "public const " + enumCs + " " + mid.id + " = " + enumCs + "." + mid.id + ";");
      }
    this.line(indent, "}");
  }
  implementsFor(d) {
    let out = [], all = /* @__PURE__ */ new Set();
    for (let p = d.path; p; p = this.classBase.get(p)) {
      let ms = this.classMembers.get(p);
      if (ms) for (let m of ms) all.add(m);
    }
    for (let [ipath, names] of this.ifaceMembers)
      this.genericArity.get(ipath) || !names.length || names.length > 40 || names.every((n) => all.has(n)) && out.push(this.csTypeName.get(ipath));
    return out;
  }
  emitClass(d, indent) {
    var _a;
    let cl = d.classes[0], tps = cl ? cl.typeParameters : void 0, tpCtx = { container: this.scopeOf(d), typeParams: new Set((tps || []).map((t) => t.name.text)), selfType: null, depth: 0 }, tp = this.typeParamsOf(tps, tpCtx, !1), id = csIdent(d.name), selfCs = id.id + tp.list, ctx = { ...tpCtx, selfType: this.csNameOf(d) + tp.list }, baseCs = null, bd = this.baseDecl(d), baseArgs;
    if (cl) {
      let ext = (_a = cl.heritageClauses) == null ? void 0 : _a.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
      baseArgs = ext && ext.types[0] ? ext.types[0].typeArguments : void 0, ext && ext.types[0] && !bd && this.skip(d.path, 'base class "' + ext.types[0].expression.getText() + '" not bound');
    } else if (d.ctorConst) {
      let parts = this.ctorParts(d);
      baseArgs = parts.clsNode ? parts.clsNode.typeArguments : void 0;
    }
    if (bd) {
      let arity = this.genericArity.get(bd.path) || 0, targs = [];
      for (let i = 0; i < arity; i++) targs.push(baseArgs && baseArgs[i] ? this.mapType(baseArgs[i], ctx)[0].cs : "dynamic");
      baseCs = this.csNameOf(bd) + (arity ? "<" + targs.map((t) => t === "void" ? "object" : t).join(", ") + ">" : "");
    }
    let ifaces = this.implementsFor(d).filter((i) => i !== this.csNameOf(d)), heads = (baseCs ? [baseCs] : []).concat(ifaces), abs = cl && hasModifier(cl, ts.SyntaxKind.AbstractKeyword) ? "abstract " : "";
    this.line(indent, this.tsNameAttr(d.name, id.id) + "public " + abs + "partial class " + selfCs + (heads.length ? " : " + heads.join(", ") : "") + tp.where), this.line(indent, "{"), this.stats.classes++;
    let seen = /* @__PURE__ */ new Set(), childNames = new Set(Array.from(d.children.values()).filter((c) => this.emitsType(c)).map((c) => c.name));
    this.line(indent + 1, "protected " + id.id + "(global::cc.TsInit _)" + (baseCs ? " : base(_)" : "") + " { }");
    let ctorParams = this.ctorSigs.get(d.path) || [];
    for (let p = this.classBase.get(d.path); !ctorParams.length && p; p = this.classBase.get(p)) ctorParams = this.ctorSigs.get(p) || [];
    ctorParams.length || (ctorParams = [ts.factory.createNodeArray([])]);
    for (let ps of ctorParams)
      for (let v of this.paramVariants(ps, ctx)) {
        let key = this.sigKey(".ctor", 0, v.list);
        seen.has(key) || (seen.add(key), this.line(indent + 1, "public " + id.id + "(" + v.list.join(", ") + ")" + (baseCs ? " : base(default(global::cc.TsInit))" : "") + " { }"));
      }
    let members = [];
    for (let c of d.classes) members.push(...c.members);
    let ifaceMembers = [];
    for (let i of d.interfaces) ifaceMembers.push(...i.members);
    ifaceMembers.push(...this.mixinMembers(d)), this.emitMembers(members, ifaceMembers, ctx, indent + 1, seen, d, childNames, id.id), d.namespaces.length && (this.emitContainerMembers(d, indent + 1, !1), this.emitStatics(d, indent + 1, null)), this.line(indent, "}");
  }
  emitMembers(members, ifaceMembers, ctx, indent, seen, d, childNames, selfId) {
    let props = /* @__PURE__ */ new Map(), methods = [], addProp = (n, type, isStatic, prot, get, set, ro) => {
      let key = (isStatic ? "S:" : "I:") + n, p = props.get(key) || { type, get: !1, set: !1, isStatic, protectedAcc: prot, readonly: ro };
      !p.type && type && (p.type = type), p.get = p.get || get, p.set = p.set || set, p.readonly = p.readonly && ro, props.set(key, p);
    };
    for (let m of members) {
      if (hasModifier(m, ts.SyntaxKind.PrivateKeyword)) continue;
      let n = m.name ? nameText(m.name) : null;
      if (!n || n.startsWith("#")) continue;
      let isStatic = hasModifier(m, ts.SyntaxKind.StaticKeyword), prot = hasModifier(m, ts.SyntaxKind.ProtectedKeyword);
      ts.isPropertyDeclaration(m) ? (m.type && ts.isFunctionTypeNode(m.type) && m.questionToken, addProp(n, m.type, isStatic, prot, !0, !hasModifier(m, ts.SyntaxKind.ReadonlyKeyword), hasModifier(m, ts.SyntaxKind.ReadonlyKeyword))) : ts.isGetAccessorDeclaration(m) ? addProp(n, m.type, isStatic, prot, !0, !1, !0) : ts.isSetAccessorDeclaration(m) ? addProp(n, m.parameters[0] && m.parameters[0].type, isStatic, prot, !1, !0, !1) : ts.isMethodDeclaration(m) && methods.push(m);
    }
    for (let m of ifaceMembers) {
      let n = m.name ? nameText(m.name) : null;
      n && (ts.isPropertySignature(m) ? addProp(n, m.type, !1, !1, !0, !hasModifier(m, ts.SyntaxKind.ReadonlyKeyword), hasModifier(m, ts.SyntaxKind.ReadonlyKeyword)) : ts.isMethodSignature(m) && methods.push(m));
    }
    let methodNames = new Set(methods.map((m) => nameText(m.name) || "")), hasCtorParam = (m) => m.parameters.some((p) => !!p.type && /Constructor|AssetType/.test(p.type.getText()));
    methods.sort((a, b) => Number(hasCtorParam(b)) - Number(hasCtorParam(a)));
    for (let [key, p] of props) {
      let n = key.slice(2), id = csIdent(n);
      if (id.id === selfId && (id = { id: n + "_", renamed: !0 }), childNames.has(n))
        continue;
      if (seen.has("P:" + n) || seen.has("M:" + n)) {
        this.skip(d.path + "." + n, "member name used twice (static and instance, or property and method)");
        continue;
      }
      if (p.isStatic && p.type && ts.isTypeQueryNode(p.type)) {
        let q = nameText(p.type.exprName), qd = q ? this.resolve(q, this.scopeOf(d)) : null;
        if (qd && qd.enums.length) {
          seen.add("P:" + n), this.emitEnumCopy(qd, n, indent), this.stats.members++;
          continue;
        }
      }
      methodNames.has(n) && this.skip(d.path + "." + n, "property and method share a name; the property is kept"), seen.add("P:" + n);
      let type = this.mapType(p.type, ctx)[0].cs;
      type === "void" && (type = "object");
      let acc = p.protectedAcc ? "protected " : "public ", mod = p.isStatic ? "static " : "virtual ", body = p.set && !p.readonly ? " { get => throw null; set => throw null; }" : " { get => throw null; }";
      this.line(indent, this.tsNameAttr(n, id.id) + acc + mod + type + " " + id.id + body), this.stats.members++;
    }
    for (let m of methods) {
      let n = nameText(m.name) || "";
      if (seen.has("P:" + n)) continue;
      let isStatic = hasModifier(m, ts.SyntaxKind.StaticKeyword), prot = hasModifier(m, ts.SyntaxKind.ProtectedKeyword);
      if (childNames.has(n)) {
        this.skip(d.path + "." + n, "method clashes with a nested type");
        continue;
      }
      this.emitMethod(m, ctx, indent, isStatic, seen, d.path, /* @__PURE__ */ new Set(), !0, prot, selfId);
    }
  }
  emitMethod(m, outer, indent, isStatic, seen, where, typeNames, virt = !1, prot = !1, selfId = "") {
    let n = m.name ? nameText(m.name) : null;
    if (!n) return;
    if (typeNames.has(n)) {
      this.skip(where + "." + n, "function clashes with a type of the same name");
      return;
    }
    let id = csIdent(n);
    id.id === selfId && (id = { id: n + "_", renamed: !0 });
    let ctx = { ...outer, typeParams: /* @__PURE__ */ new Set([...outer.typeParams, ...(m.typeParameters || []).map((t) => t.name.text)]) }, tp = this.typeParamsOf(m.typeParameters, ctx), ret = this.mapType(m.type, ctx)[0].cs;
    ret.startsWith("params ") && (ret = ret.slice(7));
    let acc = prot ? "protected " : "public ", mod = isStatic ? "static " : virt ? "virtual " : "";
    for (let v of this.paramVariants(m.parameters, ctx)) {
      let key = this.sigKey(n, tp.names.length, v.list);
      if (seen.has(key)) continue;
      seen.add(key), seen.add("M:" + n);
      let body = ret === "void" ? " { }" : " => throw null;";
      if (this.line(indent, this.tsNameAttr(n, id.id) + acc + mod + ret + " " + id.id + tp.list + "(" + v.list.join(", ") + ")" + tp.where + body), this.stats.members++, !isStatic && !virt && this.stats.functions++, isStatic && where && !where.includes(".") && typeNames.size && this.stats.functions++, v.ctor) {
        let tpIndex = tp.names.indexOf(csIdent(v.ctor.tp).id);
        if (tpIndex >= 0) {
          let list2 = v.list.filter((_, i) => i !== v.ctor.index), key2 = this.sigKey(n, tp.names.length, list2);
          seen.has(key2) || (seen.add(key2), this.line(indent, "[global::cc.TsCtorArg(" + v.ctor.index + ", " + tpIndex + ")] " + this.tsNameAttr(n, id.id) + acc + mod + ret + " " + id.id + tp.list + "(" + list2.join(", ") + ")" + tp.where + body), this.stats.members++);
        }
      }
    }
  }
  emitInterface(d, indent) {
    let it = d.interfaces[0], ctx = { container: this.scopeOf(d), typeParams: new Set((it.typeParameters || []).map((t) => t.name.text)), selfType: null, depth: 0 }, tp = this.typeParamsOf(it.typeParameters, ctx, !1), id = csIdent(d.name), bases = [];
    for (let i of d.interfaces)
      for (let h of i.heritageClauses || [])
        for (let t of h.types) {
          let bn = t.expression.getText(), bd = this.resolve(bn, this.scopeOf(d));
          bd && this.declKind(bd) === "interface" && !this.genericArity.get(bd.path) && bd !== d && bases.push(this.csNameOf(bd));
        }
    this.line(indent, this.tsNameAttr(d.name, id.id) + "public partial interface " + id.id + tp.list + (bases.length ? " : " + Array.from(new Set(bases)).join(", ") : "") + tp.where), this.line(indent, "{"), this.stats.interfaces++;
    let seen = /* @__PURE__ */ new Set();
    for (let i of d.interfaces)
      for (let m of i.members) {
        let n = m.name ? nameText(m.name) : null;
        if (!n) continue;
        let mid = csIdent(n);
        if (mid.id === id.id && (mid = { id: n + "_", renamed: !0 }), ts.isPropertySignature(m)) {
          if (seen.has("P:" + n)) continue;
          seen.add("P:" + n);
          let type = this.mapType(m.type, { ...ctx, selfType: id.id + tp.list })[0].cs;
          type === "void" && (type = "object"), this.line(indent + 1, this.tsNameAttr(n, mid.id) + type + " " + mid.id + (hasModifier(m, ts.SyntaxKind.ReadonlyKeyword) ? " { get => throw null; }" : " { get => throw null; set => throw null; }")), this.stats.members++;
        } else if (ts.isMethodSignature(m)) {
          if (seen.has("P:" + n)) continue;
          let mctx = { ...ctx, selfType: id.id + tp.list, typeParams: /* @__PURE__ */ new Set([...ctx.typeParams, ...(m.typeParameters || []).map((t) => t.name.text)]) }, mtp = this.typeParamsOf(m.typeParameters, mctx), ret = this.mapType(m.type, mctx)[0].cs;
          for (let v of this.paramVariants(m.parameters, mctx)) {
            let key = this.sigKey(n, mtp.names.length, v.list);
            seen.has(key) || (seen.add(key), this.line(indent + 1, this.tsNameAttr(n, mid.id) + ret + " " + mid.id + mtp.list + "(" + v.list.join(", ") + ")" + mtp.where + (ret === "void" ? " { }" : " => throw null;")), this.stats.members++);
          }
        }
      }
    this.line(indent, "}"), d.namespaces.length && (this.line(indent, "public static partial class " + id.id + "_ns"), this.line(indent, "{"), this.emitContainerMembers(d, indent + 1, !1), this.emitStatics(d, indent + 1, null), this.line(indent, "}"), this.skip(d.path, "namespace merged with an interface is bound as " + d.name + "_ns"));
  }
};
function generateBindings(dts) {
  let sf = ts.createSourceFile("cc.d.ts", dts, ts.ScriptTarget.Latest, !0, ts.ScriptKind.TS), g = new Generator();
  for (let st of sf.statements)
    ts.isModuleDeclaration(st) && st.name.text === "cc" && st.body && ts.isModuleBlock(st.body) && g.collect(st.body, g.root);
  return g.applyImports(g.root), g.fixPaths(g.root), g.emitAll(), { code: g.out.join(`
`) + `
`, report: g.report, stats: g.stats };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateBindings
});
//# sourceMappingURL=bindings.js.map
