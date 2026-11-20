using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace CsTranspiler;

public sealed partial class Emitter
{
    /// <summary>Receivers of `?.` member bindings, innermost last.</summary>
    readonly Stack<string> _binding = new();

    ISymbol SymbolOf(SyntaxNode n)
    {
        var info = _model.GetSymbolInfo(n);
        return info.Symbol ?? (info.CandidateSymbols.Length == 1 ? info.CandidateSymbols[0] : null);
    }

    /// <summary>The TypeScript of an expression. <paramref name="target"/> is the type it converts to, if known.</summary>
    public string Expr(ExpressionSyntax e, ITypeSymbol target = null)
    {
        switch (e)
        {
            case LiteralExpressionSyntax lit:
                return LiteralExpr(lit);
            case InterpolatedStringExpressionSyntax istr:
                return Interpolated(istr);
            case ParenthesizedExpressionSyntax p:
            {
                var inner = Expr(p.Expression, target);
                // (a ? b : c) is already parenthesized by the conditional
                return inner.StartsWith("(") && StripParens(inner) != inner ? inner : "(" + inner + ")";
            }
            case IdentifierNameSyntax or GenericNameSyntax:
                return NameExpr((SimpleNameSyntax)e);
            case MemberAccessExpressionSyntax ma:
                return MemberAccess(ma);
            case InvocationExpressionSyntax inv:
                return Invocation(inv);
            case ObjectCreationExpressionSyntax or ImplicitObjectCreationExpressionSyntax:
                return Creation((BaseObjectCreationExpressionSyntax)e);
            case ArrayCreationExpressionSyntax ac:
                return ArrayCreation(ac);
            case ImplicitArrayCreationExpressionSyntax iac:
                return "[" + string.Join(", ", iac.Initializer.Expressions.Select(x => Expr(x))) + "]";
            case InitializerExpressionSyntax init when init.IsKind(SyntaxKind.ArrayInitializerExpression):
                return "[" + string.Join(", ", init.Expressions.Select(x => Expr(x))) + "]";
            case CollectionExpressionSyntax ce:
                return CollectionExpr(ce);
            case AnonymousObjectCreationExpressionSyntax ao:
                return "{ " + string.Join(", ", ao.Initializers.Select(i => (i.NameEquals?.Name.Identifier.ValueText ?? (i.Expression as IdentifierNameSyntax)?.Identifier.ValueText ?? (i.Expression as MemberAccessExpressionSyntax)?.Name.Identifier.ValueText) + ": " + Expr(i.Expression))) + " }";
            case AssignmentExpressionSyntax asg:
                return Assignment(asg);
            case BinaryExpressionSyntax bin:
                return Binary(bin);
            case PrefixUnaryExpressionSyntax pre:
                return Prefix(pre);
            case PostfixUnaryExpressionSyntax post:
                return post.IsKind(SyntaxKind.SuppressNullableWarningExpression) ? Expr(post.Operand, target) : Expr(post.Operand) + post.OperatorToken.Text;
            case ConditionalExpressionSyntax c:
                return "(" + Cond(c.Condition) + " ? " + Expr(c.WhenTrue, target) + " : " + Expr(c.WhenFalse, target) + ")";
            case CastExpressionSyntax cast:
                return Cast(cast);
            case AnonymousFunctionExpressionSyntax lambda:
                return Lambda(lambda);
            case ElementAccessExpressionSyntax ea:
                return ElementAccess(ea);
            case ConditionalAccessExpressionSyntax ca:
                return ConditionalAccess(ca);
            case MemberBindingExpressionSyntax mb:
                return MemberBinding(mb);
            case ElementBindingExpressionSyntax eb:
                return (_binding.Count > 0 ? _binding.Peek() : "") + "." + "[" + string.Join(", ", eb.ArgumentList.Arguments.Select(a => Expr(a.Expression))) + "]";
            case ThisExpressionSyntax:
                return "this";
            case BaseExpressionSyntax:
                return "super";
            case TypeOfExpressionSyntax to:
                return TypeOfExpr(to.Type);
            case DefaultExpressionSyntax de:
                return DefaultValue(_model.GetTypeInfo(de.Type).Type);
            case AwaitExpressionSyntax aw:
                return "await " + Expr(aw.Expression);
            case IsPatternExpressionSyntax ip:
            {
                var subj = Subject(ip.Expression, out var init);
                return WithInit(init, "(" + Pattern(subj, ip.Pattern, _model.GetTypeInfo(ip.Expression).Type) + ")");
            }
            case SwitchExpressionSyntax se:
                return SwitchExpr(se);
            case ThrowExpressionSyntax te:
                return Runtime("__cs") + ".throw_(" + Expr(te.Expression) + ")";
            case CheckedExpressionSyntax ce2:
                return Expr(ce2.Expression, target);
            case PredefinedTypeSyntax pt:
                return TypeOfExpr(pt);
            case QualifiedNameSyntax qn:
                return SymbolOf(qn) is INamedTypeSymbol qt ? TypeRef(qt) ?? qn.ToString() : qn.Right.Identifier.ValueText;
            case TupleExpressionSyntax:
                return Unsupported(e, "A tuple");
            case RangeExpressionSyntax:
                return Unsupported(e, "A range");
            case QueryExpressionSyntax:
                return Unsupported(e, "LINQ query syntax (use method syntax: list.Where(x => ...))");
            case DeclarationExpressionSyntax:
                return Unsupported(e, "out var (outside TryGetValue/TryParse)");
            case RefExpressionSyntax:
                return Unsupported(e, "ref");
            default:
                return Unsupported(e, e.Kind().ToString());
        }
    }

    // ------------------------------------------------------------------ literals, strings
    string LiteralExpr(LiteralExpressionSyntax lit)
    {
        switch (lit.Kind())
        {
            case SyntaxKind.NumericLiteralExpression:
                return Num(lit.Token.Value);
            case SyntaxKind.StringLiteralExpression:
            case SyntaxKind.Utf8StringLiteralExpression:
                return Str(lit.Token.ValueText);
            case SyntaxKind.CharacterLiteralExpression:
                return Str(lit.Token.ValueText);
            case SyntaxKind.TrueLiteralExpression:
                return "true";
            case SyntaxKind.FalseLiteralExpression:
                return "false";
            case SyntaxKind.NullLiteralExpression:
                return "null";
            case SyntaxKind.DefaultLiteralExpression:
                return DefaultValue(_model.GetTypeInfo(lit).ConvertedType ?? _model.GetTypeInfo(lit).Type);
        }
        return lit.Token.Text;
    }

