using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CsTranspiler;

/// <summary>What every file's emitter needs to know about the whole C# project.</summary>
public sealed class ProjectContext
{
    public readonly CSharpCompilation Compilation;
    public readonly string Root;
    public readonly HashSet<SyntaxTree> UserTrees;
    /// <summary>User types: their TypeScript name (nested types are flattened to Outer_Inner).</summary>
    public readonly Dictionary<INamedTypeSymbol, string> TypeNames = new(SymbolEqualityComparer.Default);
    /// <summary>User types: the .cs file that declares them.</summary>
    public readonly Dictionary<INamedTypeSymbol, string> TypeFiles = new(SymbolEqualityComparer.Default);
    /// <summary>User methods renamed because TypeScript has no overloads (foo, foo_2, ...).</summary>
    public readonly Dictionary<IMethodSymbol, string> MethodNames = new(SymbolEqualityComparer.Default);
    public readonly INamedTypeSymbol Component;
    public readonly INamedTypeSymbol ValueType;
    public readonly INamedTypeSymbol CCObject;
    public readonly INamedTypeSymbol Node;
    public readonly INamedTypeSymbol Asset;
    /// <summary>User classes serialized as nested data ([Serializable], [ClassName], or the type of an explicitly serialized field).</summary>
    public readonly HashSet<INamedTypeSymbol> DataClasses = new(SymbolEqualityComparer.Default);
    /// <summary>Classes that get @ccclass, and the name.</summary>
    public readonly Dictionary<INamedTypeSymbol, string> CcclassNames = new(SymbolEqualityComparer.Default);
    /// <summary>ccclass name -> the classes using it (more than one is an error).</summary>
    public readonly Dictionary<string, List<INamedTypeSymbol>> CcclassUsers = new(StringComparer.Ordinal);

    public ProjectContext(CSharpCompilation comp, List<SyntaxTree> trees, string root)
    {
        Compilation = comp;
        Root = root;
        UserTrees = new HashSet<SyntaxTree>(trees);
        Component = comp.GetTypeByMetadataName("cc.Component");
        ValueType = comp.GetTypeByMetadataName("cc.ValueType");
        CCObject = comp.GetTypeByMetadataName("cc.CCObject");
        Node = comp.GetTypeByMetadataName("cc.Node");
        Asset = comp.GetTypeByMetadataName("cc.Asset");
        foreach (var tree in trees)
        {
            var model = comp.GetSemanticModel(tree);
            foreach (var decl in tree.GetRoot().DescendantNodes().OfType<MemberDeclarationSyntax>())
            {
                if (decl is not BaseTypeDeclarationSyntax && decl is not DelegateDeclarationSyntax) continue;
                if (model.GetDeclaredSymbol(decl) is not INamedTypeSymbol sym) continue;
                if (TypeNames.ContainsKey(sym)) continue;
                var parts = new List<string>();
                for (var t = sym; t != null; t = t.ContainingType) parts.Insert(0, t.Name);
                TypeNames[sym] = string.Join("_", parts);
                TypeFiles[sym] = tree.FilePath;
                if (sym.TypeKind == TypeKind.Class || sym.TypeKind == TypeKind.Interface) NameOverloads(sym);
            }
        }
        ComputeSerialization();
        // names a TypeScript import must not shadow in a generated file: cc exports and the project's C# types
        var ccNs = comp.GlobalNamespace.GetNamespaceMembers().FirstOrDefault(n => n.Name == "cc");
        if (ccNs != null)
        {
            foreach (var t in ccNs.GetTypeMembers()) TakenNames.Add(Sym.TsName(t));
            var globals = ccNs.GetTypeMembers("Globals").FirstOrDefault();
            if (globals != null) foreach (var m in globals.GetMembers()) TakenNames.Add(Sym.TsName(m));
        }
        foreach (var n in TypeNames.Values) TakenNames.Add(n);
        TakenNames.Add("_decorator");
        TakenNames.Add("__cs");
    }

