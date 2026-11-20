using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CsTranspiler;

/// <summary>
/// .NET members C# scripts may use, mapped to JavaScript: List&lt;T&gt; -> Array, Dictionary -> Map,
/// HashSet -> Set, string, Math, a LINQ subset on arrays/lists, Task -> Promise, Console -> console.
/// Anything else is reported as unsupported.
/// </summary>
public sealed partial class Emitter
{
    string Cs(string fn) => Runtime("__cs") + "." + fn;

    static string A(List<string> args, int i) => args != null && i < args.Count ? args[i] : "undefined";

    /// <summary>Methods with out parameters that have a JavaScript shape: TryGetValue, TryParse.</summary>
    string OutCall(IMethodSymbol m, InvocationExpressionSyntax inv, string recv)
    {
        var args = inv.ArgumentList.Arguments;
        string OutTarget(ArgumentSyntax a, ITypeSymbol type)
        {
            if (a.Expression is DeclarationExpressionSyntax de && de.Designation is SingleVariableDesignationSyntax sv)
                return Hoist(LocalName(sv.Identifier.ValueText), type, a);
            if (a.Expression is DeclarationExpressionSyntax { Designation: DiscardDesignationSyntax }) return Temp(a);
            return Expr(a.Expression);
        }
        var ct = m.ContainingType?.OriginalDefinition;
        if (m.Name == "TryGetValue" && ct != null && (IsDictionary(ct) || ct.Name is "IDictionary" or "IReadOnlyDictionary") && args.Count == 2)
        {
            var d = recv;
            var key = Expr(args[0].Expression);
            if (!IsSimple(args[0].Expression))
            {
                var t = Temp(inv);
                return "(" + t + " = " + key + ", " + d + ".has(" + t + ") ? (" + OutTarget(args[1], m.Parameters[1].Type) + " = " + d + ".get(" + t + "), true) : (" + OutTarget(args[1], m.Parameters[1].Type) + " = " + DefaultValue(m.Parameters[1].Type) + ", false))";
            }
            var target = OutTarget(args[1], m.Parameters[1].Type);
            return "(" + d + ".has(" + key + ") ? (" + target + " = " + d + ".get(" + key + "), true) : (" + target + " = " + DefaultValue(m.Parameters[1].Type) + ", false))";
        }
        if (m.Name == "TryParse" && m.IsStatic && args.Count == 2 && IsNumeric(m.ContainingType))
        {
            var target = OutTarget(args[1], m.Parameters[1].Type);
            var fn = IsIntegral(m.ContainingType) ? "parseInt" : "parseFloat";
            return "!isNaN(" + target + " = " + Cs(fn) + "(" + Expr(args[0].Expression) + "))";
        }
        if (m.Name == "TryParse" && m.IsStatic && args.Count == 2 && m.ContainingType.SpecialType == SpecialType.System_Boolean)
        {
            var target = OutTarget(args[1], m.Parameters[1].Type);
            var s = Expr(args[0].Expression);
            return "(" + target + " = /^\\s*true\\s*$/i.test(" + s + "), /^\\s*(true|false)\\s*$/i.test(" + s + "))";
        }
        return null;
    }

