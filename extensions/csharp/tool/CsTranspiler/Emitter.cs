using System.Collections.Immutable;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CsTranspiler;

/// <summary>
/// Emits the TypeScript of one C# file: imports, classes (with Cocos decorators), interfaces,
/// enums and delegate types. Statements and expressions are in the other partial files.
/// </summary>
public sealed partial class Emitter
{
    readonly ProjectContext _ctx;
    readonly SemanticModel _model;
    readonly SyntaxTree _tree;
    public readonly List<Diag> Diagnostics = new();

    readonly SortedSet<string> _cc = new(StringComparer.Ordinal);
    readonly SortedSet<string> _decorators = new(StringComparer.Ordinal);
    readonly SortedDictionary<string, SortedSet<string>> _userImports = new(StringComparer.Ordinal);
    readonly SortedSet<string> _runtime = new(StringComparer.Ordinal);
    /// <summary>TS interop imports: module specifier -> exported name -> local name.</summary>
    readonly SortedDictionary<string, SortedDictionary<string, string>> _tsImports = new(StringComparer.Ordinal);
    readonly Dictionary<(string, string), string> _tsLocals = new();
    readonly HashSet<string> _tsUsedLocals = new(StringComparer.Ordinal);
    TsWriter _w = new();
    INamedTypeSymbol _type;
    readonly HashSet<INamedTypeSymbol> _emittedTypes = new(SymbolEqualityComparer.Default);
    int _tmp;

    public const string RuntimeModule = "db://csharp/cs-runtime";

    public Emitter(ProjectContext ctx, SemanticModel model, SyntaxTree tree)
    {
        _ctx = ctx;
        _model = model;
        _tree = tree;
    }

    // ------------------------------------------------------------------ diagnostics
    void Error(SyntaxNode node, string code, string message) => Report(node, "error", code, message);
    void Warn(SyntaxNode node, string code, string message) => Report(node, "warning", code, message);
    void Info(SyntaxNode node, string code, string message) => Report(node, "info", code, message);

    /// <summary>Attribute class -> Cocos decorator/option name: MenuAttribute and menu -> "menu".</summary>
    static string DecoratorName(string attributeClass)
    {
        var n = attributeClass.EndsWith("Attribute") ? attributeClass.Substring(0, attributeClass.Length - "Attribute".Length) : attributeClass;
        return n.Length == 0 ? n : char.ToLowerInvariant(n[0]) + n.Substring(1);
    }

    void Report(SyntaxNode node, string severity, string code, string message)
    {
        var span = node.GetLocation().GetLineSpan();
        if (Diagnostics.Any(d => d.Code == code && d.Line == span.StartLinePosition.Line + 1 && d.Column == span.StartLinePosition.Character + 1)) return;
        Diagnostics.Add(new Diag(_tree.FilePath, span.StartLinePosition.Line + 1, span.StartLinePosition.Character + 1, severity, code, message));
    }

    string Unsupported(SyntaxNode node, string what)
    {
        Error(node, "CSX1001", what + " is not supported by the C# to TypeScript transpiler.");
        return "undefined";
    }

    // ------------------------------------------------------------------ file
    public string EmitFile()
    {
        var root = (CompilationUnitSyntax)_tree.GetRoot();
        foreach (var m in root.Members) EmitTop(m);
        CheckOneComponentPerFile(root);

        var head = new StringBuilder();
        head.Append(string.Format(Workspace.Header, Path.GetFileName(_tree.FilePath))).Append('\n');
        if (_decorators.Count > 0) _cc.Add("_decorator");
        if (_cc.Count > 0) head.Append("import { ").Append(string.Join(", ", _cc)).Append(" } from 'cc';\n");
        if (_runtime.Count > 0) head.Append("import { ").Append(string.Join(", ", _runtime)).Append(" } from '").Append(RuntimeModule).Append("';\n");
        foreach (var kv in _tsImports)
            head.Append("import { ").Append(string.Join(", ", kv.Value.Select(e => e.Key == e.Value ? e.Key : e.Key + " as " + e.Value))).Append(" } from '").Append(kv.Key).Append("';\n");
        foreach (var kv in _userImports) head.Append("import { ").Append(string.Join(", ", kv.Value)).Append(" } from '").Append(kv.Key).Append("';\n");
        if (_decorators.Count > 0) head.Append("const { ").Append(string.Join(", ", _decorators)).Append(" } = _decorator;\n");
        head.Append('\n');
        return head + _w.ToString();
    }

    void CheckOneComponentPerFile(CompilationUnitSyntax root)
    {
        var comps = root.DescendantNodes().OfType<ClassDeclarationSyntax>()
            .Select(c => _model.GetDeclaredSymbol(c)).Where(s => s != null && _ctx.IsComponent(s)).Distinct(SymbolEqualityComparer.Default).ToList();
        if (comps.Count > 1)
            Error(root.DescendantNodes().OfType<ClassDeclarationSyntax>().First(c => SymbolEqualityComparer.Default.Equals(_model.GetDeclaredSymbol(c), comps[1])),
                "CSX0010", "Cocos needs one Component class per script file; move " + comps[1].Name + " to its own .cs file.");
        var name = Path.GetFileNameWithoutExtension(_tree.FilePath);
        if (comps.Count == 1 && comps[0] is INamedTypeSymbol c0 && c0.Name != name)
            Warn(c0.DeclaringSyntaxReferences[0].GetSyntax(), "CSX0011", $"The component {c0.Name} is in {name}.cs; Cocos finds scripts by file, keeping the names equal avoids confusion.");
    }

    void EmitTop(MemberDeclarationSyntax m)
    {
        switch (m)
        {
            case BaseNamespaceDeclarationSyntax ns:
                foreach (var x in ns.Members) EmitTop(x);
                break;
            case GlobalStatementSyntax g:
                Error(g, "CSX1002", "Top-level statements are not supported: put code in a class.");
                break;
            case TypeDeclarationSyntax or EnumDeclarationSyntax or DelegateDeclarationSyntax:
                EmitTypeDecl(m);
                break;
            default:
                Unsupported(m, m.Kind().ToString());
                break;
        }
    }

    void EmitTypeDecl(MemberDeclarationSyntax m)
    {
        if (_model.GetDeclaredSymbol(m) is not INamedTypeSymbol sym) return;
        if (!_emittedTypes.Add(sym)) return; // other partial parts in this file are merged
        if (sym.DeclaringSyntaxReferences.Any(r => r.SyntaxTree != _tree))
        {
            Error(m, "CSX1003", "Partial classes split over several files are not supported.");
            return;
        }
        if (_w.ToString().Length > 0) _w.Line();
        switch (m)
        {
            case StructDeclarationSyntax:
                Error(m, "CSX1004", "struct is not supported: use a class (value-copy semantics have no TypeScript equivalent).");
                break;
            case RecordDeclarationSyntax:
                Error(m, "CSX1005", "record is not supported: use a class.");
                break;
            case ClassDeclarationSyntax:
                EmitClass(sym);
                break;
            case InterfaceDeclarationSyntax:
                EmitInterface(sym);
                break;
            case EnumDeclarationSyntax e:
                EmitEnum(sym, e);
                break;
            case DelegateDeclarationSyntax:
                EmitDelegate(sym);
                break;
        }
        // nested types after the type (flattened: Outer_Inner)
        foreach (var r in sym.DeclaringSyntaxReferences)
            if (r.GetSyntax() is TypeDeclarationSyntax td)
                foreach (var nested in td.Members.Where(x => x is BaseTypeDeclarationSyntax || x is DelegateDeclarationSyntax))
                    EmitTypeDecl(nested);
    }