    /// <summary>Names already meaning something in generated files (cc exports, C# types, helpers).</summary>
    public readonly HashSet<string> TakenNames = new(StringComparer.Ordinal);

    // ------------------------------------------------------------------ serialization (Unity rule)
    // TS interop attributes ([AI.ReadOnly]...) are never the C#-style ones, whatever their names
    static bool HasAttr(ISymbol s, params string[] names) =>
        s.GetAttributes().Any(a => a.AttributeClass != null && names.Contains(a.AttributeClass.Name) && !Sym.IsTs(a.AttributeClass));

    /// <summary>[NonSerialized] / [Serializable] are pseudo-attributes: read them from the syntax too.</summary>
    static bool HasSyntaxAttr(ISymbol s, params string[] names)
    {
        foreach (var r in s.DeclaringSyntaxReferences)
        {
            var node = r.GetSyntax();
            var lists = node switch
            {
                VariableDeclaratorSyntax v => (v.Parent?.Parent as MemberDeclarationSyntax)?.AttributeLists,
                MemberDeclarationSyntax m => m.AttributeLists,
                _ => null,
            };
            if (lists == null) continue;
            foreach (var l in lists)
                foreach (var a in l.Attributes)
                {
                    var n = a.Name.ToString().Split('.').Last();
                    if (names.Contains(n) || names.Contains(n + "Attribute")) return true;
                }
        }
        return false;
    }

    /// <summary>Attributes that make a field (or property) serialized whatever its visibility.</summary>
    public static readonly string[] ExplicitSerialize = { "SerializeFieldAttribute", "PropertyAttribute", "property", "TypeAttribute", "type", "serializable" };

    public static bool IsNonSerialized(ISymbol s) => HasAttr(s, "NonSerializedAttribute") || HasSyntaxAttr(s, "NonSerialized");

    static bool IsMarkedSerializable(INamedTypeSymbol t) =>
        t.IsSerializable || HasSyntaxAttr(t, "Serializable") || HasAttr(t, "ClassNameAttribute", "ccclass");

    static ITypeSymbol ElementOf(ITypeSymbol t) => t switch
    {
        IArrayTypeSymbol a => a.ElementType,
        INamedTypeSymbol n when Emitter.IsList(n) => n.TypeArguments[0],
        _ => t,
    };

    void ComputeSerialization()
    {
        var classes = TypeNames.Keys.Where(t => t.TypeKind == TypeKind.Class).ToList();
        foreach (var c in classes)
            if (!IsComponent(c) && IsMarkedSerializable(c)) DataClasses.Add(c);
        // the type of an explicitly serialized field becomes a data class; so do bases of data classes
        for (var changed = true; changed;)
        {
            changed = false;
            foreach (var c in classes)
            {
                if (!IsComponent(c) && !DataClasses.Contains(c)) continue;
                foreach (var f in c.GetMembers().OfType<IFieldSymbol>())
                {
                    if (f.IsStatic || f.IsConst || IsNonSerialized(f) || !HasAttr(f, ExplicitSerialize)) continue;
                    if (ElementOf(f.Type) is INamedTypeSymbol el && el.TypeKind == TypeKind.Class && TypeNames.ContainsKey(el.OriginalDefinition) && !IsComponent(el) && DataClasses.Add(el.OriginalDefinition)) changed = true;
                }
            }
            foreach (var d in DataClasses.ToList())
                for (var b = d.BaseType; b != null && TypeNames.ContainsKey(b.OriginalDefinition) && !IsComponent(b); b = b.BaseType)
                    if (DataClasses.Add(b.OriginalDefinition)) changed = true;
        }
        // @ccclass: components (abstract ones only when they declare serialized fields) and data classes
        foreach (var c in classes)
        {
            var isComp = IsComponent(c);
            if (!isComp && !DataClasses.Contains(c)) continue;
            if (isComp && c.IsAbstract && !c.GetMembers().OfType<IFieldSymbol>().Any(f => IsSerializedFieldIn(f, true))) continue;
            var name = AttrString(c, "ClassNameAttribute") ?? AttrString(c, "ccclass") ?? TypeNames[c];
            CcclassNames[c] = name;
            if (!CcclassUsers.TryGetValue(name, out var list)) CcclassUsers[name] = list = new List<INamedTypeSymbol>();
            list.Add(c);
        }
    }