    /// <summary>A .NET member as JavaScript, or null when it isn't supported.</summary>
    string Bcl(ISymbol sym, string recv, List<string> args, SyntaxNode node, ExpressionSyntax recvExpr = null)
    {
        if (sym is IMethodSymbol om && node is InvocationExpressionSyntax inv0 && om.Parameters.Any(p => p.RefKind == RefKind.Out))
            return OutCall(om, inv0, recv);
        var ct = sym.ContainingType?.OriginalDefinition;
        if (ct == null) return null;
        var ns = ct.ContainingNamespace?.ToDisplayString() ?? "";
        var name = sym.Name;
        var recvType = recvExpr != null ? _model.GetTypeInfo(recvExpr).Type : null;
        var isMethod = sym is IMethodSymbol;

        // ---- System.Math / MathF
        if (ns == "System" && (ct.Name == "Math" || ct.Name == "MathF"))
        {
            switch (name)
            {
                case "PI": return "Math.PI";
                case "E": return "Math.E";
                case "Tau": return "(Math.PI * 2)";
                case "Abs": case "Floor": case "Sqrt": case "Exp": case "Sin": case "Cos": case "Tan": case "Asin": case "Acos": case "Atan":
                case "Atan2": case "Pow": case "Sign": case "Log10": case "Log2": case "Sinh": case "Cosh": case "Tanh": case "Cbrt":
                    return "Math." + name.ToLowerInvariant() + "(" + string.Join(", ", args) + ")";
                case "Ceiling": return "Math.ceil(" + A(args, 0) + ")";
                case "Truncate": return "Math.trunc(" + A(args, 0) + ")";
                case "Round":
                    if (args.Count == 1) return "Math.round(" + A(args, 0) + ")";
                    if (args.Count == 2 && IsIntegral(((IMethodSymbol)sym).Parameters[1].Type)) return Cs("round") + "(" + A(args, 0) + ", " + A(args, 1) + ")";
                    return null;
                case "Log": return args.Count == 1 ? "Math.log(" + A(args, 0) + ")" : "(Math.log(" + A(args, 0) + ") / Math.log(" + A(args, 1) + "))";
                case "Min": case "Max": return "Math." + name.ToLowerInvariant() + "(" + string.Join(", ", args) + ")";
                case "Clamp": return "Math.min(Math.max(" + A(args, 0) + ", " + A(args, 1) + "), " + A(args, 2) + ")";
            }
            return null;
        }
        // ---- console
        if ((ns == "System" && ct.Name == "Console") || (ns == "System.Diagnostics" && ct.Name == "Debug"))
        {
            switch (name)
            {
                case "WriteLine": case "Write": case "Print": case "Log": return "console.log(" + string.Join(", ", args) + ")";
                case "Assert": return "console.assert(" + string.Join(", ", args) + ")";
                case "Fail": return "console.error(" + string.Join(", ", args) + ")";
            }
            return null;
        }
        // ---- IEnumerator (JavaScript iterators): while (e.MoveNext()) use(e.Current);
        if ((ns == "System.Collections" || ns == "System.Collections.Generic") && ct.Name == "IEnumerator")
        {
            switch (name)
            {
                case "MoveNext": return Cs("moveNext") + "(" + recv + ")";
                case "Current": return Cs("current") + "(" + recv + ")";
            }
            return null;
        }
        if (ns == "System" && ct.Name == "IDisposable" && name == "Dispose" && recvType is INamedTypeSymbol et && et.OriginalDefinition.Name == "IEnumerator")
            return Cs("dispose") + "(" + recv + ")";

        // ---- object members (ToString, Equals, GetType)
        if (name == "ToString" && isMethod && args.Count == 0) return recvType?.SpecialType == SpecialType.System_String ? recv : (recvType?.TypeKind == TypeKind.Enum ? EnumName(recvType, recv) : "String(" + recv + ")");
        if (name == "ToString" && isMethod && args.Count == 1 && IsNumeric(recvType) && recvExpr != null)
        {
            var f = ((InvocationExpressionSyntax)node).ArgumentList.Arguments[0].Expression;
            if (_model.GetConstantValue(f).Value is string fs) return Format(recv, fs, node);
            return null;
        }
        if (name == "Equals" && isMethod && args.Count == 1 && !sym.IsStatic) return "(" + recv + " === " + A(args, 0) + ")";
        if (name == "Equals" && isMethod && args.Count == 2 && sym.IsStatic) return "(" + A(args, 0) + " === " + A(args, 1) + ")";
        if (name == "ReferenceEquals") return "(" + A(args, 0) + " === " + A(args, 1) + ")";
        if (name == "GetType" && isMethod) return recv + ".constructor";
        if (name == "CompareTo" && isMethod && args.Count == 1) return Cs("compare") + "(" + recv + ", " + A(args, 0) + ")";

        // ---- numbers
        if (ns == "System" && (IsNumeric(ct) || ct.SpecialType == SpecialType.System_Boolean))
        {
            switch (name)
            {
                case "Parse":
                    if (ct.SpecialType == SpecialType.System_Boolean) return "(/^\\s*true\\s*$/i.test(" + A(args, 0) + "))";
                    return IsIntegral(ct) ? Cs("parseInt") + "(" + A(args, 0) + ")" : Cs("parseFloat") + "(" + A(args, 0) + ")";
                case "MaxValue":
                    return ct.SpecialType switch
                    {
                        SpecialType.System_Int32 => "2147483647",
                        SpecialType.System_Int64 => "Number.MAX_SAFE_INTEGER",
                        SpecialType.System_Int16 => "32767",
                        SpecialType.System_Byte => "255",
                        _ => "Number.MAX_VALUE",
                    };
                case "MinValue":
                    return ct.SpecialType switch
                    {
                        SpecialType.System_Int32 => "-2147483648",
                        SpecialType.System_Int64 => "Number.MIN_SAFE_INTEGER",
                        SpecialType.System_Int16 => "-32768",
                        SpecialType.System_Byte => "0",
                        _ => "-Number.MAX_VALUE",
                    };
                case "Epsilon": return "Number.MIN_VALUE";
                case "PositiveInfinity": return "Infinity";
                case "NegativeInfinity": return "-Infinity";
                case "NaN": return "NaN";
                case "IsNaN": return "isNaN(" + A(args, 0) + ")";
                case "IsInfinity": return "(Math.abs(" + A(args, 0) + ") === Infinity)";
                case "IsFinite": return "isFinite(" + A(args, 0) + ")";
            }
            return null;
        }
        if (ns == "System" && ct.Name == "Convert")
        {
            switch (name)
            {
                case "ToInt32": case "ToInt64": case "ToInt16": return "Math.round(Number(" + A(args, 0) + "))";
                case "ToSingle": case "ToDouble": case "ToDecimal": return "Number(" + A(args, 0) + ")";
                case "ToString": return "String(" + A(args, 0) + ")";
                case "ToBoolean": return "Boolean(" + A(args, 0) + ")";
            }
            return null;
        }
        // ---- strings
        if (ct.SpecialType == SpecialType.System_String)
        {
            if (!sym.IsStatic)
            {
                switch (name)
                {
                    case "Length": return recv + ".length";
                    case "Chars": return recv + "[" + A(args, 0) + "]";
                    case "Substring": return args.Count == 1 ? recv + ".substring(" + A(args, 0) + ")" : recv + ".substr(" + A(args, 0) + ", " + A(args, 1) + ")";
                    case "IndexOf": return recv + ".indexOf(" + string.Join(", ", args) + ")";
                    case "LastIndexOf": return recv + ".lastIndexOf(" + string.Join(", ", args) + ")";
                    case "Contains": return recv + ".includes(" + A(args, 0) + ")";
                    case "StartsWith": return recv + ".startsWith(" + A(args, 0) + ")";
                    case "EndsWith": return recv + ".endsWith(" + A(args, 0) + ")";
                    case "ToUpper": case "ToUpperInvariant": return recv + ".toUpperCase()";
                    case "ToLower": case "ToLowerInvariant": return recv + ".toLowerCase()";
                    case "Trim": return args.Count == 0 ? recv + ".trim()" : null;
                    case "TrimStart": return args.Count == 0 ? recv + ".replace(/^\\s+/, '')" : null;
                    case "TrimEnd": return args.Count == 0 ? recv + ".replace(/\\s+$/, '')" : null;
                    case "Split": return args.Count == 1 ? recv + ".split(" + A(args, 0) + ")" : null;
                    case "Replace": return recv + ".split(" + A(args, 0) + ").join(" + A(args, 1) + ")";
                    case "PadLeft": return Cs("padLeft") + "(" + recv + ", " + A(args, 0) + (args.Count > 1 ? ", " + A(args, 1) : "") + ")";
                    case "PadRight": return Cs("padRight") + "(" + recv + ", " + A(args, 0) + (args.Count > 1 ? ", " + A(args, 1) : "") + ")";
                    case "ToCharArray": return recv + ".split('')";
                    case "Insert": return "(" + recv + ".substring(0, " + A(args, 0) + ") + " + A(args, 1) + " + " + recv + ".substring(" + A(args, 0) + "))";
                    case "Remove": return args.Count == 1 ? recv + ".substring(0, " + A(args, 0) + ")" : "(" + recv + ".substring(0, " + A(args, 0) + ") + " + recv + ".substring(" + A(args, 0) + " + " + A(args, 1) + "))";
                }
                return null;
            }
            switch (name)
            {
                case "Empty": return "''";
                case "IsNullOrEmpty": return "!" + Paren0(A(args, 0));
                case "IsNullOrWhiteSpace": return Cs("isBlank") + "(" + A(args, 0) + ")";
                case "Join":
                {
                    var m = (IMethodSymbol)sym;
                    var call = ((InvocationExpressionSyntax)node).ArgumentList.Arguments;
                    // string.Join(sep, array): the array itself (the params mark only says "an array")
                    if (call.Count == 2 && !(_model.GetTypeInfo(call[1].Expression).Type is { } jt && (IsArrayLike(jt)))) return "[" + Unmark(A(args, 1)) + "].join(" + A(args, 0) + ")";
                    if (args.Count == 2) return Paren0(Unmark(A(args, 1))) + ".join(" + A(args, 0) + ")";
                    return "[" + string.Join(", ", args.Skip(1)) + "].join(" + A(args, 0) + ")";
                }
                case "Concat": return "(" + string.Join(" + ", args.Select(a => "String(" + a + ")")) + ")";
                case "Compare": return Cs("compare") + "(" + A(args, 0) + ", " + A(args, 1) + ")";
                case "Format":
                    // string.Format(fmt, array): the array goes to formatv as is (no spread syntax)
                    if (args.Count == 2 && args[1].StartsWith(SpreadMark)) return Cs("formatv") + "(" + args[0] + ", " + Unmark(args[1]) + ")";
                    // string.Format(fmt, a, b) -> formatv(fmt, [a, b])
                    return Cs("formatv") + "(" + A(args, 0) + ", [" + string.Join(", ", args.Skip(1)) + "])";
            }
            return null;
        }
        if (ct.SpecialType == SpecialType.System_Char)
        {
            switch (name)
            {
                case "IsDigit": return "/^[0-9]$/.test(" + A(args, 0) + ")";
                case "IsLetter": return "/^[A-Za-z]$/.test(" + A(args, 0) + ")";
                case "IsWhiteSpace": return "/^\\s$/.test(" + A(args, 0) + ")";
                case "IsUpper": return "(" + A(args, 0) + " !== " + A(args, 0) + ".toLowerCase())";
                case "IsLower": return "(" + A(args, 0) + " !== " + A(args, 0) + ".toUpperCase())";
                case "ToUpper": return A(args, 0) + ".toUpperCase()";
                case "ToLower": return A(args, 0) + ".toLowerCase()";
            }
            return null;
        }
        // ---- Nullable<T>
        if (ct.SpecialType == SpecialType.System_Nullable_T)
        {
            switch (name)
            {
                case "HasValue": return "(" + recv + " != null)";
                case "Value": return recv;
                case "GetValueOrDefault": return "(" + recv + " ?? " + (args.Count > 0 ? A(args, 0) : "0") + ")";
            }
            return null;
        }
        // ---- exceptions
        if (ns == "System" && ct.Name.EndsWith("Exception"))
        {
            switch (name)
            {
                case "Message": return recv + ".message";
                case "StackTrace": return recv + ".stack";
            }
            return null;
        }
        // ---- tasks
        if (ns == "System.Threading.Tasks" && ct.Name == "Task")
        {
            switch (name)
            {
                case "Delay": return Cs("delay") + "(" + A(args, 0) + ")";
                case "CompletedTask": return "Promise.resolve()";
                case "FromResult": return "Promise.resolve(" + A(args, 0) + ")";
                case "Yield": return "Promise.resolve()";
                case "Run": return "Promise.resolve().then(" + A(args, 0) + ")";
                case "WhenAll": return "Promise.all(" + (args.Count == 1 && IsArgArray(node, 0) ? A(args, 0) : "[" + string.Join(", ", args) + "]") + ")";
                case "WhenAny": return "Promise.race(" + (args.Count == 1 && IsArgArray(node, 0) ? A(args, 0) : "[" + string.Join(", ", args) + "]") + ")";
                case "IsCompleted": return null;
            }
            return null;
        }
        if (ns == "System.Threading.Tasks" && ct.Name == "TaskCompletionSource")
        {
            switch (name)
            {
                case "Task": return recv + ".promise";
                case "SetResult": return recv + ".resolve(" + A(args, 0) + ")";
                case "TrySetResult": return "(" + recv + ".resolve(" + A(args, 0) + "), true)";
                case "SetException": return recv + ".reject(" + A(args, 0) + ")";
                case "TrySetException": return "(" + recv + ".reject(" + A(args, 0) + "), true)";
                case "SetCanceled": case "TrySetCanceled": return recv + ".reject(new Error('canceled'))";
            }
            return null;
        }
        // ---- arrays
        if (ns == "System" && ct.Name == "Array")
        {
            if (!sym.IsStatic && name == "Length") return recv + ".length";
            switch (name)
            {
                case "IndexOf": return A(args, 0) + ".indexOf(" + A(args, 1) + ")";
                case "Reverse": return A(args, 0) + ".reverse()";
                case "Sort": return args.Count == 1 ? SortCall(A(args, 0), ElementType(_model.GetTypeInfo(((InvocationExpressionSyntax)node).ArgumentList.Arguments[0].Expression).Type), null) : A(args, 0) + ".sort(" + A(args, 1) + ")";
                case "Empty": return "[]";
                case "Exists": return A(args, 0) + ".some(" + A(args, 1) + ")";
                case "Find": return A(args, 0) + ".find(" + A(args, 1) + ")";
                case "FindIndex": return A(args, 0) + ".findIndex(" + A(args, 1) + ")";
                case "ForEach": return A(args, 0) + ".forEach(" + A(args, 1) + ")";
                case "Fill": return A(args, 0) + ".fill(" + A(args, 1) + ")";
            }
            return null;
        }
        // ---- LINQ (on arrays and lists; eager)
        if (ns == "System.Linq" && ct.Name == "Enumerable") return Linq((IMethodSymbol)sym, recv, args, node);
        // ---- collections
        if (ns == "System.Collections.Generic")
        {
            var elem = ct.TypeParameters.Length > 0 && sym.ContainingType.TypeArguments.Length > 0 ? sym.ContainingType.TypeArguments[0] : null;
            if (ct.Name is "List" or "IList" or "ICollection" or "IReadOnlyList" or "IReadOnlyCollection" or "IEnumerable")
            {
                switch (name)
                {
                    case "Count": return recv + ".length";
                    case "Item": return recv + "[" + A(args, 0) + "]";
                    case "Add": return recv + ".push(" + A(args, 0) + ")";
                    case "AddRange": return recv + ".push(..." + A(args, 0) + ")";
                    case "Insert": return recv + ".splice(" + A(args, 0) + ", 0, " + A(args, 1) + ")";
                    case "InsertRange": return recv + ".splice(" + A(args, 0) + ", 0, ..." + A(args, 1) + ")";
                    case "Remove": return Cs("listRemove") + "(" + recv + ", " + A(args, 0) + ")";
                    case "RemoveAt": return recv + ".splice(" + A(args, 0) + ", 1)";
                    case "RemoveRange": return recv + ".splice(" + A(args, 0) + ", " + A(args, 1) + ")";
                    case "RemoveAll": return Cs("removeAll") + "(" + recv + ", " + A(args, 0) + ")";
                    case "Clear": return recv + ".length = 0";
                    case "Contains": return "(" + recv + ".indexOf(" + A(args, 0) + ") >= 0)";
                    case "IndexOf": return recv + ".indexOf(" + A(args, 0) + ")";
                    case "LastIndexOf": return recv + ".lastIndexOf(" + A(args, 0) + ")";
                    case "Find": return "(" + recv + ".find(" + A(args, 0) + ") ?? null)";
                    case "FindLast": return Cs("findLast") + "(" + recv + ", " + A(args, 0) + ")";
                    case "FindIndex": return recv + ".findIndex(" + A(args, 0) + ")";
                    case "FindAll": return recv + ".filter(" + A(args, 0) + ")";
                    case "Exists": return recv + ".some(" + A(args, 0) + ")";
                    case "TrueForAll": return recv + ".every(" + A(args, 0) + ")";
                    case "ForEach": return recv + ".forEach(" + A(args, 0) + ")";
                    case "ConvertAll": return recv + ".map(" + A(args, 0) + ")";
                    case "Sort": return args.Count == 0 ? SortCall(recv, elem, null) : recv + ".sort(" + A(args, 0) + ")";
                    case "Reverse": return args.Count == 0 ? recv + ".reverse()" : null;
                    case "ToArray": return recv + ".slice()";
                    case "GetRange": return recv + ".slice(" + A(args, 0) + ", " + A(args, 0) + " + " + A(args, 1) + ")";
                    case "Capacity": return "0";
                    case "TrimExcess": return "undefined";
                }
                return null;
            }
            if (ct.Name is "Dictionary" or "IDictionary" or "IReadOnlyDictionary")
            {
                switch (name)
                {
                    case "Count": return recv + ".size";
                    case "Item": return recv + ".get(" + A(args, 0) + ")";
                    case "Add": return recv + ".set(" + A(args, 0) + ", " + A(args, 1) + ")";
                    case "TryAdd": return Cs("tryAdd") + "(" + recv + ", " + A(args, 0) + ", " + A(args, 1) + ")";
                    case "ContainsKey": return recv + ".has(" + A(args, 0) + ")";
                    case "ContainsValue": return Cs("containsValue") + "(" + recv + ", " + A(args, 0) + ")";
                    case "Remove": return recv + ".delete(" + A(args, 0) + ")";
                    case "Clear": return recv + ".clear()";
                    case "Keys": return "Array.from(" + recv + ".keys())";
                    case "Values": return "Array.from(" + recv + ".values())";
                    case "GetValueOrDefault": return Cs("getOr") + "(" + recv + ", " + A(args, 0) + ", " + (args.Count > 1 ? A(args, 1) : DefaultValue(sym.ContainingType.TypeArguments[1])) + ")";
                }
                return null;
            }
            if (ct.Name is "HashSet" or "ISet")
            {
                switch (name)
                {
                    case "Count": return recv + ".size";
                    case "Add": return Cs("setAdd") + "(" + recv + ", " + A(args, 0) + ")";
                    case "Contains": return recv + ".has(" + A(args, 0) + ")";
                    case "Remove": return recv + ".delete(" + A(args, 0) + ")";
                    case "Clear": return recv + ".clear()";
                    case "UnionWith": return Cs("unionWith") + "(" + recv + ", " + A(args, 0) + ")";
                    case "ToArray": return "Array.from(" + recv + ")";
                }
                return null;
            }
            if (ct.Name == "KeyValuePair")
            {
                if (name == "Key") return recv + "[0]";
                if (name == "Value") return recv + "[1]";
                return null;
            }
            if (ct.Name is "KeyCollection" or "ValueCollection")
            {
                if (name == "Count") return recv + ".length";
                return null;
            }
        }
        return null;
    }