    // ------------------------------------------------------------------ names
    /// <summary>The TypeScript reference to a type in a value or type position (adds the import).</summary>
    public string TypeRef(INamedTypeSymbol t, bool asType = false)
    {
        t = t.OriginalDefinition;
        if (Sym.IsTs(t))
        {
            // project / extension TypeScript: the outermost type carries [TsModule]
            if (asType && Sym.Has(t, "TsStringEnum")) return "string";
            var outer = t;
            while (outer.ContainingType != null) outer = outer.ContainingType;
            var path = Sym.TypePath(t);
            var mod = Sym.TsModuleOf(outer);
            if (mod != null) path[0] = ImportTs(mod.Value.module, mod.Value.export, outer.Name);
            return string.Join(".", path);
        }
        if (Sym.IsBinding(t))
        {
            if (asType && (Sym.Has(t, "TsAny") || Sym.Has(t, "TsEnumAlias"))) return "any";
            if (asType && Sym.Has(t, "TsStringEnum")) return "string";
            var path = Sym.TypePath(t);
            _cc.Add(path[0]);
            return string.Join(".", path);
        }
        if (_ctx.TypeNames.TryGetValue(t, out var name))
        {
            ImportUser(t, name);
            return name;
        }
        return null;
    }

    void ImportUser(INamedTypeSymbol t, string name)
    {
        // nested types are reached through their flattened name, imported from their file
        if (!_ctx.TypeFiles.TryGetValue(t, out var file) || string.Equals(file, _tree.FilePath, StringComparison.OrdinalIgnoreCase)) return;
        var from = Path.GetDirectoryName(_tree.FilePath)!;
        var rel = Path.GetRelativePath(from, Path.ChangeExtension(file, null)).Replace('\\', '/');
        if (!rel.StartsWith(".")) rel = "./" + rel;
        if (!_userImports.TryGetValue(rel, out var set)) _userImports[rel] = set = new SortedSet<string>(StringComparer.Ordinal);
        set.Add(name);
    }

    /// <summary>Names of the _decorator destructuring at the top of a generated file.</summary>
    static readonly HashSet<string> DecoratorExports = new(StringComparer.Ordinal)
    {
        // the ones this emitter writes (EmitClass, PropertyDecorator): other cc decorator names stay free for imports
        "ccclass", "property", "serializable", "requireComponent", "menu", "help", "icon", "inspector", "executionOrder",
        "executeInEditMode", "disallowMultiple", "playOnFocus", "uniquelyReferenced",
    };

    /// <summary>
    /// Imports an export of a project / extension TypeScript module and returns its local name: the
    /// exported name, or Name_ts when that would shadow a cc export, a C# type or another import.
    /// </summary>
    string ImportTs(string module, string export, string csName)
    {
        if (_tsLocals.TryGetValue((module, export), out var local)) return local;
        var preferred = export == "default" ? csName : export;
        bool Taken(string n) => _ctx.TakenNames.Contains(n) || _tsUsedLocals.Contains(n) || DecoratorExports.Contains(n) || TsReserved.Contains(n);
        local = preferred;
        if (Taken(local))
        {
            local = preferred + "_ts";
            for (var i = 2; Taken(local); i++) local = preferred + "_ts" + i;
        }
        _tsUsedLocals.Add(local);
        _tsLocals[(module, export)] = local;
        var spec = TsSpecifier(module);
        if (!_tsImports.TryGetValue(spec, out var names)) _tsImports[spec] = names = new SortedDictionary<string, string>(StringComparer.Ordinal);
        names[export] = local;
        return local;
    }

    /// <summary>db://assets/... -> a path relative to the generated file; db://&lt;extension&gt;/... stays as it is.</summary>
    string TsSpecifier(string module)
    {
        const string assets = "db://assets/";
        if (!module.StartsWith(assets, StringComparison.Ordinal)) return module;
        var abs = Path.Combine(_ctx.Root, "assets", module.Substring(assets.Length).Replace('/', Path.DirectorySeparatorChar));
        var rel = Path.GetRelativePath(Path.GetDirectoryName(_tree.FilePath)!, abs).Replace('\\', '/');
        return rel.StartsWith(".") ? rel : "./" + rel;
    }

    /// <summary>An exported TypeScript function / variable (a static member with its own [TsModule]): its imported local name.</summary>
    string TsExport(ISymbol s)
    {
        if (s == null || !s.IsStatic || !Sym.IsTs(s)) return null;
        var mod = Sym.TsModuleOf(s.OriginalDefinition);
        return mod == null ? null : ImportTs(mod.Value.module, mod.Value.export, s.Name);
    }

    string Runtime(string name)
    {
        _runtime.Add(name);
        return name;
    }

    string Decorator(string name)
    {
        _decorators.Add(name);
        return name;
    }

    static readonly HashSet<string> TsReserved = new(StringComparer.Ordinal)
    {
        "arguments", "await", "debugger", "delete", "eval", "export", "function", "import", "let", "package", "var", "with", "yield",
        "implements", "interface", "private", "protected", "public", "static", "typeof", "instanceof", "undefined", "NaN", "Infinity",
        "enum", "super", "constructor", "prototype",
    };

    /// <summary>A local or parameter name, renamed if it is reserved in JavaScript.</summary>
    static string LocalName(string n) => TsReserved.Contains(n) ? n + "_" : n;

    /// <summary>The TypeScript name of a method (bound name, renamed overload, or overridden method's name).</summary>
    string MethodName(IMethodSymbol m)
    {
        m = m.OriginalDefinition;
        for (var o = m; o != null; o = o.OverriddenMethod?.OriginalDefinition)
        {
            if (o.OverriddenMethod == null)
            {
                if (Sym.IsBinding(o)) return Sym.TsName(o);
                if (_ctx.MethodNames.TryGetValue(o, out var renamed)) return renamed;
                return o.Name;
            }
        }
        return m.Name;
    }

    static string MemberName(ISymbol s) => Sym.IsBinding(s) ? Sym.TsName(s) : s.Name;

    // ------------------------------------------------------------------ declarations
    static bool IsObject(ITypeSymbol t) => t == null || t.SpecialType == SpecialType.System_Object;

    string TypeParams(IEnumerable<ITypeParameterSymbol> tps)
    {
        var list = tps.ToList();
        if (!list.Any()) return "";
        return "<" + string.Join(", ", list.Select(tp =>
        {
            var c = tp.ConstraintTypes.FirstOrDefault(x => x is INamedTypeSymbol nt && nt.TypeKind is TypeKind.Class or TypeKind.Interface);
            return tp.Name + (c != null ? " extends " + TsType(c) : "");
        })) + ">";
    }