    string Interpolated(InterpolatedStringExpressionSyntax s)
    {
        var sb = new StringBuilder("`");
        foreach (var c in s.Contents)
        {
            if (c is InterpolatedStringTextSyntax t)
            {
                foreach (var ch in t.TextToken.ValueText)
                {
                    if (ch == '`' || ch == '\\') sb.Append('\\').Append(ch);
                    else if (ch == '$') sb.Append("\\$");
                    else if (ch == '\n') sb.Append("\\n");
                    else if (ch == '\r') sb.Append("\\r");
                    else sb.Append(ch);
                }
            }
            else if (c is InterpolationSyntax i)
            {
                var v = Expr(i.Expression);
                if (i.AlignmentClause != null) Warn(i, "CSX2020", "Interpolation alignment is ignored.");
                if (i.FormatClause != null) v = Format(v, i.FormatClause.FormatStringToken.ValueText, i);
                sb.Append("${").Append(v).Append('}');
            }
        }
        return sb.Append('`').ToString();
    }

    /// <summary>Number formats: F2 / N2 / 0.00 -> toFixed; D3 -> padStart.</summary>
    string Format(string value, string fmt, SyntaxNode node)
    {
        var m = System.Text.RegularExpressions.Regex.Match(fmt, "^[FfNn](\\d*)$");
        if (m.Success) return "(" + value + ").toFixed(" + (m.Groups[1].Value == "" ? "2" : m.Groups[1].Value) + ")";
        var m0 = System.Text.RegularExpressions.Regex.Match(fmt, "^0(?:\\.(0+))?$");
        if (m0.Success) return "(" + value + ").toFixed(" + m0.Groups[1].Value.Length + ")";
        var d = System.Text.RegularExpressions.Regex.Match(fmt, "^[Dd](\\d+)$");
        if (d.Success) return Runtime("__cs") + ".padLeft(String(" + value + "), " + d.Groups[1].Value + ", '0')";
        Warn(node, "CSX2021", $"The format \"{fmt}\" is not supported and is ignored.");
        return value;
    }

    string TypeOfExpr(TypeSyntax t)
    {
        var ts = _model.GetTypeInfo(t).Type;
        if (ts is INamedTypeSymbol nt)
        {
            switch (nt.SpecialType)
            {
                case SpecialType.System_String: return "String";
                case SpecialType.System_Boolean: return "Boolean";
                case SpecialType.System_Object: return "Object";
            }
            if (IsNumeric(nt)) return "Number";
            if (IsList(nt)) return "Array";
            if (IsDictionary(nt)) return "Map";
            if (IsHashSet(nt)) return "Set";
            var r = TypeRef(nt);
            if (r != null) return r;
        }
        if (ts is IArrayTypeSymbol) return "Array";
        return Unsupported(t, "typeof(" + t + ")");
    }

    // ------------------------------------------------------------------ names and members
    string NameExpr(SimpleNameSyntax id)
    {
        var name = id.Identifier.ValueText;
        if (name == "nameof" && id.Parent is InvocationExpressionSyntax) return Str(name);
        var sym = SymbolOf(id);
        switch (sym)
        {
            case null:
                return LocalName(name);
            case ILocalSymbol or IParameterSymbol or IRangeVariableSymbol:
                return LocalName(name);
            case INamedTypeSymbol t:
                return TypeRef(t) ?? name;
            case INamespaceSymbol:
                return "";
            case IMethodSymbol m when m.MethodKind == MethodKind.LocalFunction:
                return LocalName(m.Name);
            case IMethodSymbol m when !(id.Parent is InvocationExpressionSyntax inv && inv.Expression == id):
                return MethodGroup(m, null, id);
            default:
                return MemberRef(sym, null, id);
        }
    }

    /// <summary>A field/property/event/method reference: `this.x`, `Type.x`, a cc global, or `recv.x`.</summary>
    string MemberRef(ISymbol sym, string receiver, SyntaxNode node)
    {
        var ct = sym.ContainingType;
        if (sym.IsStatic || sym is IFieldSymbol { IsConst: true })
        {
            if (Sym.IsGlobals(ct))
            {
                var g = Sym.TsName(sym);
                _cc.Add(g);
                return g;
            }
            if (TsExport(sym) is string tsVar) return tsVar;
            if (ct?.TypeKind == TypeKind.Enum && sym is IFieldSymbol ef) return EnumMember(ct, ef);
            if (!Sym.IsBinding(sym) && !_ctx.IsUser(sym)) return Bcl(sym, receiver, null, node) ?? Unsupported(node, sym.ToDisplayString());
            if (sym is IFieldSymbol { IsConst: true } cf && Sym.IsBinding(cf) && ct != null && Sym.Has(ct, "TsStringEnum") && false) return Literal(cf.ConstantValue, cf.Type);
            var tr = ct != null ? TypeRef(ct) : null;
            return (tr ?? ct?.Name ?? "") + "." + MemberName(sym);
        }
        if (!Sym.IsBinding(sym) && !_ctx.IsUser(sym))
            return Bcl(sym, receiver ?? "this", null, node) ?? Unsupported(node, sym.ToDisplayString());
        return (receiver ?? "this") + "." + MemberName(sym);
    }

    /// <summary>A method used as a value: bound to its object (stable identity, so `off` finds it again).</summary>
    string MethodGroup(IMethodSymbol m, string receiver, SyntaxNode node)
    {
        if (m.IsStatic)
        {
            if (Sym.IsGlobals(m.ContainingType))
            {
                var g = Sym.TsName(m);
                _cc.Add(g);
                return g;
            }
            if (TsExport(m) is string tsFn) return tsFn;
            if (!Sym.IsBinding(m) && !_ctx.IsUser(m)) return Unsupported(node, "Using " + m.ToDisplayString() + " as a value");
            return (TypeRef(m.ContainingType) ?? m.ContainingType.Name) + "." + MethodName(m);
        }
        if (!Sym.IsBinding(m) && !_ctx.IsUser(m)) return Unsupported(node, "Using " + m.ToDisplayString() + " as a value");
        return Runtime("__cs") + ".bind(" + (receiver ?? "this") + ", " + Str(MethodName(m)) + ")";
    }

    string MemberAccess(MemberAccessExpressionSyntax ma)
    {
        var sym = SymbolOf(ma);
        switch (sym)
        {
            case INamespaceSymbol:
                return "";
            case INamedTypeSymbol t:
                return TypeRef(t) ?? ma.Name.Identifier.ValueText;
            case IMethodSymbol m when !(ma.Parent is InvocationExpressionSyntax inv && inv.Expression == ma):
                return MethodGroup(m, m.IsStatic ? null : Receiver(ma.Expression), ma);
            case null:
                return Receiver(ma.Expression) + "." + ma.Name.Identifier.ValueText;
        }
        if (sym.IsStatic || sym is IFieldSymbol { IsConst: true }) return MemberRef(sym, null, ma);
        var recv = Receiver(ma.Expression);
        if (!Sym.IsBinding(sym) && !_ctx.IsUser(sym)) return Bcl(sym, recv, null, ma, ma.Expression) ?? Unsupported(ma, sym.ToDisplayString());
        return recv + "." + MemberName(sym);
    }

    string Receiver(ExpressionSyntax e) => e is BaseExpressionSyntax ? "super" : Wrapped(e);

