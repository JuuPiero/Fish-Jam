using Microsoft.CodeAnalysis;

namespace CsTranspiler;

public sealed partial class Emitter
{
    static bool IsGeneric(INamedTypeSymbol t, string ns, string name, int arity) =>
        t != null && t.Arity == arity && t.Name == name && t.ContainingNamespace?.ToDisplayString() == ns;

    public static bool IsList(INamedTypeSymbol t) => IsGeneric(t?.OriginalDefinition, "System.Collections.Generic", "List", 1);
    public static bool IsDictionary(INamedTypeSymbol t) => IsGeneric(t?.OriginalDefinition, "System.Collections.Generic", "Dictionary", 2);
    public static bool IsHashSet(INamedTypeSymbol t) => IsGeneric(t?.OriginalDefinition, "System.Collections.Generic", "HashSet", 1);

    /// <summary>Array-like at runtime: T[], List&lt;T&gt; and the read-only collection interfaces.</summary>
    public static bool IsArrayLike(ITypeSymbol t)
    {
        if (t is IArrayTypeSymbol) return true;
        if (t is not INamedTypeSymbol n) return false;
        var o = n.OriginalDefinition;
        if (IsList(o)) return true;
        return o.ContainingNamespace?.ToDisplayString() == "System.Collections.Generic" && o.Arity == 1 &&
               (o.Name is "IList" or "IReadOnlyList" or "ICollection" or "IReadOnlyCollection" or "IEnumerable");
    }

    static ITypeSymbol ElementType(ITypeSymbol t) => t switch
    {
        IArrayTypeSymbol a => a.ElementType,
        INamedTypeSymbol n when n.TypeArguments.Length > 0 => n.TypeArguments[0],
        _ => null,
    };

    /// <summary>The TypeScript type of a C# type (for annotations).</summary>
    public string TsType(ITypeSymbol t, bool valuePosition = false)
    {
        if (t == null || t.TypeKind == TypeKind.Error || t.TypeKind == TypeKind.Dynamic) return "any";
        if (t is ITypeParameterSymbol tp) return tp.Name;
        if (t is IArrayTypeSymbol at)
        {
            var el = TsType(at.ElementType);
            return (el.Contains("=>") || el.Contains('|') ? "(" + el + ")" : el) + "[]";
        }
        switch (t.SpecialType)
        {
            case SpecialType.System_Void: return "void";
            case SpecialType.System_Object: return "any";
            case SpecialType.System_String:
            case SpecialType.System_Char: return "string";
            case SpecialType.System_Boolean: return "boolean";
        }
        if (IsNumeric(t)) return "number";
        if (t is not INamedTypeSymbol n) return "any";
        var o = n.OriginalDefinition;
        if (o.SpecialType == SpecialType.System_Nullable_T) return TsType(n.TypeArguments[0]);
        var ns = o.ContainingNamespace?.ToDisplayString() ?? "";
        if (ns == "System.Collections.Generic")
        {
            if (IsArrayLike(n)) return Wrap(TsType(n.TypeArguments[0])) + "[]";
            if (o.Name is "Dictionary" or "IDictionary" or "IReadOnlyDictionary") return "Map<" + TsType(n.TypeArguments[0]) + ", " + TsType(n.TypeArguments[1]) + ">";
            if (o.Name is "HashSet" or "ISet" or "IReadOnlySet") return "Set<" + TsType(n.TypeArguments[0]) + ">";
            if (o.Name == "KeyValuePair") return "[" + TsType(n.TypeArguments[0]) + ", " + TsType(n.TypeArguments[1]) + "]";
            // iterators (coroutines) are JavaScript iterators: generators
            if (o.Name == "IEnumerator" && o.Arity == 1) return "Iterator<" + TsType(n.TypeArguments[0]) + ">";
        }
        if (ns == "System.Collections" && o.Name == "IEnumerator") return "Iterator<any>";
        if (ns == "System")
        {
            if (o.Name == "Action") return "(" + FnParams(n.TypeArguments) + ") => void";
            if (o.Name == "Func") return "(" + FnParams(n.TypeArguments.Take(n.TypeArguments.Length - 1)) + ") => " + TsType(n.TypeArguments.Last());
            if (o.Name is "Delegate" or "MulticastDelegate") return "Function";
            if (o.Name.EndsWith("Exception")) return "Error";
            return "any";
        }
        if (ns == "System.Threading.Tasks" && o.Name == "Task") return n.Arity == 0 ? "Promise<void>" : "Promise<" + TsType(n.TypeArguments[0]) + ">";
        if (n.TypeKind == TypeKind.Delegate && !_ctx.IsUser(o))
        {
            var inv = n.DelegateInvokeMethod;
            return inv == null ? "Function" : "(" + string.Join(", ", inv.Parameters.Select(p => LocalName(p.Name) + ": " + TsType(p.Type))) + ") => " + TsType(inv.ReturnType);
        }
        var name = TypeRef(o, asType: true);
        if (name == null) return "any";
        if (name is "any" or "string") return name;
        if (n.TypeArguments.Length > 0 && !n.TypeArguments.Any(a => a.TypeKind == TypeKind.Error))
            name += "<" + string.Join(", ", n.TypeArguments.Select(a => TsType(a))) + ">";
        return name;
    }

    static string Wrap(string t) => t.Contains("=>") || t.Contains('|') ? "(" + t + ")" : t;

    string FnParams(IEnumerable<ITypeSymbol> types) => string.Join(", ", types.Select((a, i) => "arg" + i + ": " + TsType(a)));
}