    void EmitClass(INamedTypeSymbol sym)
    {
        _type = sym;
        var name = _ctx.TypeNames[sym];
        var decls = sym.DeclaringSyntaxReferences.Select(r => (ClassDeclarationSyntax)r.GetSyntax()).ToList();
        // class decorators: @ccclass is automatic (components and serializable data classes)
        if (_ctx.CcclassNames.TryGetValue(sym, out var ccName))
        {
            _w.Line("@" + Decorator("ccclass") + "(" + Str(ccName) + ")");
            foreach (var other in _ctx.SameCcclassName(sym))
            {
                var loc = other.Locations.FirstOrDefault()?.GetLineSpan();
                Error(decls[0], "CSX0020", $"The ccclass name \"{ccName}\" is also used by {other.Name} ({Path.GetFileName(loc?.Path)}:{(loc?.StartLinePosition.Line ?? 0) + 1}). Cocos needs unique names: rename a class or give it [ClassName(\"...\")].");
            }
        }
        foreach (var a in sym.GetAttributes())
        {
            var an = a.AttributeClass?.Name;
            var node = a.ApplicationSyntaxReference?.GetSyntax() ?? decls[0];
            if (IsTsDecorator(a.AttributeClass))
            {
                _w.Line(TsDecorator(a, sym, null, node, null, null));
                continue;
            }
            if (!Sym.IsBinding(a.AttributeClass))
            {
                if (an != "SerializableAttribute" && an != "FlagsAttribute" && an != "ObsoleteAttribute") Warn(node, "CSX2001", $"The attribute {an} has no Cocos equivalent and is ignored.");
                continue;
            }
            // [Menu] and the older [menu] are the same decorator
            var deco = DecoratorName(an);
            switch (deco)
            {
                case "ccclass":
                    if (an == "ccclass") Info(node, "CSX3001", "[ccclass] is no longer needed: components and [Serializable] classes get @ccclass automatically ([ClassName(\"...\")] sets another name).");
                    if (!_ctx.CcclassNames.ContainsKey(sym)) Warn(node, "CSX2005", "This class is neither a component nor serializable data: @ccclass is not emitted.");
                    break;
                case "className":
                    break;
                case "menu":
                case "help":
                case "icon":
                case "inspector":
                case "executionOrder":
                    _w.Line("@" + Decorator(deco) + "(" + string.Join(", ", a.ConstructorArguments.Select(ConstArg)) + ")");
                    break;
                case "executeInEditMode":
                case "disallowMultiple":
                case "playOnFocus":
                    _w.Line("@" + Decorator(deco) + (a.ConstructorArguments.Length > 0 ? "(" + ConstArg(a.ConstructorArguments[0]) + ")" : ""));
                    break;
                case "uniquelyReferenced":
                    _w.Line("@" + Decorator(deco));
                    break;
                case "requireComponent":
                    foreach (var arg in a.ConstructorArguments)
                    {
                        if (arg.Kind == TypedConstantKind.Array) foreach (var v in arg.Values) _w.Line("@" + Decorator("requireComponent") + "(" + ConstArg(v) + ")");
                        else _w.Line("@" + Decorator("requireComponent") + "(" + ConstArg(arg) + ")");
                    }
                    break;
                default:
                    Warn(node, "CSX2002", $"[{an.Replace("Attribute", "")}] is not a class attribute and is ignored here.");
                    break;
            }
        }
        // head
        var head = new StringBuilder("export ");
        if (sym.IsAbstract && !sym.IsStatic) head.Append("abstract ");
        head.Append("class ").Append(name).Append(TypeParams(sym.TypeParameters));
        if (!IsObject(sym.BaseType))
        {
            var bt = sym.BaseType;
            var bts = bt.SpecialType == SpecialType.None && bt.ToDisplayString() == "System.Exception" ? "Error" : TsType(bt, valuePosition: true);
            if (bt.ContainingNamespace?.ToDisplayString() == "System" && bt.Name.EndsWith("Exception")) bts = "Error";
            head.Append(" extends ").Append(bts);
        }
        var ifaces = sym.Interfaces.Where(i => _ctx.IsUser(i)).Select(i => TsType(i)).ToList();
        if (ifaces.Any()) head.Append(" implements ").Append(string.Join(", ", ifaces));
        _w.Open(head.ToString());

        var staticCtors = new List<ConstructorDeclarationSyntax>();
        ConstructorDeclarationSyntax instanceCtor = null;
        foreach (var d in decls)
        {
            foreach (var mem in d.Members)
            {
                switch (mem)
                {
                    case FieldDeclarationSyntax f:
                        EmitField(f);
                        break;
                    case EventFieldDeclarationSyntax ef:
                        EmitEventField(ef);
                        break;
                    case PropertyDeclarationSyntax p:
                        EmitProperty(p);
                        break;
                    case MethodDeclarationSyntax md:
                        EmitMethod(md);
                        break;
                    case ConstructorDeclarationSyntax cd when cd.Modifiers.Any(SyntaxKind.StaticKeyword):
                        staticCtors.Add(cd);
                        break;
                    case ConstructorDeclarationSyntax cd:
                        if (instanceCtor != null)
                        {
                            Error(cd, "CSX1010", "Only one constructor per class is supported (TypeScript has no constructor overloads): use optional parameters.");
                            break;
                        }
                        instanceCtor = cd;
                        EmitConstructor(cd, sym);
                        break;
                    case BaseTypeDeclarationSyntax or DelegateDeclarationSyntax:
                        break; // emitted after the class
                    case IndexerDeclarationSyntax:
                        Unsupported(mem, "An indexer");
                        break;
                    case OperatorDeclarationSyntax or ConversionOperatorDeclarationSyntax:
                        Unsupported(mem, "A user-defined operator");
                        break;
                    case DestructorDeclarationSyntax:
                        Unsupported(mem, "A finalizer");
                        break;
                    case EventDeclarationSyntax:
                        Unsupported(mem, "An event with add/remove accessors");
                        break;
                    default:
                        Unsupported(mem, mem.Kind().ToString());
                        break;
                }
            }
        }
        _w.Close();
        foreach (var sc in staticCtors)
        {
            _w.Line("// static constructor of " + name);
            if (sc.Body != null) EmitBlockContents(sc.Body, braces: true);
            else if (sc.ExpressionBody != null) _w.Line(Expr(sc.ExpressionBody.Expression) + ";");
        }
        _type = null;
    }

    /// <summary>`private`/`protected`/nothing; members hiding or overriding a Cocos member keep its access.</summary>
    string Access(ISymbol s)
    {
        var hidden = HiddenBaseMember(s);
        if (hidden != null) return hidden.DeclaredAccessibility == Accessibility.Protected ? "protected " : "";
        switch (s.DeclaredAccessibility)
        {
            case Accessibility.Private:
                return "private ";
            case Accessibility.Protected:
            case Accessibility.ProtectedAndInternal:
                return "protected ";
            default:
                return "";
        }
    }

    ISymbol HiddenBaseMember(ISymbol s)
    {
        if (s.IsStatic || s.ContainingType == null) return null;
        for (var b = s.ContainingType.BaseType; b != null; b = b.BaseType)
        {
            var m = b.GetMembers(s.Name).FirstOrDefault(x => !x.IsStatic && x.DeclaredAccessibility != Accessibility.Private);
            if (m != null) return m;
        }
        return null;
    }