    /// <summary>An operand that is safe to put before `.x`.</summary>
    string Wrapped(ExpressionSyntax e)
    {
        var s = Expr(e);
        if (e is IdentifierNameSyntax or MemberAccessExpressionSyntax or InvocationExpressionSyntax or ElementAccessExpressionSyntax or ThisExpressionSyntax or ParenthesizedExpressionSyntax or LiteralExpressionSyntax { RawKind: (int)SyntaxKind.StringLiteralExpression } or GenericNameSyntax or ConditionalAccessExpressionSyntax)
            return s;
        if (e is LiteralExpressionSyntax { RawKind: (int)SyntaxKind.NumericLiteralExpression }) return "(" + s + ")";
        return s.StartsWith("(") && StripParens(s) != s ? s : "(" + s + ")";
    }

    string ConditionalAccess(ConditionalAccessExpressionSyntax ca)
    {
        _binding.Push(Wrapped(ca.Expression) + "?");
        var s = Expr(ca.WhenNotNull);
        _binding.Pop();
        return s;
    }

    string MemberBinding(MemberBindingExpressionSyntax mb)
    {
        var recv = _binding.Count > 0 ? _binding.Peek() : "";
        var sym = SymbolOf(mb);
        if (sym == null) return recv + "." + mb.Name.Identifier.ValueText;
        if (sym is IMethodSymbol m && !(mb.Parent is InvocationExpressionSyntax)) return MethodGroup(m, recv.TrimEnd('?'), mb);
        if (!Sym.IsBinding(sym) && !_ctx.IsUser(sym)) return Bcl(sym, recv, null, mb) ?? Unsupported(mb, sym.ToDisplayString());
        return recv + "." + MemberName(sym);
    }

    string ElementAccess(ElementAccessExpressionSyntax ea)
    {
        var t = _model.GetTypeInfo(ea.Expression).Type as INamedTypeSymbol;
        var recv = Receiver(ea.Expression);
        var args = ea.ArgumentList.Arguments;
        if (args.Count != 1) return Unsupported(ea, "A multi-dimensional index");
        if (args[0].Expression is PrefixUnaryExpressionSyntax pu && pu.IsKind(SyntaxKind.IndexExpression)) return Unsupported(ea, "An index from end (^)");
        if (t != null && (IsDictionary(t) || t.OriginalDefinition.Name is "IDictionary" or "IReadOnlyDictionary")) return recv + ".get(" + Expr(args[0].Expression) + ")";
        return recv + "[" + Expr(args[0].Expression) + "]";
    }

    // ------------------------------------------------------------------ invocation
    string Invocation(InvocationExpressionSyntax inv)
    {
        if (inv.Expression is IdentifierNameSyntax { Identifier.ValueText: "nameof" } && SymbolOf(inv) == null)
        {
            var arg = inv.ArgumentList.Arguments[0].Expression;
            var last = arg is MemberAccessExpressionSyntax mma ? mma.Name.Identifier.ValueText : arg.ToString();
            return Str(last);
        }
        var sym = SymbolOf(inv) as IMethodSymbol;
        if (sym == null)
        {
            // dynamic: the names are the same in TypeScript
            return Callee(inv.Expression) + "(" + string.Join(", ", inv.ArgumentList.Arguments.Select(a => Expr(a.Expression))) + ")";
        }
        // delegates: d(x), d.Invoke(x), d?.Invoke(x)
        if (sym.MethodKind == MethodKind.DelegateInvoke)
        {
            string callee;
            if (inv.Expression is MemberAccessExpressionSyntax dm && dm.Name.Identifier.ValueText == "Invoke") callee = Receiver(dm.Expression);
            else if (inv.Expression is MemberBindingExpressionSyntax db && db.Name.Identifier.ValueText == "Invoke") callee = _binding.Peek() + ".";
            else callee = Callee(inv.Expression);
            return callee + "(" + Args(inv.ArgumentList, sym, inv) + ")";
        }
        // local functions are consts in the enclosing body (see EmitLocalFunction): call them by
        // name, never as this.f() or Type.f() (static local functions included)
        if (sym.MethodKind == MethodKind.LocalFunction)
            return LocalName(sym.Name) + "(" + Args(inv.ArgumentList, sym, inv) + ")";
        // receiver
        string recv = null;
        ExpressionSyntax recvExpr = null;
        var isBase = false;
        switch (inv.Expression)
        {
            case MemberAccessExpressionSyntax ma:
                if (!sym.IsStatic || sym.IsExtensionMethod)
                {
                    recvExpr = ma.Expression;
                    isBase = ma.Expression is BaseExpressionSyntax;
                    recv = Receiver(ma.Expression);
                }
                break;
            case MemberBindingExpressionSyntax:
                recv = _binding.Peek();
                break;
            case SimpleNameSyntax:
                if (!sym.IsStatic) recv = "this";
                break;
        }
        var reduced = sym.ReducedFrom;
        if (!Sym.IsBinding(sym) && !_ctx.IsUser(sym))
        {
            if (sym.Parameters.Any(p => p.RefKind == RefKind.Out))
                return OutCall(sym, inv, recv) ?? Unsupported(inv, sym.ContainingType?.ToDisplayString() + "." + sym.Name + " with out parameters");
            var args = ArgList(inv.ArgumentList, sym, inv);
            var bcl = Bcl(sym, recv, args, inv, recvExpr) ?? Unsupported(inv, sym.ContainingType?.ToDisplayString() + "." + sym.Name + "()");
            if (bcl.Contains(SpreadMark))
            {
                // a .NET method with params that has no array-aware mapping: never emit spread syntax
                Error(inv, "CSX1034", "Passing an array to the params parameter of " + sym.ContainingType?.Name + "." + sym.Name + " is not supported: pass the items one by one.");
                bcl = bcl.Replace(SpreadMark, "");
            }
            return bcl;
        }
        if (reduced != null)
        {
            // a user extension method: Ext.method(receiver, args)
            var all = new List<string> { recv ?? "this" };
            all.AddRange(ArgList(inv.ArgumentList, sym, inv));
            return (TypeRef(reduced.ContainingType) ?? reduced.ContainingType.Name) + "." + MethodName(reduced) + "(" + string.Join(", ", TrimUndefined(all)) + ")";
        }
        var name = MethodName(sym);
        var argList = TrimUndefined(ArgList(inv.ArgumentList, sym, inv));
        // an array passed to a Cocos rest parameter (log(arr), node.emit(type, arr)...): .apply
        // instead of spread syntax, which Cocos' loose build turns into lossy concat/apply
        var spread = argList.Count > 0 && argList[^1].StartsWith(SpreadMark);
        var argStr = string.Join(", ", argList);
        if (sym.IsStatic)
        {
            string fn;
            if (Sym.IsGlobals(sym.ContainingType))
            {
                _cc.Add(name);
                fn = name;
                return spread ? fn + ".apply(null, " + ApplyArgs(argList) + ")" : fn + "(" + argStr + ")";
            }
            if (TsExport(sym) is string tsFn)
                return spread ? tsFn + ".apply(null, " + ApplyArgs(argList) + ")" : tsFn + "(" + argStr + ")";
            var owner = TypeRef(sym.ContainingType) ?? sym.ContainingType.Name;
            fn = owner + "." + name;
            return spread ? fn + ".apply(" + owner + ", " + ApplyArgs(argList) + ")" : fn + "(" + argStr + ")";
        }
        // super.start?.(): Cocos declares lifecycle methods as optional, they may not exist on the base
        if (isBase && Sym.IsBinding(sym) && !Sym.IsTs(sym))
            return spread ? "super." + name + "?.apply(this, " + ApplyArgs(argList) + ")" : "super." + name + "?.(" + argStr + ")";
        if (spread) return Cs("invoke") + "(" + recv + ", " + Str(name) + ", " + ApplyArgs(argList) + ")";
        return recv + "." + name + "(" + argStr + ")";
    }