    static string AttrString(ISymbol s, string name)
    {
        var a = s.GetAttributes().FirstOrDefault(x => x.AttributeClass?.Name == name);
        return a != null && a.ConstructorArguments.Length > 0 ? a.ConstructorArguments[0].Value as string : null;
    }

    /// <summary>Whether values of this type can be saved by Cocos (as a field, or an array/List of them).</summary>
    public bool IsSerializableType(ITypeSymbol t, bool allowCollection = true)
    {
        if (t == null) return false;
        if (allowCollection && (t is IArrayTypeSymbol || t is INamedTypeSymbol l && Emitter.IsList(l))) return IsSerializableType(ElementOf(t), false);
        if (t is IArrayTypeSymbol) return false;
        if (Emitter.IsNumeric(t) || t.TypeKind == TypeKind.Enum) return true;
        switch (t.SpecialType)
        {
            case SpecialType.System_Boolean:
            case SpecialType.System_String:
            case SpecialType.System_Char:
                return true;
        }
        if (t is not INamedTypeSymbol n || n.TypeKind != TypeKind.Class) return false;
        if (TypeNames.ContainsKey(n.OriginalDefinition)) return IsComponent(n) || DataClasses.Contains(n.OriginalDefinition);
        if (!Sym.IsBinding(n)) return false;
        // a TypeScript @ccclass class (data or component)
        if (Sym.IsTs(n) && Sym.Has(n.OriginalDefinition, "TsCcclass")) return true;
        return DerivesFrom(n, ValueType) || DerivesFrom(n, Node) || DerivesFrom(n, Component) || DerivesFrom(n, Asset);
    }

    /// <summary>
    /// The Unity rule: public instance fields of serializable types, or fields with [SerializeField]
    /// (or [Property]); never static/const/readonly or [NonSerialized]. Only in components and data classes.
    /// </summary>
    public bool IsSerializedField(IFieldSymbol f) => CcclassNames.ContainsKey(f.ContainingType.OriginalDefinition) && IsSerializedFieldIn(f, false);

    bool IsSerializedFieldIn(IFieldSymbol f, bool ignoreClass)
    {
        if (f.IsStatic || f.IsConst || f.IsReadOnly || f.IsImplicitlyDeclared || IsNonSerialized(f)) return false;
        if (HasAttr(f, ExplicitSerialize)) return true;
        return f.DeclaredAccessibility == Accessibility.Public && IsSerializableType(f.Type);
    }

    /// <summary>Other classes with the same ccclass name (empty when it is unique).</summary>
    public IEnumerable<INamedTypeSymbol> SameCcclassName(INamedTypeSymbol t) =>
        CcclassNames.TryGetValue(t.OriginalDefinition, out var n) ? CcclassUsers[n].Where(x => !SymbolEqualityComparer.Default.Equals(x, t.OriginalDefinition)) : Enumerable.Empty<INamedTypeSymbol>();

    void NameOverloads(INamedTypeSymbol type)
    {
        foreach (var group in type.GetMembers().OfType<IMethodSymbol>().Where(m => m.MethodKind == MethodKind.Ordinary && !m.IsImplicitlyDeclared && m.OverriddenMethod == null).GroupBy(m => m.Name))
        {
            var list = group.OrderBy(m => m.Locations.FirstOrDefault()?.SourceSpan.Start ?? 0).ToList();
            for (var i = 1; i < list.Count; i++) MethodNames[list[i]] = group.Key + "_" + (i + 1);
        }
    }