    void EmitField(FieldDeclarationSyntax f)
    {
        var isConst = f.Modifiers.Any(SyntaxKind.ConstKeyword);
        foreach (var v in f.Declaration.Variables)
        {
            if (_model.GetDeclaredSymbol(v) is not IFieldSymbol fs) continue;
            var (decos, serialized) = MemberDecorators(fs, fs.Type, v);
            foreach (var d in decos) _w.Line(d);
            var mods = Access(fs) + (fs.IsStatic || isConst ? "static " : "") + (fs.IsReadOnly || isConst ? "readonly " : "");
            var init = v.Initializer != null ? Expr(v.Initializer.Value, fs.Type) : DefaultValue(fs.Type, forProperty: serialized);
            _w.Line(mods + fs.Name + ": " + TsType(fs.Type) + " = " + init + ";");
        }
    }

    void EmitEventField(EventFieldDeclarationSyntax ef)
    {
        foreach (var v in ef.Declaration.Variables)
        {
            if (_model.GetDeclaredSymbol(v) is not IEventSymbol es) continue;
            var init = v.Initializer != null ? Expr(v.Initializer.Value, es.Type) : "null";
            _w.Line(Access(es) + (es.IsStatic ? "static " : "") + es.Name + ": " + TsType(es.Type) + " = " + init + ";");
        }
    }

    void EmitProperty(PropertyDeclarationSyntax p)
    {
        if (_model.GetDeclaredSymbol(p) is not IPropertySymbol ps) return;
        var (decos, serialized) = MemberDecorators(ps, ps.Type, p);
        var acc = Access(ps) + (ps.IsStatic ? "static " : "");
        var accessors = p.AccessorList?.Accessors.ToList() ?? new List<AccessorDeclarationSyntax>();
        var isAuto = p.ExpressionBody == null && accessors.Count > 0 && accessors.All(a => a.Body == null && a.ExpressionBody == null) && !ps.IsAbstract;
        if (isAuto)
        {
            foreach (var d in decos) _w.Line(d);
            var ro = ps.SetMethod == null ? "readonly " : "";
            var init = p.Initializer != null ? Expr(p.Initializer.Value, ps.Type) : DefaultValue(ps.Type, forProperty: serialized);
            _w.Line(acc + ro + ps.Name + ": " + TsType(ps.Type) + " = " + init + ";");
            return;
        }
        var type = TsType(ps.Type);
        if (ps.IsAbstract)
        {
            if (ps.GetMethod != null) _w.Line(acc + "abstract get " + ps.Name + "(): " + type + ";");
            if (ps.SetMethod != null) _w.Line(acc + "abstract set " + ps.Name + "(value: " + type + ");");
            return;
        }
        foreach (var d in decos) _w.Line(d);
        if (p.ExpressionBody != null)
        {
            _w.Open(acc + "get " + ps.Name + "(): " + type);
            WithHoists(() => "return " + Expr(p.ExpressionBody.Expression, ps.Type) + ";");
            _w.Close();
            return;
        }
        foreach (var a in accessors)
        {
            var isGet = a.IsKind(SyntaxKind.GetAccessorDeclaration);
            var head = isGet ? acc + "get " + ps.Name + "(): " + type : acc + "set " + ps.Name + "(value: " + type + ")";
            _w.Open(head);
            // a getter can't be a generator: an iterator getter wraps one (see EmitIteratorBody)
            var iter = isGet && a.Body != null && _model.GetDeclaredSymbol(a) is IMethodSymbol gm ? IteratorOf(gm, a) : (IterKind.None, null);
            if (iter.kind != IterKind.None) EmitIteratorBody(iter, a.Body, ps.Type, wrap: true);
            else if (a.Body != null) EmitBlockContents(a.Body, braces: false);
            else if (a.ExpressionBody != null) WithHoists(() => (isGet ? "return " : "") + Expr(a.ExpressionBody.Expression, isGet ? ps.Type : null) + ";");
            _w.Close();
        }
    }

    string Params(IMethodSymbol m, BaseParameterListSyntax syntax)
    {
        var list = new List<string>();
        foreach (var p in m.Parameters)
        {
            if (p.RefKind != RefKind.None) Error(p.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax() ?? syntax, "CSX1011", $"{p.RefKind.ToString().ToLowerInvariant()} parameters are not supported.");
            var n = LocalName(p.Name);
            if (p.IsParams && p.Type is IArrayTypeSymbol at)
            {
                // params T[] is a plain array parameter: callers pass [a, b, c] (see ArgList), so the
                // shipped code has no rest/spread syntax
                list.Add(n + ": " + TsType(at.ElementType) + "[]");
                continue;
            }
            var s = n + ": " + TsType(p.Type);
            if (p.HasExplicitDefaultValue)
            {
                var ps = p.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax() as ParameterSyntax;
                s += " = " + (ps?.Default != null ? Expr(ps.Default.Value, p.Type) : Literal(p.ExplicitDefaultValue, p.Type));
            }
            list.Add(s);
        }
        return string.Join(", ", list);
    }

    static readonly HashSet<string> UnityLifecycle = new(StringComparer.Ordinal) { "Awake", "Start", "Update", "LateUpdate", "FixedUpdate", "OnEnable", "OnDisable", "OnDestroy", "OnLoad" };

    void EmitMethod(MethodDeclarationSyntax md)
    {
        if (_model.GetDeclaredSymbol(md) is not IMethodSymbol ms) return;
        if (md.Body == null && md.ExpressionBody == null && !ms.IsAbstract)
        {
            if (!ms.IsPartialDefinition) Error(md, "CSX1012", "A method without a body (extern/partial) is not supported.");
            return;
        }
        if (_type != null && _ctx.IsComponent(_type) && UnityLifecycle.Contains(ms.Name) && !HandlesUnityMessage(_type, ms.Name))
            Warn(md, "CSX2010", $"Cocos calls '{char.ToLowerInvariant(ms.Name[0]) + ms.Name.Substring(1)}', not '{ms.Name}': lifecycle methods are lowerCamelCase (start, update, onLoad, onEnable...).");
        var iter = IteratorOf(ms, md);
        if (iter.kind != IterKind.None && _type != null && _ctx.IsComponent(_type) && (UnityLifecycle.Contains(ms.Name) || CocosLifecycle.Contains(ms.Name)))
            Warn(md, "CSX2012", $"{ms.Name} is an iterator, but it is called as a lifecycle method, which ignores what it returns: its code never runs. Make {ms.Name} void and start the iterator from it (unity-style: StartCoroutine(...)).");
        var name = MethodName(ms);
        var mods = Access(ms) + (ms.IsStatic ? "static " : "") + (ms.IsAbstract ? "abstract " : "") + (ms.IsAsync ? "async " : "");
        var ret = ms.IsAsync && ms.ReturnsVoid ? "" : ": " + TsType(ms.ReturnType);
        // an IEnumerator iterator is a generator method: *Blink(): Iterator<any>
        var star = iter.kind == IterKind.Lazy ? "*" : "";
        var head = mods + star + name + TypeParams(ms.TypeParameters) + "(" + Params(ms, md.ParameterList) + ")" + ret;
        if (ms.IsAbstract)
        {
            _w.Line(head + ";");
            return;
        }
        // TypeScript decorators on methods ([Button] -> @button())
        foreach (var d in MemberDecorators(ms, null, md).lines) _w.Line(d);
        _w.Open(head);
        if (iter.kind != IterKind.None) EmitIteratorBody(iter, md.Body, ms.ReturnType, wrap: false);
        else EmitBody(md.Body, md.ExpressionBody, ms.ReturnsVoid || IsTaskVoid(ms));
        _w.Close();
    }