    string Callee(ExpressionSyntax e) => e switch
    {
        MemberBindingExpressionSyntax mb => (_binding.Count > 0 ? _binding.Peek() : "") + "." + mb.Name.Identifier.ValueText,
        _ => Wrapped(e),
    };

    /// <summary>Marks an array passed to a Cocos rest parameter: Invocation turns it into .apply(...).</summary>
    const string SpreadMark = "\u0001";

    static string Unmark(string s) => s.StartsWith(SpreadMark) ? s.Substring(SpreadMark.Length) : s;

    string Args(ArgumentListSyntax list, IMethodSymbol m, SyntaxNode node)
    {
        var args = TrimUndefined(ArgList(list, m, node));
        if (args.Any(a => a.StartsWith(SpreadMark)))
        {
            // constructors, delegates...: no spread syntax in shipped code, so say so instead
            Error(node, "CSX1034", "Passing an array to the params parameter of " + (m?.Name ?? "this call") + " is not supported here: pass the items one by one.");
            args = args.Select(Unmark).ToList();
        }
        return string.Join(", ", args);
    }

    /// <summary>
    /// The arguments of a call whose last one is a marked array: [a, b].concat(array), or the
    /// array alone. concat takes the array's items as they are (one level), like C# params.
    /// </summary>
    static string ApplyArgs(List<string> args)
    {
        var arr = Unmark(args[^1]);
        if (args.Count == 1) return arr;
        return "[" + string.Join(", ", args.Take(args.Count - 1)) + "].concat(" + arr + ")";
    }

    static List<string> TrimUndefined(List<string> args)
    {
        while (args.Count > 0 && args[^1] == "undefined") args.RemoveAt(args.Count - 1);
        return args;
    }

    /// <summary>
    /// Arguments in parameter order (named arguments placed, skipped optional ones as undefined,
    /// params expanded) plus the constructor argument of [TsCtorArg] methods (getComponent&lt;T&gt;()).
    /// </summary>
    List<string> ArgList(ArgumentListSyntax list, IMethodSymbol m, SyntaxNode node)
    {
        var result = new List<string>();
        if (m == null)
        {
            if (list != null) result.AddRange(list.Arguments.Select(a => Expr(a.Expression)));
            return result;
        }
        var op = _model.GetOperation(node);
        var argOps = op switch
        {
            IInvocationOperation io => io.Arguments,
            IObjectCreationOperation oc => oc.Arguments,
            _ => default,
        };
        var parameters = (m.ReducedFrom != null ? m.ReducedFrom.Parameters.Skip(1) : m.Parameters).ToList();
        // a method declared in the user's C# (local functions included): its params parameter is a plain array
        var userCallee = _ctx.IsUser(m.ReducedFrom ?? m.OriginalDefinition);
        if (argOps.IsDefault)
        {
            if (list != null) result.AddRange(list.Arguments.Select(a => Expr(a.Expression)));
        }
        else
        {
            var byParam = new Dictionary<IParameterSymbol, IArgumentOperation>(SymbolEqualityComparer.Default);
            foreach (var a in argOps) if (a.Parameter != null) byParam[a.Parameter.OriginalDefinition] = a;
            foreach (var p in parameters)
            {
                if (!byParam.TryGetValue(p.OriginalDefinition, out var a))
                {
                    // extension receiver of a reduced method is not an argument here
                    if (m.ReducedFrom != null && p.Ordinal == 0) continue;
                    result.Add("undefined");
                    continue;
                }
                if (a.ArgumentKind == ArgumentKind.DefaultValue)
                {
                    result.Add("undefined");
                    continue;
                }
                if (a.ArgumentKind == ArgumentKind.ParamArray)
                {
                    // f(1, 2, 3): our own params methods take one array (no rest/spread in shipped
                    // code); Cocos' rest parameters get the items one by one
                    var els = new List<string>();
                    if (a.Value is IArrayCreationOperation ac && ac.Initializer != null)
                        foreach (var el in ac.Initializer.ElementValues) els.Add(ExprOp(el));
                    if (userCallee) result.Add("[" + string.Join(", ", els) + "]");
                    else result.AddRange(els);
                    continue;
                }
                if (a.Syntax is ArgumentSyntax asx)
                {
                    if (asx.RefKindKeyword != default && !asx.RefKindKeyword.IsKind(SyntaxKind.None))
                    {
                        Error(asx, "CSX1030", "ref/out arguments are not supported (except Dictionary.TryGetValue and int/float.TryParse).");
                        result.Add("undefined");
                        continue;
                    }
                    var s = StringEnumValue(p, asx.Expression, Expr(asx.Expression, p.Type));
                    // f(array) on a params parameter: our methods take the array as is; for a Cocos
                    // rest parameter the caller turns this mark into .apply(...) (never spread syntax)
                    if (p.IsParams && a.ArgumentKind == ArgumentKind.Explicit && !userCallee) s = SpreadMark + s;
                    result.Add(s);
                }
                else result.Add(ExprOp(a.Value));
            }
        }
        // getComponent<T>() -> getComponent(T)
        var ctorArg = Sym.Attr(m.OriginalDefinition, "TsCtorArg") ?? Sym.Attr(m, "TsCtorArg");
        if (ctorArg != null && ctorArg.ConstructorArguments.Length == 2)
        {
            var pi = (int)ctorArg.ConstructorArguments[0].Value;
            var ti = (int)ctorArg.ConstructorArguments[1].Value;
            var ta = ti < m.TypeArguments.Length ? m.TypeArguments[ti] : null;
            var ctor = ta is INamedTypeSymbol nt ? TypeRef(nt) : null;
            if (ctor == null) Error(node, "CSX1031", "The type argument must be a class: " + ta?.ToDisplayString());
            result.Insert(Math.Min(pi, result.Count), ctor ?? "undefined");
        }
        return result;
    }

    /// <summary>
    /// A string going into a TypeScript string-enum slot (TS interop marks those parameters and
    /// properties [TsStringEnum]): members of the enum pass as they are, other strings are cast.
    /// </summary>
    string StringEnumValue(ISymbol target, ExpressionSyntax e, string s)
    {
        if (target == null || !Sym.Has(target.OriginalDefinition, "TsStringEnum")) return s;
        if (SymbolOf(e) is IFieldSymbol { IsConst: true } f && f.ContainingType != null && Sym.Has(f.ContainingType, "TsStringEnum")) return s;
        if (e is LiteralExpressionSyntax { RawKind: (int)SyntaxKind.NullLiteralExpression } or LiteralExpressionSyntax { RawKind: (int)SyntaxKind.DefaultLiteralExpression }) return s;
        return "(" + StripParens(s) + " as any)";
    }