    public bool IsUser(ISymbol s) => s != null && s.DeclaringSyntaxReferences.Any(r => UserTrees.Contains(r.SyntaxTree));

    public bool IsComponent(ITypeSymbol t)
    {
        for (var b = t as INamedTypeSymbol; b != null; b = b.BaseType)
            if (SymbolEqualityComparer.Default.Equals(b.OriginalDefinition, Component)) return true;
        return false;
    }

    public bool DerivesFrom(ITypeSymbol t, INamedTypeSymbol baseType)
    {
        if (baseType == null) return false;
        for (var b = t as INamedTypeSymbol; b != null; b = b.BaseType)
            if (SymbolEqualityComparer.Default.Equals(b.OriginalDefinition, baseType)) return true;
        return false;
    }
}

/// <summary>Helpers for symbols of the Cocos bindings assembly and of the TypeScript interop stubs.</summary>
public static class Sym
{
    /// <summary>The TS interop stubs of the current compilation.</summary>
    public static SyntaxTree TsTree;

    /// <summary>Declared in the TS interop stubs (an exported TypeScript declaration, or a member of one).</summary>
    public static bool IsTs(ISymbol s)
    {
        if (s == null || TsTree == null) return false;
        var o = s.OriginalDefinition ?? s;
        foreach (var r in o.DeclaringSyntaxReferences) if (r.SyntaxTree == TsTree) return true;
        return false;
    }

    /// <summary>Cocos API or project TypeScript: names are TypeScript names, emitted as they are.</summary>
    public static bool IsBinding(ISymbol s) => s?.ContainingAssembly?.Name == "Cocos.Bindings" || IsTs(s);

    /// <summary>[TsModule] of a TS-bound type or exported function/variable: the module and the exported name.</summary>
    public static (string module, string export)? TsModuleOf(ISymbol s)
    {
        var a = Attr(s, "TsModule");
        if (a == null || a.ConstructorArguments.Length == 0 || a.ConstructorArguments[0].Value is not string m) return null;
        var exp = a.NamedArguments.FirstOrDefault(n => n.Key == "Export").Value.Value as string;
        return (m, exp ?? TsName(s));
    }

    public static AttributeData Attr(ISymbol s, string name) =>
        s?.GetAttributes().FirstOrDefault(a => a.AttributeClass?.Name == name && a.AttributeClass.ContainingNamespace?.Name == "cc");

    public static bool Has(ISymbol s, string name) => Attr(s, name) != null;

    /// <summary>The TypeScript name of a bound symbol ([TsName] when the C# name had to change).</summary>
    public static string TsName(ISymbol s)
    {
        var a = Attr(s, "TsName");
        if (a != null && a.ConstructorArguments.Length > 0 && a.ConstructorArguments[0].Value is string n) return n;
        return s.Name;
    }

    /// <summary>Path of a bound type below the cc module: Node, Node.EventType, gfx.Texture, __private._x.</summary>
    public static List<string> TypePath(INamedTypeSymbol t)
    {
        var parts = new List<string>();
        for (var c = t; c != null; c = c.ContainingType) parts.Insert(0, TsName(c));
        return parts;
    }

    public static bool IsGlobals(INamedTypeSymbol t) => t != null && t.ContainingAssembly?.Name == "Cocos.Bindings" && t.Name == "Globals" && t.ContainingType == null;
}

/// <summary>Indented TypeScript text.</summary>
public sealed class TsWriter
{
    readonly StringBuilder _sb = new();
    public int Indent;

    public void Line(string s = "")
    {
        if (s.Length == 0) { _sb.Append('\n'); return; }
        _sb.Append(' ', Indent * 4).Append(s).Append('\n');
    }

    public void Open(string head)
    {
        Line(head + " {");
        Indent++;
    }

    public void Close(string tail = "")
    {
        Indent--;
        Line("}" + tail);
    }

    public override string ToString() => _sb.ToString();
}