    /// <summary>cc.Component's lifecycle methods (camelCase).</summary>
    static readonly HashSet<string> CocosLifecycle = new(StringComparer.Ordinal) { "onLoad", "start", "update", "lateUpdate", "onEnable", "onDisable", "onDestroy" };

    /// <summary>
    /// Whether a base class written in TypeScript (TS interop) calls the Unity-named message itself,
    /// so `void Update()` is not a misspelt `update`: a base declaring that method (the C# one
    /// overrides or hides it), or a base marked [TsUnityMessages] (its TypeScript class has the
    /// `@unityMessages` JSDoc tag, as unity-style's MonoBehaviour does).
    /// </summary>
    static bool HandlesUnityMessage(INamedTypeSymbol type, string name)
    {
        for (var b = type.BaseType; b != null; b = b.BaseType)
        {
            if (!Sym.IsTs(b)) continue;
            var o = b.OriginalDefinition;
            if (Sym.Has(o, "TsUnityMessages")) return true;
            if (o.GetMembers(name).Any(m => m is IMethodSymbol { MethodKind: MethodKind.Ordinary, IsStatic: false })) return true;
        }
        return false;
    }

    bool IsTaskVoid(IMethodSymbol ms) => ms.IsAsync && ms.ReturnType is INamedTypeSymbol t && t.Name == "Task" && t.Arity == 0;

    void EmitBody(BlockSyntax body, ArrowExpressionClauseSyntax expr, bool isVoid)
    {
        if (body != null) EmitBlockContents(body, braces: false);
        else if (expr != null) WithHoists(() => (isVoid ? "" : "return ") + Expr(expr.Expression) + ";");
    }

    void EmitConstructor(ConstructorDeclarationSyntax cd, INamedTypeSymbol sym)
    {
        if (_model.GetDeclaredSymbol(cd) is not IMethodSymbol ms) return;
        _w.Open(Access(ms) + "constructor(" + Params(ms, cd.ParameterList) + ")");
        var hasBase = !IsObject(sym.BaseType);
        if (cd.Initializer != null)
        {
            if (cd.Initializer.IsKind(SyntaxKind.ThisConstructorInitializer)) Error(cd.Initializer, "CSX1013", "this(...) constructor chaining is not supported.");
            else WithHoists(() => "super(" + Args(cd.Initializer.ArgumentList, _model.GetSymbolInfo(cd.Initializer).Symbol as IMethodSymbol, cd.Initializer) + ");");
        }
        else if (hasBase) _w.Line("super();");
        EmitBody(cd.Body, cd.ExpressionBody, true);
        _w.Close();
    }

    void EmitInterface(INamedTypeSymbol sym)
    {
        _type = sym;
        var name = _ctx.TypeNames[sym];
        var bases = sym.Interfaces.Where(i => _ctx.IsUser(i)).Select(i => TsType(i)).ToList();
        _w.Open("export interface " + name + TypeParams(sym.TypeParameters) + (bases.Any() ? " extends " + string.Join(", ", bases) : ""));
        foreach (var m in sym.GetMembers())
        {
            switch (m)
            {
                case IMethodSymbol ms when ms.MethodKind == MethodKind.Ordinary:
                    if (!ms.IsAbstract) Error(ms.DeclaringSyntaxReferences[0].GetSyntax(), "CSX1014", "Default interface methods are not supported.");
                    var pl = ms.DeclaringSyntaxReferences[0].GetSyntax() is MethodDeclarationSyntax mds ? mds.ParameterList : null;
                    _w.Line(MethodName(ms) + TypeParams(ms.TypeParameters) + "(" + Params(ms, pl) + "): " + TsType(ms.ReturnType) + ";");
                    break;
                case IPropertySymbol ps:
                    _w.Line((ps.SetMethod == null ? "readonly " : "") + ps.Name + ": " + TsType(ps.Type) + ";");
                    break;
                case IEventSymbol es:
                    _w.Line(es.Name + ": " + TsType(es.Type) + ";");
                    break;
            }
        }
        _w.Close();
        _type = null;
    }

    void EmitEnum(INamedTypeSymbol sym, EnumDeclarationSyntax e)
    {
        var name = _ctx.TypeNames[sym];
        _w.Open("export enum " + name);
        foreach (var f in sym.GetMembers().OfType<IFieldSymbol>().Where(f => f.HasConstantValue))
            _w.Line(f.Name + " = " + Convert.ToString(f.ConstantValue, System.Globalization.CultureInfo.InvariantCulture) + ",");
        _w.Close();
    }

    void EmitDelegate(INamedTypeSymbol sym)
    {
        var name = _ctx.TypeNames[sym];
        var inv = sym.DelegateInvokeMethod;
        _w.Line("export type " + name + TypeParams(sym.TypeParameters) + " = (" + string.Join(", ", inv.Parameters.Select(p => LocalName(p.Name) + ": " + TsType(p.Type))) + ") => " + TsType(inv.ReturnType) + ";");
    }

    // ------------------------------------------------------------------ @property
    /// <summary>Field attributes that only make sense on a serialized field (option name -> value builder).</summary>
    static readonly HashSet<string> OptionAttributes = new(StringComparer.Ordinal)
    {
        "TooltipAttribute", "DisplayNameAttribute", "DisplayOrderAttribute", "GroupAttribute", "RangeAttribute", "MinAttribute", "MaxAttribute",
        "StepAttribute", "SlideAttribute", "MultilineAttribute", "ReadOnlyAttribute", "FormerlySerializedAsAttribute", "EditorOnlyAttribute",
        "UnitAttribute", "RadianAttribute", "AnimatableAttribute", "VisibleAttribute", "HideInInspectorAttribute", "OverridePropertyAttribute",
        "tooltip", "displayName", "range", "visible",
    };