    string ExprOp(IOperation o)
    {
        while (o is IConversionOperation conv && conv.IsImplicit) o = conv.Operand;
        if (o.Syntax is ExpressionSyntax es) return Expr(es);
        if (o.Syntax is ArgumentSyntax a) return Expr(a.Expression);
        return "undefined";
    }

    // ------------------------------------------------------------------ creation
    string Creation(BaseObjectCreationExpressionSyntax oc)
    {
        var type = _model.GetTypeInfo(oc).Type as INamedTypeSymbol;
        var ctor = SymbolOf(oc) as IMethodSymbol;
        if (type == null) return Unsupported(oc, "This object creation");
        var init = oc.Initializer;
        if (IsList(type))
        {
            if (init != null) return "[" + string.Join(", ", init.Expressions.Select(x => Expr(x, type.TypeArguments[0]))) + "]";
            var a = oc.ArgumentList?.Arguments.FirstOrDefault();
            if (a != null && !IsNumeric(_model.GetTypeInfo(a.Expression).Type)) return "Array.from(" + Expr(a.Expression) + ")";
            return "[]";
        }
        if (IsDictionary(type))
        {
            var entries = new List<string>();
            if (init != null)
            {
                foreach (var x in init.Expressions)
                {
                    if (x is InitializerExpressionSyntax kv && kv.Expressions.Count == 2) entries.Add("[" + Expr(kv.Expressions[0]) + ", " + Expr(kv.Expressions[1]) + "]");
                    else if (x is AssignmentExpressionSyntax { Left: ImplicitElementAccessSyntax iea } ax) entries.Add("[" + Expr(iea.ArgumentList.Arguments[0].Expression) + ", " + Expr(ax.Right) + "]");
                    else Error(x, "CSX1032", "This dictionary initializer is not supported.");
                }
                return "new Map<" + TsType(type.TypeArguments[0]) + ", " + TsType(type.TypeArguments[1]) + ">([" + string.Join(", ", entries) + "])";
            }
            var a = oc.ArgumentList?.Arguments.FirstOrDefault();
            if (a != null && _model.GetTypeInfo(a.Expression).Type is INamedTypeSymbol src && IsDictionary(src)) return "new Map(" + Expr(a.Expression) + ")";
            return "new Map<" + TsType(type.TypeArguments[0]) + ", " + TsType(type.TypeArguments[1]) + ">()";
        }
        if (IsHashSet(type))
        {
            if (init != null) return "new Set<" + TsType(type.TypeArguments[0]) + ">([" + string.Join(", ", init.Expressions.Select(x => Expr(x))) + "])";
            var a = oc.ArgumentList?.Arguments.FirstOrDefault();
            return a != null ? "new Set(" + Expr(a.Expression) + ")" : "new Set<" + TsType(type.TypeArguments[0]) + ">()";
        }
        if (type.TypeKind == TypeKind.Delegate)
        {
            var a = oc.ArgumentList?.Arguments.FirstOrDefault();
            return a != null ? Expr(a.Expression, type) : Unsupported(oc, "This delegate creation");
        }
        var ns = type.ContainingNamespace?.ToDisplayString();
        if (ns == "System" && type.Name.EndsWith("Exception"))
            return "new Error(" + (oc.ArgumentList?.Arguments.Count > 0 ? Expr(oc.ArgumentList.Arguments[0].Expression) : "") + ")";
        if (ns == "System.Text" && type.Name == "StringBuilder") return Unsupported(oc, "StringBuilder (use string concatenation or an array join)");
        // TaskCompletionSource<T>: a deferred promise
        if (ns == "System.Threading.Tasks" && type.Name == "TaskCompletionSource") return Runtime("__cs") + ".tcs<" + (type.TypeArguments.Length > 0 ? TsType(type.TypeArguments[0]) : "void") + ">()";
        if (!Sym.IsBinding(type) && !_ctx.IsUser(type)) return Unsupported(oc, "new " + type.ToDisplayString() + "()");
        var head = "new " + (TypeRef(type) ?? type.Name) + (type.TypeArguments.Length > 0 && _ctx.IsUser(type) ? "<" + string.Join(", ", type.TypeArguments.Select(t => TsType(t))) + ">" : "") +
                   "(" + Args(oc.ArgumentList, ctor, oc) + ")";
        if (init == null) return head;
        if (init.IsKind(SyntaxKind.ObjectInitializerExpression))
        {
            var props = new List<string>();
            foreach (var x in init.Expressions)
            {
                if (x is AssignmentExpressionSyntax { Left: IdentifierNameSyntax idn } a)
                {
                    var ms = SymbolOf(idn);
                    if (a.Right is InitializerExpressionSyntax) Error(a, "CSX1033", "Nested object/collection initializers are not supported.");
                    props.Add((ms != null ? MemberName(ms) : idn.Identifier.ValueText) + ": " + Expr(a.Right, (ms as IPropertySymbol)?.Type ?? (ms as IFieldSymbol)?.Type));
                }
                else Error(x, "CSX1033", "This object initializer is not supported.");
            }
            return "Object.assign(" + head + ", { " + string.Join(", ", props) + " })";
        }
        return Unsupported(oc, "A collection initializer on " + type.Name);
    }

    string ArrayCreation(ArrayCreationExpressionSyntax ac)
    {
        if (ac.Type.RankSpecifiers.Count > 1 || ac.Type.RankSpecifiers[0].Rank > 1) return Unsupported(ac, "A multi-dimensional array");
        if (ac.Initializer != null) return "[" + string.Join(", ", ac.Initializer.Expressions.Select(x => Expr(x))) + "]";
        var size = ac.Type.RankSpecifiers[0].Sizes.FirstOrDefault();
        var el = (_model.GetTypeInfo(ac).Type as IArrayTypeSymbol)?.ElementType;
        if (size == null || size is OmittedArraySizeExpressionSyntax) return "[]";
        return "new Array<" + TsType(el) + ">(" + Expr(size) + ").fill(" + (el != null ? DefaultValue(el) : "null") + ")";
    }