    static string Paren0(string s) => s.All(c => char.IsLetterOrDigit(c) || c == '_' || c == '.' || c == '$') ? s : "(" + s + ")";

    bool IsArgArray(SyntaxNode node, int i) =>
        node is InvocationExpressionSyntax inv && i < inv.ArgumentList.Arguments.Count && IsArrayLike(_model.GetTypeInfo(inv.ArgumentList.Arguments[i].Expression).Type);

    string EnumName(ITypeSymbol enumType, string value)
    {
        if (enumType is INamedTypeSymbol et && !Sym.Has(et, "TsConstEnum")) return TypeRef(et) + "[" + value + "]";
        return "String(" + value + ")";
    }

    /// <summary>Sort like C#: numbers by value (JavaScript sorts as strings by default).</summary>
    string SortCall(string recv, ITypeSymbol elem, string cmp)
    {
        if (cmp != null) return recv + ".sort(" + cmp + ")";
        if (IsNumeric(elem) || elem?.TypeKind == TypeKind.Enum) return recv + ".sort((a, b) => a - b)";
        if (elem?.SpecialType == SpecialType.System_String) return recv + ".sort()";
        return recv + ".sort(" + Cs("compare") + ")";
    }

    string Linq(IMethodSymbol m, string recv, List<string> args, SyntaxNode node)
    {
        // extension call: recv is the source; static call: the first argument is
        var src = recv;
        var rest = args;
        if (m.ReducedFrom == null && m.IsStatic && args.Count > 0)
        {
            src = args[0];
            rest = args.Skip(1).ToList();
        }
        if (src == null) return null;
        var srcType = node is InvocationExpressionSyntax inv && inv.Expression is MemberAccessExpressionSyntax ma ? _model.GetTypeInfo(ma.Expression).Type : null;
        if (srcType != null && !IsArrayLike(srcType) && srcType is INamedTypeSymbol st && (IsDictionary(st) || IsHashSet(st))) src = "Array.from(" + src + ")";
        var elem = m.TypeArguments.Length > 0 ? m.TypeArguments[0] : null;
        string P(int i) => A(rest, i);
        switch (m.Name)
        {
            case "Select": return src + ".map(" + P(0) + ")";
            case "Where": return src + ".filter(" + P(0) + ")";
            case "Any": return rest.Count == 0 ? "(" + src + ".length > 0)" : src + ".some(" + P(0) + ")";
            case "All": return src + ".every(" + P(0) + ")";
            case "Count": return rest.Count == 0 ? src + ".length" : src + ".filter(" + P(0) + ").length";
            case "First": return Cs("first") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "FirstOrDefault": return Cs("firstOrDefault") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "Last": return Cs("last") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "LastOrDefault": return Cs("lastOrDefault") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "Contains": return "(" + src + ".indexOf(" + P(0) + ") >= 0)";
            case "Sum": return Cs("sum") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "Average": return Cs("average") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "Min": return Cs("min") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "Max": return Cs("max") + "(" + src + (rest.Count > 0 ? ", " + P(0) : "") + ")";
            case "OrderBy": return Cs("orderBy") + "(" + src + ", " + P(0) + ", false)";
            case "OrderByDescending": return Cs("orderBy") + "(" + src + ", " + P(0) + ", true)";
            case "ToList": case "ToArray": return src + ".slice()";
            case "Distinct": return "Array.from(new Set(" + src + "))";
            case "Take": return src + ".slice(0, " + P(0) + ")";
            case "Skip": return src + ".slice(" + P(0) + ")";
            case "Reverse": return src + ".slice().reverse()";
            case "Concat": return src + ".concat(" + P(0) + ")";
            case "ToDictionary": return Cs("toDictionary") + "(" + src + ", " + P(0) + (rest.Count > 1 ? ", " + P(1) : "") + ")";
            case "ToHashSet": return "new Set(" + src + ")";
            case "SelectMany": return Cs("selectMany") + "(" + src + ", " + P(0) + ")";
            case "GroupBy": return null;
        }
        return null;
    }
}