    /// <summary>
    /// The @property decorator of a field or property, or null when it isn't serialized.
    /// Fields follow the Unity rule (ProjectContext.IsSerializedField); properties need [Property].
    /// The Cocos type comes from the C# type: Node -> Node, int -> CCInteger, Node[] / List&lt;Node&gt; -> [Node],
    /// enums -> Enum(E); the C#-style attributes become options (Tooltip -> tooltip, HideInInspector -> visible: false...).
    /// </summary>
    string PropertyDecorator(ISymbol member, ITypeSymbol type, SyntaxNode node)
    {
        var attrs = member.GetAttributes().Where(a => a.AttributeClass != null).ToList();
        foreach (var a in attrs.Where(a => !Sym.IsBinding(a.AttributeClass)))
        {
            var an = a.AttributeClass.Name;
            if (an is "NonSerializedAttribute" or "ObsoleteAttribute") continue;
            Warn(a.ApplicationSyntaxReference?.GetSyntax() ?? node, "CSX2001", $"The attribute {an} has no Cocos equivalent and is ignored.");
        }
        var cc = attrs.Where(a => Sym.IsBinding(a.AttributeClass) && !IsTsDecorator(a.AttributeClass)).ToList();
        var explicitMark = cc.Any(a => ProjectContext.ExplicitSerialize.Contains(a.AttributeClass.Name));
        var owner = member.ContainingType;
        var ownerSerializable = owner != null && _ctx.CcclassNames.ContainsKey(owner.OriginalDefinition);
        bool serialized;
        if (member is IFieldSymbol fs) serialized = _ctx.IsSerializedField(fs);
        else serialized = ownerSerializable && !member.IsStatic && cc.Any(a => a.AttributeClass.Name is "PropertyAttribute" or "property" or "TypeAttribute" or "type");
        if (!serialized)
        {
            if (!member.IsStatic && (explicitMark || cc.Any(a => OptionAttributes.Contains(a.AttributeClass.Name))))
            {
                if (!ownerSerializable) Warn(node, "CSX2007", $"{member.Name} is not saved: {owner?.Name} is neither a component nor [Serializable].");
                else if (member is IFieldSymbol { IsReadOnly: true }) Warn(node, "CSX2008", $"{member.Name} is readonly, so it can't be serialized.");
                else if (!ProjectContext.IsNonSerialized(member)) Warn(node, "CSX2006", $"{member.Name} has Inspector attributes but is not serialized: make it public or add [SerializeField].");
            }
            return null;
        }
        if (member is IFieldSymbol && !_ctx.IsSerializableType(type) && !cc.Any(a => a.AttributeClass.Name is "TypeAttribute" or "type" || a.AttributeClass.Name is "PropertyAttribute" or "property" && (a.ConstructorArguments.Length > 0 || a.NamedArguments.Any(n => n.Key is "Type" or "type"))))
        {
            Warn(node, "CSX2009", $"Cocos can't save a {type.ToDisplayString()}: {member.Name} stays a plain field.");
            return null;
        }
        if (member is IFieldSymbol pub && pub.DeclaredAccessibility == Accessibility.Public && cc.Count == 1 && cc[0].AttributeClass.Name == "property" && cc[0].ConstructorArguments.Length == 0 && cc[0].NamedArguments.Length == 0)
            Info(node, "CSX3002", "[property] is no longer needed: public fields of serializable types are saved automatically.");
        if (cc.Count == 1 && cc[0].AttributeClass.Name == "serializable") return "@" + Decorator("serializable");

        string typeExpr = null;
        var explicitType = false;
        var opts = PropertyOptions(member, cc, node, ref typeExpr, ref explicitType);
        if (!explicitType) typeExpr = CocosTypeExpr(type, node);
        var deco = "@" + Decorator("property");
        // enums only work in the options form: @property({ type: Enum(E) })
        if (opts.Count == 0 && (typeExpr == null || !typeExpr.StartsWith("Enum("))) return typeExpr == null ? deco : deco + "(" + typeExpr + ")";
        var all = new List<string>();
        if (typeExpr != null) all.Add("type: " + typeExpr);
        all.AddRange(opts.Select(o => o.key + ": " + o.value));
        return deco + "({ " + string.Join(", ", all) + " })";
    }

    /// <summary>The @property options of the C#-style attributes (Tooltip -> tooltip...), and an explicit type.</summary>
    List<(string key, string value)> PropertyOptions(ISymbol member, List<AttributeData> cc, SyntaxNode node, ref string typeExpr, ref bool explicitType)
    {
        var opts = new List<(string key, string value)>();
        void Set(string key, string value)
        {
            opts.RemoveAll(o => o.key == key);
            opts.Add((key, value));
        }
        foreach (var a in cc)
        {
            var an = a.AttributeClass.Name;
            string Arg0() => a.ConstructorArguments.Length > 0 ? ConstArg(a.ConstructorArguments[0]) : "undefined";
            switch (an)
            {
                case "PropertyAttribute":
                case "property":
                    if (a.ConstructorArguments.Length > 0 && a.ConstructorArguments[0].Value is ITypeSymbol pt)
                    {
                        typeExpr = CocosTypeExpr(pt, node);
                        explicitType = true;
                    }
                    foreach (var na in a.NamedArguments)
                    {
                        if (na.Key is "type" or "Type")
                        {
                            if (na.Value.Value is ITypeSymbol nt)
                            {
                                typeExpr = CocosTypeExpr(nt, node);
                                explicitType = true;
                            }
                            continue;
                        }
                        // PascalCase named arguments -> Cocos option names (ReadOnly -> readonly)
                        var key = na.Key == "ReadOnly" ? "readonly" : char.ToLowerInvariant(na.Key[0]) + na.Key.Substring(1);
                        Set(key, ConstArg(na.Value));
                    }
                    break;
                case "TypeAttribute":
                case "type":
                    if (a.ConstructorArguments.Length > 0 && a.ConstructorArguments[0].Value is ITypeSymbol tt)
                    {
                        typeExpr = CocosTypeExpr(tt, node);
                        explicitType = true;
                    }
                    break;
                case "TooltipAttribute": case "tooltip": Set("tooltip", Arg0()); break;
                case "DisplayNameAttribute": case "displayName": Set("displayName", Arg0()); break;
                case "DisplayOrderAttribute": Set("displayOrder", Arg0()); break;
                case "GroupAttribute": Set("group", Arg0()); break;
                case "MinAttribute": Set("min", Arg0()); break;
                case "MaxAttribute": Set("max", Arg0()); break;
                case "StepAttribute": Set("step", Arg0()); break;
                case "UnitAttribute": Set("unit", Arg0()); break;
                case "FormerlySerializedAsAttribute": Set("formerlySerializedAs", Arg0()); break;
                case "AnimatableAttribute": Set("animatable", Arg0()); break;
                case "VisibleAttribute": case "visible": Set("visible", Arg0()); break;
                case "RangeAttribute":
                case "range":
                    Set("range", "[" + string.Join(", ", a.ConstructorArguments.Select(ConstArg)) + "]");
                    break;
                case "SlideAttribute": Set("slide", "true"); break;
                case "MultilineAttribute": Set("multiline", "true"); break;
                case "ReadOnlyAttribute": Set("readonly", "true"); break;
                case "EditorOnlyAttribute": Set("editorOnly", "true"); break;
                case "RadianAttribute": Set("radian", "true"); break;
                case "OverridePropertyAttribute": Set("override", "true"); break;
                case "HideInInspectorAttribute": Set("visible", "false"); break;
                case "serializable": Set("serializable", "true"); break;
                case "SerializeFieldAttribute": break;
                default:
                    Warn(node, "CSX2003", $"[{an.Replace("Attribute", "")}] is not a field attribute and is ignored here.");
                    break;
            }
        }
        // Cocos hides fields starting with _ ; [SerializeField] private double _speed is meant to be seen (as in Unity)
        if (member.Name.StartsWith("_") && cc.Any(a => a.AttributeClass.Name == "SerializeFieldAttribute") && !opts.Any(o => o.key == "visible")) Set("visible", "true");
        return opts;
    }

    // ------------------------------------------------------------------ TypeScript decorators (TS interop)
    static bool IsTsDecorator(INamedTypeSymbol c) => c != null && Sym.IsTs(c) && Sym.Has(c.OriginalDefinition, "TsDecorator");

    static T DecoOption<T>(INamedTypeSymbol c, string name, T fallback)
    {
        var a = Sym.Attr(c.OriginalDefinition, "TsDecorator");
        var v = a?.NamedArguments.FirstOrDefault(n => n.Key == name).Value;
        return v.HasValue && v.Value.Value is T t ? t : fallback;
    }