    string CollectionExpr(CollectionExpressionSyntax ce)
    {
        // [a, ..xs, b] -> [a].concat(xs, [b]) with no spread syntax: Cocos' loose build turns
        // spread into concat, which keeps a Set or Map as ONE element. Non-array sources
        // (HashSet, Dictionary, IEnumerable) go through Array.from first.
        var parts = new List<string>();
        var run = new List<string>();
        var hasSpread = false;
        foreach (var el in ce.Elements)
        {
            switch (el)
            {
                case ExpressionElementSyntax ee:
                    run.Add(Expr(ee.Expression));
                    break;
                case SpreadElementSyntax se:
                    hasSpread = true;
                    if (run.Count > 0) parts.Add("[" + string.Join(", ", run) + "]");
                    run.Clear();
                    var st = _model.GetTypeInfo(se.Expression).Type;
                    var src = Expr(se.Expression);
                    // only T[] and List<T> are surely JS arrays; an IEnumerable may hold a Set
                    var plainArray = st is IArrayTypeSymbol || (st is INamedTypeSymbol nl && IsList(nl));
                    parts.Add(plainArray ? src : "Array.from(" + src + ")");
                    break;
                default:
                    run.Add(Unsupported(el, "This collection element"));
                    break;
            }
        }
        var converted = _model.GetTypeInfo(ce).ConvertedType;
        string arr;
        if (!hasSpread) arr = "[" + string.Join(", ", run) + "]";
        else
        {
            if (run.Count > 0) parts.Add("[" + string.Join(", ", run) + "]");
            // a typed empty array, so TypeScript accepts the concat (an untyped [] is never[])
            var elem = converted is IArrayTypeSymbol cat ? cat.ElementType
                : converted is INamedTypeSymbol cnt && cnt.TypeArguments.Length == 1 ? cnt.TypeArguments[0] : null;
            arr = "([] as (" + (elem != null ? TsType(elem) : "any") + ")[]).concat(" + string.Join(", ", parts) + ")";
        }
        var t = converted as INamedTypeSymbol;
        if (t != null && IsHashSet(t)) return "new Set(" + arr + ")";
        if (t != null && IsDictionary(t)) return Unsupported(ce, "A collection expression for a Dictionary");
        return arr;
    }

    // ------------------------------------------------------------------ operators
    string Assignment(AssignmentExpressionSyntax a)
    {
        // `_ = Task();` discards the value
        if (a.Left is IdentifierNameSyntax { Identifier.ValueText: "_" } && SymbolOf(a.Left) is IDiscardSymbol or null && a.IsKind(SyntaxKind.SimpleAssignmentExpression))
            return Expr(a.Right);
        var lt = _model.GetTypeInfo(a.Left).Type;
        // dictionary[key] = value -> dictionary.set(key, value)
        if (a.Left is ElementAccessExpressionSyntax ea && _model.GetTypeInfo(ea.Expression).Type is INamedTypeSymbol dt && (IsDictionary(dt) || dt.OriginalDefinition.Name == "IDictionary"))
        {
            var d = Receiver(ea.Expression);
            var k = Expr(ea.ArgumentList.Arguments[0].Expression);
            if (a.IsKind(SyntaxKind.SimpleAssignmentExpression)) return d + ".set(" + k + ", " + Expr(a.Right, lt) + ")";
            var op = a.OperatorToken.Text.TrimEnd('=');
            if (!IsSimple(ea.Expression) || !IsSimple(ea.ArgumentList.Arguments[0].Expression)) Warn(a, "CSX2030", "The dictionary and key are evaluated twice here.");
            return d + ".set(" + k + ", " + d + ".get(" + k + ") " + op + " " + Paren(a.Right) + ")";
        }
        // pos += v * dt on vectors -> pos = Vec3.add(new Vec3(), pos, ...)
        if (!a.IsKind(SyntaxKind.SimpleAssignmentExpression) && SymbolOf(a) is IMethodSymbol { MethodKind: MethodKind.UserDefinedOperator } vop && Sym.IsBinding(vop))
        {
            if (!IsSimple(a.Left)) Warn(a, "CSX2030", "The target of this compound assignment is evaluated twice.");
            return Expr(a.Left) + " = " + VectorOperator(vop, a.Left, a.Right, a);
        }
        var left = Expr(a.Left);
        var right = Expr(a.Right, lt);
        if (a.IsKind(SyntaxKind.SimpleAssignmentExpression)) right = StringEnumValue(SymbolOf(a.Left) as IPropertySymbol, a.Right, right);
        // events and delegates: += / -= combine like C# multicast delegates
        if (lt?.TypeKind == TypeKind.Delegate && (a.IsKind(SyntaxKind.AddAssignmentExpression) || a.IsKind(SyntaxKind.SubtractAssignmentExpression)))
            return left + " = " + Runtime("__cs") + (a.IsKind(SyntaxKind.AddAssignmentExpression) ? ".combine(" : ".remove(") + left + ", " + right + ")";
        if (a.IsKind(SyntaxKind.DivideAssignmentExpression) && IsIntegral(lt) && IsIntegral(_model.GetTypeInfo(a.Right).Type))
            return left + " = Math.trunc(" + left + " / " + Paren(a.Right) + ")";
        return left + " " + a.OperatorToken.Text + " " + right;
    }

    string Paren(ExpressionSyntax e)
    {
        var s = Expr(e);
        return e is BinaryExpressionSyntax or ConditionalExpressionSyntax or AssignmentExpressionSyntax or AnonymousFunctionExpressionSyntax ? "(" + s + ")" : s;
    }

    static bool IsSimple(ExpressionSyntax e) => e is IdentifierNameSyntax or ThisExpressionSyntax or LiteralExpressionSyntax ||
                                                (e is MemberAccessExpressionSyntax m && IsSimple(m.Expression));

    string Binary(BinaryExpressionSyntax b)
    {
        var k = b.Kind();
        if (k == SyntaxKind.AsExpression) return AsExpr(b.Left, _model.GetTypeInfo(b.Right).Type, b);
        if (k == SyntaxKind.IsExpression) return "(" + TypeTest(Expr(b.Left), _model.GetTypeInfo(b.Right).Type, b) + ")";
        var lt = _model.GetTypeInfo(b.Left).Type;
        var rt = _model.GetTypeInfo(b.Right).Type;
        if (SymbolOf(b) is IMethodSymbol { MethodKind: MethodKind.UserDefinedOperator } op && Sym.IsBinding(op))
            return VectorOperator(op, b.Left, b.Right, b);
        var l = Operand(b.Left, k);
        var r = Operand(b.Right, k);
        switch (k)
        {
            case SyntaxKind.DivideExpression when IsIntegral(lt) && IsIntegral(rt):
                return "Math.trunc(" + l + " / " + r + ")";
            case SyntaxKind.EqualsExpression:
            case SyntaxKind.NotEqualsExpression:
            {
                var neg = k == SyntaxKind.NotEqualsExpression;
                if (b.Right.IsKind(SyntaxKind.NullLiteralExpression) || b.Left.IsKind(SyntaxKind.NullLiteralExpression)) return l + (neg ? " != " : " == ") + r;
                return l + (neg ? " !== " : " === ") + r;
            }
            case SyntaxKind.BitwiseAndExpression or SyntaxKind.BitwiseOrExpression or SyntaxKind.ExclusiveOrExpression when lt?.SpecialType == SpecialType.System_Boolean:
                return "!!(+" + l + " " + b.OperatorToken.Text + " +" + r + ")";
        }
        if (k == SyntaxKind.AddExpression && (lt?.SpecialType == SpecialType.System_Char && IsNumeric(rt) || rt?.SpecialType == SpecialType.System_Char && IsNumeric(lt)))
            Warn(b, "CSX2031", "char arithmetic: chars are strings in TypeScript; use (int)c / (char)n explicitly.");
        return l + " " + b.OperatorToken.Text + " " + r;
    }

    /// <summary>Vec2/Vec3/Vec4/Quat operators (declared in Lang.cs) as Cocos static calls into a new value.</summary>
    string VectorOperator(IMethodSymbol op, ExpressionSyntax left, ExpressionSyntax right, SyntaxNode node)
    {
        var t = (INamedTypeSymbol)op.ReturnType;
        var tr = TypeRef(t);
        var fresh = "new " + tr + "()";
        string Arg(ExpressionSyntax e) => StripParens(Expr(e));
        switch (op.Name)
        {
            case "op_Addition":
                return tr + ".add(" + fresh + ", " + Arg(left) + ", " + Arg(right) + ")";
            case "op_Subtraction":
                return tr + ".subtract(" + fresh + ", " + Arg(left) + ", " + Arg(right) + ")";
            case "op_UnaryNegation":
                return tr + ".negate(" + fresh + ", " + Arg(left) + ")";
            case "op_Multiply" when t.Name == "Quat":
                return tr + ".multiply(" + fresh + ", " + Arg(left) + ", " + Arg(right) + ")";
            case "op_Multiply":
            {
                var leftIsScalar = IsNumeric(op.Parameters[0].Type);
                var v = leftIsScalar ? right : left;
                var s = leftIsScalar ? left : right;
                return tr + ".multiplyScalar(" + fresh + ", " + Arg(v) + ", " + Arg(s) + ")";
            }
            case "op_Division":
                return tr + ".multiplyScalar(" + fresh + ", " + Arg(left) + ", 1 / " + Paren(right) + ")";
        }
        return Unsupported(node, "The operator " + op.Name);
    }

    /// <summary>Operands keep C#'s grouping: nested binary operators of another kind get parentheses.</summary>
    string Operand(ExpressionSyntax e, SyntaxKind parent)
    {
        var s = Expr(e);
        if (e is BinaryExpressionSyntax inner && inner.Kind() != parent && !s.StartsWith("Math.trunc(")) return "(" + s + ")";
        if (e is ConditionalExpressionSyntax || e is AssignmentExpressionSyntax || e is AnonymousFunctionExpressionSyntax) return s.StartsWith("(") ? s : "(" + s + ")";
        return s;
    }

    string Prefix(PrefixUnaryExpressionSyntax p)
    {
        switch (p.Kind())
        {
            case SyntaxKind.LogicalNotExpression:
                return "!" + Wrapped(p.Operand);
            case SyntaxKind.UnaryMinusExpression when SymbolOf(p) is IMethodSymbol { MethodKind: MethodKind.UserDefinedOperator } neg && Sym.IsBinding(neg):
                return VectorOperator(neg, p.Operand, null, p);
            case SyntaxKind.UnaryMinusExpression:
            case SyntaxKind.UnaryPlusExpression:
            case SyntaxKind.BitwiseNotExpression:
            case SyntaxKind.PreIncrementExpression:
            case SyntaxKind.PreDecrementExpression:
            {
                var s = Expr(p.Operand);
                if (p.Operand is BinaryExpressionSyntax or ConditionalExpressionSyntax) s = "(" + s + ")";
                // - -x must not become --x
                return p.OperatorToken.Text + (s.StartsWith(p.OperatorToken.Text) ? " " : "") + s;
            }
            case SyntaxKind.IndexExpression:
                return Unsupported(p, "An index from end (^)");
        }
        return Unsupported(p, p.OperatorToken.Text);
    }

    string Cast(CastExpressionSyntax c)
    {
        var to = _model.GetTypeInfo(c.Type).Type;
        var from = _model.GetTypeInfo(c.Expression).Type;
        var s = Expr(c.Expression);
        if (to == null) return s;
        if (to.SpecialType == SpecialType.System_Char && IsNumeric(from) && from?.SpecialType != SpecialType.System_Char) return "String.fromCharCode(" + s + ")";
        if (IsIntegral(to) && to.TypeKind != TypeKind.Enum && from?.SpecialType == SpecialType.System_Char) return "(" + s + ").charCodeAt(0)";
        if (IsIntegral(to) && to.TypeKind != TypeKind.Enum && from != null && (from.SpecialType is SpecialType.System_Single or SpecialType.System_Double or SpecialType.System_Decimal || from.TypeKind == TypeKind.Dynamic))
            return "Math.trunc(" + StripParens(s) + ")";
        if (IsNumeric(to) || to.TypeKind == TypeKind.Enum || to.SpecialType == SpecialType.System_Object || to.SpecialType == SpecialType.System_String || to.SpecialType == SpecialType.System_Boolean)
            return s;
        if (to.TypeKind == TypeKind.Dynamic) return s;
        var ts = TsType(to);
        return "(" + (c.Expression is BinaryExpressionSyntax or ConditionalExpressionSyntax ? "(" + s + ")" : s) + " as " + ts + ")";
    }

    string AsExpr(ExpressionSyntax e, ITypeSymbol t, SyntaxNode node)
    {
        var subject = Subject(e, out var init);
        return WithInit(init, "(" + TypeTest(subject, t, node) + " ? " + subject + " as " + TsType(t) + " : null)");
    }

    /// <summary>
    /// An expression that can be read several times: simple ones as they are, others through a
    /// temporary assigned once (<paramref name="init"/>, to put first in the emitted expression).
    /// </summary>
    string Subject(ExpressionSyntax e, out string init)
    {
        init = null;
        if (IsSimple(e)) return Expr(e);
        var t = Temp(e);
        init = t + " = " + Expr(e);
        return t;
    }

    static string WithInit(string init, string expr) => init == null ? expr : "(" + init + ", " + expr + ")";

    /// <summary>`x is T` in JavaScript: typeof for primitives, instanceof for classes.</summary>
    string TypeTest(string subject, ITypeSymbol t, SyntaxNode node)
    {
        var plain = subject;
        if (t == null) return "false";
        switch (t.SpecialType)
        {
            case SpecialType.System_String:
            case SpecialType.System_Char:
                return "typeof " + plain + " === 'string'";
            case SpecialType.System_Boolean:
                return "typeof " + plain + " === 'boolean'";
            case SpecialType.System_Object:
                return plain + " != null";
        }
        if (IsNumeric(t)) return "typeof " + plain + " === 'number'";
        if (IsArrayLike(t)) return "Array.isArray(" + plain + ")";
        if (t is INamedTypeSymbol n)
        {
            if (IsDictionary(n)) return plain + " instanceof Map";
            if (IsHashSet(n)) return plain + " instanceof Set";
            if (n.TypeKind == TypeKind.Delegate) return "typeof " + plain + " === 'function'";
            if (n.TypeKind == TypeKind.Interface)
            {
                Error(node, "CSX1040", $"`is {n.Name}`: interfaces don't exist at runtime in TypeScript; test a class instead.");
                return "false";
            }
            if (n.ContainingNamespace?.ToDisplayString() == "System" && n.Name.EndsWith("Exception")) return plain + " instanceof Error";
            if (n.TypeKind == TypeKind.Enum) return "typeof " + plain + " === 'number'";
            var r = TypeRef(n);
            if (r != null && !Sym.Has(n, "TsAny")) return plain + " instanceof " + r;
        }
        Error(node, "CSX1041", "A type test against " + t.ToDisplayString() + " is not supported.");
        return "false";
    }