    /// <summary>
    /// The decorators of a field, property or method, in source order: TypeScript decorators
    /// ([ShowIf] -> @showIf) and our @property. @property takes the place of the first C#-style
    /// property attribute, or comes last (right above the member) when there is none. A decorator that
    /// declares the property itself (it calls cc property()) replaces it and gets its options.
    /// </summary>
    (List<string> lines, bool serialized) MemberDecorators(ISymbol member, ITypeSymbol type, SyntaxNode node)
    {
        var attrs = member.GetAttributes().Where(a => a.AttributeClass != null).ToList();
        var declaring = attrs.Where(a => IsTsDecorator(a.AttributeClass) && DecoOption(a.AttributeClass, "DeclaresProperty", false)).ToList();
        string prop = null;
        List<(string key, string value)> propOpts = null;
        string explicitTypeExpr = null;
        if (declaring.Count > 0)
        {
            if (declaring.Count > 1) Error(declaring[1].ApplicationSyntaxReference?.GetSyntax() ?? node, "CSX0030", $"{member.Name} has two decorators that each declare the Cocos property.");
            var cc = attrs.Where(a => Sym.IsBinding(a.AttributeClass) && !IsTsDecorator(a.AttributeClass)).ToList();
            var explicitType = false;
            propOpts = PropertyOptions(member, cc, node, ref explicitTypeExpr, ref explicitType);
            if (!explicitType) explicitTypeExpr = null;
            // marked explicitly, like [SerializeField]: shown although Cocos hides names starting with _
            if (member.Name.StartsWith("_") && !propOpts.Any(o => o.key == "visible") && DecoOption<string>(declaring[0].AttributeClass, "PropertyOptions", null) != null) propOpts.Add(("visible", "true"));
        }
        else if (member is not IMethodSymbol) prop = PropertyDecorator(member, type, node);
        var serialized = prop != null || declaring.Count > 0;
        var lines = new List<string>();
        var firstCc = attrs.FindIndex(a => Sym.IsBinding(a.AttributeClass) && !IsTsDecorator(a.AttributeClass));
        for (var i = 0; i < attrs.Count; i++)
        {
            if (prop != null && i == firstCc)
            {
                lines.Add(prop);
                prop = null;
            }
            if (IsTsDecorator(attrs[i].AttributeClass))
                lines.Add(TsDecorator(attrs[i], member, type, node, declaring.Count > 0 && attrs[i] == declaring[0] ? propOpts : null, explicitTypeExpr));
        }
        if (prop != null) lines.Add(prop);
        return (lines, serialized);
    }

    /// <summary>@name(args): positional arguments in order (undefined for the ones left out), the options object at its place.</summary>
    string TsDecorator(AttributeData a, ISymbol member, ITypeSymbol memberType, SyntaxNode node, List<(string key, string value)> propOpts, string explicitTypeExpr)
    {
        var cls = a.AttributeClass.OriginalDefinition;
        var at = a.ApplicationSyntaxReference?.GetSyntax() ?? node;
        var mod = Sym.TsModuleOf(cls);
        if (mod == null) return "// " + cls.Name;
        var csName = cls.Name.EndsWith("Attribute") ? cls.Name.Substring(0, cls.Name.Length - "Attribute".Length) : cls.Name;
        var local = ImportTs(mod.Value.module, mod.Value.export, mod.Value.export == "default" ? char.ToLowerInvariant(csName[0]) + csName.Substring(1) : mod.Value.export);
        if (DecoOption(cls, "Bare", false)) return "@" + local;
        // positional arguments
        var ctor = a.AttributeConstructor;
        var args = new List<string>();
        if (ctor != null)
        {
            var given = ExplicitParams(a);
            for (var i = 0; i < ctor.Parameters.Length && i < a.ConstructorArguments.Length; i++)
            {
                var p = ctor.Parameters[i];
                var c = a.ConstructorArguments[i];
                if (p.IsParams)
                {
                    if (given.Contains(i) && c.Kind == TypedConstantKind.Array) foreach (var v in c.Values) args.Add(DecoArg(v, at));
                    continue;
                }
                args.Add(given.Contains(i) ? DecoArg(c, at) : "undefined");
            }
        }
        // the options object
        var optIndex = DecoOption(cls, "OptionsIndex", -1);
        if (optIndex >= 0)
        {
            var opts = new List<string>();
            var typeOpt = DecoOption<string>(cls, "TypeOption", null);
            var typeSet = false;
            foreach (var na in a.NamedArguments)
            {
                var key = cls.GetMembers(na.Key).FirstOrDefault() is { } m ? Sym.TsName(m) : char.ToLowerInvariant(na.Key[0]) + na.Key.Substring(1);
                if (key == typeOpt) typeSet = true;
                opts.Add(key + ": " + DecoArg(na.Value, at));
            }
            // a required `type` left out: the member's type, as for the automatic @property
            if (typeOpt != null && !typeSet && memberType != null)
            {
                var te = explicitTypeExpr ?? ElementTypeExpr(memberType, node);
                if (te != null) opts.Insert(0, typeOpt + ": " + te);
                else Error(at, "CSX0031", $"[{csName}] needs Type = typeof(...): the type of {member.Name} has no Cocos property type.");
            }
            if (propOpts != null && propOpts.Count > 0)
            {
                var propKey = DecoOption<string>(cls, "PropertyOptions", null);
                if (propKey != null) opts.Add(propKey + ": { " + string.Join(", ", propOpts.Select(o => o.key + ": " + o.value)) + " }");
                else Warn(at, "CSX2011", $"[{csName}] declares the Cocos property itself and takes no property options: {string.Join(", ", propOpts.Select(o => o.key))} ignored.");
            }
            var obj = opts.Count > 0 ? "{ " + string.Join(", ", opts) + " }" : DecoOption(cls, "OptionsRequired", false) ? "{}" : "undefined";
            while (args.Count < optIndex) args.Add("undefined");
            args.Insert(optIndex, obj);
        }
        return "@" + local + "(" + string.Join(", ", TrimUndefined(args)) + ")";
    }

    /// <summary>The constructor parameters given in the attribute's source (the others take their TypeScript default).</summary>
    static HashSet<int> ExplicitParams(AttributeData a)
    {
        var set = new HashSet<int>();
        var ps = a.AttributeConstructor?.Parameters ?? ImmutableArray<IParameterSymbol>.Empty;
        if (ps.Length == 0 || a.ApplicationSyntaxReference?.GetSyntax() is not AttributeSyntax syn || syn.ArgumentList == null) return set;
        var pos = 0;
        foreach (var arg in syn.ArgumentList.Arguments)
        {
            if (arg.NameEquals != null) continue;
            if (arg.NameColon != null)
            {
                var idx = ps.IndexOf(ps.FirstOrDefault(p => p.Name == arg.NameColon.Name.Identifier.ValueText));
                if (idx >= 0) set.Add(idx);
                continue;
            }
            set.Add(Math.Min(pos, ps.Length - 1));
            pos++;
        }
        return set;
    }

    /// <summary>A decorator argument: literals, enum members, typeof(X) as the Cocos type (CCString, Color...), arrays.</summary>
    string DecoArg(TypedConstant c, SyntaxNode node)
    {
        if (c.IsNull) return "null";
        if (c.Kind == TypedConstantKind.Array) return "[" + string.Join(", ", c.Values.Select(v => DecoArg(v, node))) + "]";
        if (c.Kind == TypedConstantKind.Type && c.Value is ITypeSymbol t) return ElementTypeExpr(t, node) ?? "undefined";
        return Literal(c.Value, c.Type);
    }

    /// <summary>The Cocos type expression for @property: null when Cocos infers it from the default value.</summary>
    string CocosTypeExpr(ITypeSymbol t, SyntaxNode node)
    {
        switch (t.SpecialType)
        {
            case SpecialType.System_Int16:
            case SpecialType.System_Int32:
            case SpecialType.System_Int64:
            case SpecialType.System_UInt16:
            case SpecialType.System_UInt32:
            case SpecialType.System_UInt64:
            case SpecialType.System_Byte:
            case SpecialType.System_SByte:
                _cc.Add("CCInteger");
                return "CCInteger";
            case SpecialType.System_Single:
            case SpecialType.System_Double:
            case SpecialType.System_Boolean:
            case SpecialType.System_String:
            case SpecialType.System_Char:
                return null;
        }
        if (t is IArrayTypeSymbol at) return "[" + (ElementTypeExpr(at.ElementType, node) ?? "CCFloat") + "]";
        if (t is INamedTypeSymbol nt && IsList(nt)) return "[" + (ElementTypeExpr(nt.TypeArguments[0], node) ?? "CCFloat") + "]";
        if (t.TypeKind == TypeKind.Enum && t is INamedTypeSymbol et)
        {
            _cc.Add("Enum");
            return "Enum(" + TypeRef(et) + ")";
        }
        if (t is INamedTypeSymbol n && (Sym.IsBinding(n) || _ctx.IsUser(n)))
        {
            if (Sym.Has(n, "TsAny") || Sym.Has(n, "TsStringEnum") || n.TypeKind == TypeKind.Interface) return null;
            return TypeRef(n);
        }
        if (t.TypeKind != TypeKind.Error) Warn(node, "CSX2004", $"{t.ToDisplayString()} can't be a Cocos property type; give it [property(typeof(...))].");
        return null;
    }

    string ElementTypeExpr(ITypeSymbol t, SyntaxNode node)
    {
        switch (t.SpecialType)
        {
            case SpecialType.System_Single:
            case SpecialType.System_Double:
                _cc.Add("CCFloat");
                return "CCFloat";
            case SpecialType.System_Boolean:
                _cc.Add("CCBoolean");
                return "CCBoolean";
            case SpecialType.System_String:
            case SpecialType.System_Char:
                _cc.Add("CCString");
                return "CCString";
        }
        return CocosTypeExpr(t, node);
    }

    string ConstArg(TypedConstant c)
    {
        if (c.Kind == TypedConstantKind.Array) return "[" + string.Join(", ", c.Values.Select(ConstArg)) + "]";
        if (c.Kind == TypedConstantKind.Type && c.Value is INamedTypeSymbol t) return TypeRef(t) ?? "undefined";
        if (c.Kind == TypedConstantKind.Type && c.Value is IArrayTypeSymbol at && at.ElementType is INamedTypeSymbol et) return "[" + (TypeRef(et) ?? "undefined") + "]";
        return Literal(c.Value, c.Type);
    }

    // ------------------------------------------------------------------ literals and defaults
    public static string Str(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder("'");
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\'': sb.Append("\\'"); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                case '\0': sb.Append("\\0"); break;
                default:
                    if (ch < 0x20 || ch == (char)0x2028 || ch == (char)0x2029) sb.Append("\\u").Append(((int)ch).ToString("x4"));
                    else sb.Append(ch);
                    break;
            }
        }
        return sb.Append('\'').ToString();
    }

    static string Num(object v) => v switch
    {
        double d when double.IsPositiveInfinity(d) => "Infinity",
        double d when double.IsNegativeInfinity(d) => "-Infinity",
        double d when double.IsNaN(d) => "NaN",
        float f when float.IsPositiveInfinity(f) => "Infinity",
        float f when float.IsNegativeInfinity(f) => "-Infinity",
        float f when float.IsNaN(f) => "NaN",
        double d => d.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        float f => ((double)f).ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        decimal m => m.ToString(System.Globalization.CultureInfo.InvariantCulture),
        _ => Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture),
    };

    string Literal(object v, ITypeSymbol type)
    {
        if (v == null) return "null";
        if (v is string s) return Str(s);
        if (v is char c) return Str(c.ToString());
        if (v is bool b) return b ? "true" : "false";
        if (type != null && type.TypeKind == TypeKind.Enum && type is INamedTypeSymbol et)
        {
            var f = et.GetMembers().OfType<IFieldSymbol>().FirstOrDefault(x => x.HasConstantValue && Equals(x.ConstantValue, v));
            if (f != null) return EnumMember(et, f);
        }
        return Num(v);
    }

    string EnumMember(INamedTypeSymbol et, IFieldSymbol f)
    {
        if (Sym.Has(et, "TsConstEnum")) return Num(f.ConstantValue);
        return TypeRef(et) + "." + MemberName(f);
    }

    /// <summary>C#'s default value of a type; Cocos properties get usable defaults ('' and new Vec3()).</summary>
    string DefaultValue(ITypeSymbol t, bool forProperty = false)
    {
        if (t.TypeKind == TypeKind.Enum)
        {
            var et = (INamedTypeSymbol)t;
            var f = et.GetMembers().OfType<IFieldSymbol>().FirstOrDefault(x => x.HasConstantValue && Convert.ToInt64(x.ConstantValue) == 0);
            return f != null ? EnumMember(et, f) : "0";
        }
        switch (t.SpecialType)
        {
            case SpecialType.System_Boolean:
                return "false";
            case SpecialType.System_String:
            case SpecialType.System_Char:
                return forProperty ? "''" : "null";
            case SpecialType.System_Object:
                return "null";
        }
        if (IsNumeric(t)) return "0";
        if (forProperty && t is INamedTypeSymbol nt && _ctx.DerivesFrom(nt, _ctx.ValueType) && !nt.IsAbstract) return "new " + TypeRef(nt) + "()";
        if (forProperty && t is IArrayTypeSymbol) return "[]";
        if (forProperty && t is INamedTypeSymbol lt && IsList(lt)) return "[]";
        return "null";
    }

    public static bool IsNumeric(ITypeSymbol t)
    {
        if (t == null) return false;
        if (t is INamedTypeSymbol n && n.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T) t = n.TypeArguments[0];
        switch (t.SpecialType)
        {
            case SpecialType.System_Byte:
            case SpecialType.System_SByte:
            case SpecialType.System_Int16:
            case SpecialType.System_UInt16:
            case SpecialType.System_Int32:
            case SpecialType.System_UInt32:
            case SpecialType.System_Int64:
            case SpecialType.System_UInt64:
            case SpecialType.System_Single:
            case SpecialType.System_Double:
            case SpecialType.System_Decimal:
                return true;
        }
        return false;
    }

    public static bool IsIntegral(ITypeSymbol t)
    {
        if (t == null) return false;
        if (t is INamedTypeSymbol n && n.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T) t = n.TypeArguments[0];
        switch (t.SpecialType)
        {
            case SpecialType.System_Byte:
            case SpecialType.System_SByte:
            case SpecialType.System_Int16:
            case SpecialType.System_UInt16:
            case SpecialType.System_Int32:
            case SpecialType.System_UInt32:
            case SpecialType.System_Int64:
            case SpecialType.System_UInt64:
            case SpecialType.System_Char:
                return true;
        }
        return t.TypeKind == TypeKind.Enum;
    }
}