    /// <summary>A pattern as a condition on <paramref name="subject"/> (declared variables are hoisted).</summary>
    string Pattern(string subject, PatternSyntax p, ITypeSymbol subjectType)
    {
        switch (p)
        {
            case ConstantPatternSyntax c:
                if (c.Expression.IsKind(SyntaxKind.NullLiteralExpression)) return subject + " == null";
                return subject + " === " + Expr(c.Expression);
            case DiscardPatternSyntax:
                return "true";
            case TypePatternSyntax tp:
                return TypeTest(subject, _model.GetTypeInfo(tp.Type).Type, tp);
            case DeclarationPatternSyntax dp:
            {
                var t = _model.GetTypeInfo(dp.Type).Type;
                var test = TypeTest(subject, t, dp);
                if (dp.Designation is SingleVariableDesignationSyntax sv)
                {
                    var name = Hoist(LocalName(sv.Identifier.ValueText), t, dp);
                    return "(" + test + " && ((" + name + " = " + subject + "), true))";
                }
                return test;
            }
            case VarPatternSyntax vp:
                if (vp.Designation is SingleVariableDesignationSyntax vs)
                {
                    var name = Hoist(LocalName(vs.Identifier.ValueText), subjectType, vp);
                    return "((" + name + " = " + subject + "), true)";
                }
                return "true";
            case RelationalPatternSyntax rp:
                return subject + " " + rp.OperatorToken.Text + " " + Expr(rp.Expression);
            case BinaryPatternSyntax bp:
                return "(" + Pattern(subject, bp.Left, subjectType) + (bp.IsKind(SyntaxKind.AndPattern) ? " && " : " || ") + Pattern(subject, bp.Right, subjectType) + ")";
            case UnaryPatternSyntax up:
                return "!(" + Pattern(subject, up.Pattern, subjectType) + ")";
            case ParenthesizedPatternSyntax pp:
                return "(" + Pattern(subject, pp.Pattern, subjectType) + ")";
            case RecursivePatternSyntax rec:
            {
                var parts = new List<string>();
                var t = rec.Type != null ? _model.GetTypeInfo(rec.Type).Type : subjectType;
                parts.Add(rec.Type != null ? TypeTest(subject, t, rec) : subject + " != null");
                if (rec.PositionalPatternClause != null) Error(rec, "CSX1042", "Positional patterns are not supported.");
                if (rec.PropertyPatternClause != null)
                    foreach (var sp in rec.PropertyPatternClause.Subpatterns)
                    {
                        var member = sp.NameColon?.Name.Identifier.ValueText ?? sp.ExpressionColon?.Expression.ToString();
                        var ms = sp.NameColon != null ? SymbolOf(sp.NameColon.Name) : null;
                        var sub = "(" + subject + " as any)." + (ms != null ? MemberName(ms) : member);
                        parts.Add(Pattern(sub, sp.Pattern, (ms as IPropertySymbol)?.Type ?? (ms as IFieldSymbol)?.Type));
                    }
                if (rec.Designation is SingleVariableDesignationSyntax rs)
                {
                    var name = Hoist(LocalName(rs.Identifier.ValueText), t, rec);
                    parts.Add("((" + name + " = " + subject + "), true)");
                }
                return "(" + string.Join(" && ", parts) + ")";
            }
            case ListPatternSyntax:
                Error(p, "CSX1043", "List patterns are not supported.");
                return "false";
        }
        Error(p, "CSX1044", "This pattern is not supported.");
        return "false";
    }

    string SwitchExpr(SwitchExpressionSyntax se)
    {
        var subjectType = _model.GetTypeInfo(se.GoverningExpression).Type;
        var subject = Subject(se.GoverningExpression, out var init);
        return WithInit(init, BuildSwitchArms(subject, se, subjectType));
    }

    string BuildSwitchArms(string subject, SwitchExpressionSyntax se, ITypeSymbol subjectType)
    {
        var target = _model.GetTypeInfo(se).ConvertedType;
        var sb = new StringBuilder("(");
        var closes = 0;
        var hasDefault = false;
        foreach (var arm in se.Arms)
        {
            var cond = Pattern(subject, arm.Pattern, subjectType);
            if (arm.WhenClause != null) cond = "(" + cond + ") && (" + Expr(arm.WhenClause.Condition) + ")";
            var value = Expr(arm.Expression, target);
            if (cond == "true")
            {
                sb.Append(value);
                hasDefault = true;
                break;
            }
            sb.Append(cond).Append(" ? ").Append(value).Append(" : (");
            closes++;
        }
        if (!hasDefault) sb.Append(Runtime("__cs") + ".throw_(new Error('No switch arm matched'))");
        sb.Append(new string(')', closes)).Append(')');
        return sb.ToString();
    }

    // ------------------------------------------------------------------ lambdas
    string Lambda(AnonymousFunctionExpressionSyntax lambda)
    {
        var ms = _model.GetSymbolInfo(lambda).Symbol as IMethodSymbol;
        var ps = ms != null ? string.Join(", ", ms.Parameters.Select(p => LocalName(p.Name) + ": " + TsType(p.Type))) : "";
        var head = (lambda.AsyncKeyword != default && !lambda.AsyncKeyword.IsKind(SyntaxKind.None) ? "async " : "") + "(" + ps + ") => ";
        if (lambda.ExpressionBody != null)
        {
            var saved = _hoist;
            _hoist = new List<string>();
            var body = Expr(lambda.ExpressionBody, ms?.ReturnType);
            var hoists = _hoist;
            _hoist = saved;
            if (hoists.Count == 0) return head + (body.StartsWith("{") ? "(" + body + ")" : body);
            return head + Block(() =>
            {
                foreach (var h in hoists) _w.Line(h);
                _w.Line((ms != null && ms.ReturnsVoid ? "" : "return ") + body + ";");
            });
        }
        if (lambda.Block != null) return head + Block(() => EmitBlockContents(lambda.Block, braces: false));
        return head + "{}";
    }

    /// <summary>Renders statements as a block inside an expression (lambda bodies).</summary>
    string Block(Action body)
    {
        var saved = _w;
        var savedHoist = _hoist;
        _w = new TsWriter { Indent = saved.Indent + 1 };
        _hoist = null;
        body();
        var inner = _w.ToString();
        _w = saved;
        _hoist = savedHoist;
        return "{\n" + inner + new string(' ', saved.Indent * 4) + "}";
    }
}
