using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CsTranspiler;

public sealed partial class Emitter
{
    /// <summary>
    /// Declarations an expression needs before its statement: pattern variables (`x is Node n`),
    /// `out var` of TryGetValue, temporaries. Null outside a statement.
    /// </summary>
    List<string> _hoist;

    /// <summary>Writes a statement line, preceded by what its expressions hoisted.</summary>
    void WithHoists(Func<string> line)
    {
        var saved = _hoist;
        _hoist = new List<string>();
        var s = line();
        foreach (var h in _hoist) _w.Line(h);
        _w.Line(s);
        _hoist = saved;
    }

    /// <summary>Computes a header (if/while/for...) and writes its hoisted declarations first.</summary>
    string Header(Func<string> header)
    {
        var saved = _hoist;
        _hoist = new List<string>();
        var s = header();
        foreach (var h in _hoist) _w.Line(h);
        _hoist = saved;
        return s;
    }

    string Hoist(string name, ITypeSymbol type, SyntaxNode node)
    {
        if (_hoist == null)
        {
            Error(node, "CSX1020", "This expression declares a variable where none can be declared (field initializer?).");
            return name;
        }
        var decl = "let " + name + (type != null ? ": " + TsType(type) : "") + ";";
        if (!_hoist.Contains(decl)) _hoist.Add(decl);
        return name;
    }

    string Temp(SyntaxNode node) => Hoist("__t" + (++_tmp), null, node);

    void EmitBlockContents(BlockSyntax block, bool braces)
    {
        if (braces) _w.Open("");
        // local functions are hoisted like C# lets them be called before their declaration
        foreach (var lf in block.Statements.OfType<LocalFunctionStatementSyntax>()) EmitLocalFunction(lf);
        foreach (var st in block.Statements)
            if (st is not LocalFunctionStatementSyntax) EmitStatement(st);
        if (braces) _w.Close();
    }

    void EmitEmbedded(StatementSyntax s)
    {
        if (s is BlockSyntax b) EmitBlockContents(b, braces: false);
        else EmitStatement(s);
    }

    void EmitLocalFunction(LocalFunctionStatementSyntax lf)
    {
        if (_model.GetDeclaredSymbol(lf) is not IMethodSymbol ms) return;
        // generic local functions keep their type parameters: const first = <T>(items: T[]): T => ...
        var head = "const " + LocalName(ms.Name) + " = " + (ms.IsAsync ? "async " : "") + TypeParams(ms.TypeParameters) + "(" + Params(ms, lf.ParameterList) + ")" + (ms.IsAsync && ms.ReturnsVoid ? "" : ": " + TsType(ms.ReturnType)) + " =>";
        _w.Open(head);
        // an arrow can't be a generator: an iterator local function wraps one (see EmitIteratorBody)
        var iter = IteratorOf(ms, lf);
        if (iter.kind != IterKind.None) EmitIteratorBody(iter, lf.Body, ms.ReturnType, wrap: true);
        else EmitBody(lf.Body, lf.ExpressionBody, ms.ReturnsVoid || IsTaskVoid(ms));
        _w.Close(";");
    }

    // ------------------------------------------------------------------ iterators (yield)
    enum IterKind { None, Lazy, Eager }

    /// <summary>The iterator being emitted: what `yield return` / `yield break` become.</summary>
    readonly Stack<IterKind> _iter = new();

    /// <summary>The collector of an eager iterator (IEnumerable): `yield return x` pushes to it.</summary>
    const string YieldList = "__yield";

    /// <summary>
    /// Whether a method, accessor or local function is an iterator (its own body has `yield`), and how
    /// it is emitted:
    /// - IEnumerator / IEnumerator&lt;T&gt; (coroutines): Lazy, a generator (`*Blink()`), run step by step
    ///   by whoever calls next() (unity-style's StartCoroutine, a `yield` of another iterator...);
    /// - IEnumerable / IEnumerable&lt;T&gt;: Eager. IEnumerable is an array in the generated code (foreach,
    ///   LINQ, Count...), so the iterator runs to its end when called and returns the array of what
    ///   it yielded.
    /// </summary>
    (IterKind kind, ITypeSymbol elem) IteratorOf(IMethodSymbol ms, SyntaxNode decl)
    {
        var body = decl switch
        {
            BaseMethodDeclarationSyntax m => (SyntaxNode)m.Body,
            LocalFunctionStatementSyntax l => l.Body,
            AccessorDeclarationSyntax a => a.Body,
            _ => null,
        };
        if (body == null) return (IterKind.None, null);
        var hasYield = body.DescendantNodes(n => n == body || n is not (LocalFunctionStatementSyntax or AnonymousFunctionExpressionSyntax)).OfType<YieldStatementSyntax>().Any();
        if (!hasYield) return (IterKind.None, null);
        var rt = (ms.MethodKind == MethodKind.PropertyGet ? (ms.AssociatedSymbol as IPropertySymbol)?.Type : ms.ReturnType) as INamedTypeSymbol;
        var o = rt?.OriginalDefinition;
        var ns = o?.ContainingNamespace?.ToDisplayString();
        if (ns == "System.Collections" && o.Name == "IEnumerator") return (IterKind.Lazy, null);
        if (ns == "System.Collections" && o.Name == "IEnumerable") return (IterKind.Eager, null);
        if (ns == "System.Collections.Generic" && o.Name == "IEnumerator" && o.Arity == 1) return (IterKind.Lazy, rt.TypeArguments[0]);
        if (ns == "System.Collections.Generic" && o.Name == "IEnumerable" && o.Arity == 1) return (IterKind.Eager, rt.TypeArguments[0]);
        Unsupported(decl, "An iterator returning " + rt?.ToDisplayString());
        return (IterKind.Lazy, null); // emitted anyway (not written: the file has an error), without a second error per yield
    }

    /// <summary>
    /// The body of an iterator. Lazy: the statements of a generator method, or, where a generator
    /// can't be declared (getters, local functions, which are arrows to keep `this`), a generator
    /// function called with this: `return (function* (this: any) { ... }).call(this);`.
    /// Eager: `const __yield = []`, the statements, `return __yield`.
    /// </summary>
    void EmitIteratorBody((IterKind kind, ITypeSymbol elem) iter, BlockSyntax body, ITypeSymbol returnType, bool wrap)
    {
        _iter.Push(iter.kind);
        if (iter.kind == IterKind.Eager)
        {
            _w.Line("const " + YieldList + ": " + (iter.elem != null ? Wrap(TsType(iter.elem)) : "any") + "[] = [];");
            EmitBlockContents(body, braces: false);
            if (EndReachable(body)) _w.Line("return " + YieldList + ";");
        }
        else if (wrap)
        {
            _w.Open("return (function* (this: any): " + TsType(returnType));
            EmitBlockContents(body, braces: false);
            _w.Close(").call(this);");
        }
        else EmitBlockContents(body, braces: false);
        _iter.Pop();
    }

    /// <summary>Whether the end of a body is reachable (not after `yield break`, an endless loop, a throw...).</summary>
    bool EndReachable(BlockSyntax body)
    {
        if (body.Statements.Count == 0) return true;
        try
        {
            var cf = _model.AnalyzeControlFlow(body.Statements.First(), body.Statements.Last());
            return cf == null || !cf.Succeeded || cf.EndPointIsReachable;
        }
        catch (ArgumentException)
        {
            return true;
        }
    }

    void EmitYield(YieldStatementSyntax y)
    {
        var kind = _iter.Count > 0 ? _iter.Peek() : IterKind.None;
        if (kind == IterKind.None)
        {
            Unsupported(y, "yield here");
            return;
        }
        if (y.IsKind(SyntaxKind.YieldBreakStatement))
        {
            _w.Line(kind == IterKind.Eager ? "return " + YieldList + ";" : "return;");
            return;
        }
        var elem = ReturnTarget(y) is INamedTypeSymbol rt && rt.TypeArguments.Length == 1 ? rt.TypeArguments[0] : null;
        // yield return null: the next frame for unity-style's coroutines (any non-instruction value is)
        WithHoists(() => kind == IterKind.Eager ? YieldList + ".push(" + Expr(y.Expression, elem) + ");" : "yield " + Expr(y.Expression, elem) + ";");
    }

    void EmitStatement(StatementSyntax s)
    {
        switch (s)
        {
            case BlockSyntax b:
                EmitBlockContents(b, braces: true);
                break;
            case EmptyStatementSyntax:
                break;
            case LocalDeclarationStatementSyntax ld:
                EmitLocalDeclaration(ld);
                break;
            case ExpressionStatementSyntax es:
                WithHoists(() => Expr(es.Expression) + ";");
                break;
            case IfStatementSyntax ifs:
                EmitIf(ifs, false);
                break;
            case WhileStatementSyntax ws:
                _w.Open(Header(() => "while (" + Cond(ws.Condition) + ")"));
                EmitEmbedded(ws.Statement);
                _w.Close();
                break;
            case DoStatementSyntax ds:
                _w.Open("do");
                EmitEmbedded(ds.Statement);
                _w.Indent--;
                var cond = Header(() => Cond(ds.Condition));
                _w.Line("} while (" + cond + ");");
                break;
            case ForStatementSyntax fs:
                EmitFor(fs);
                break;
            case ForEachStatementSyntax fe:
                EmitForEach(fe);
                break;
            case ForEachVariableStatementSyntax fv:
                EmitForEachVariable(fv);
                break;
            case ReturnStatementSyntax rs:
                WithHoists(() => rs.Expression == null ? "return;" : "return " + Expr(rs.Expression, ReturnTarget(rs)) + ";");
                break;
            case BreakStatementSyntax:
                _w.Line("break;");
                break;
            case ContinueStatementSyntax:
                _w.Line("continue;");
                break;
            case ThrowStatementSyntax ts:
                if (ts.Expression == null)
                {
                    var c = _catchVars.Count > 0 ? _catchVars.Peek() : null;
                    if (c == null) Error(ts, "CSX1021", "throw; is only supported inside a catch block.");
                    _w.Line("throw " + (c ?? "undefined") + ";");
                }
                else WithHoists(() => "throw " + Expr(ts.Expression) + ";");
                break;
            case TryStatementSyntax tr:
                EmitTry(tr);
                break;
            case SwitchStatementSyntax sw:
                EmitSwitch(sw);
                break;
            case LocalFunctionStatementSyntax lf:
                EmitLocalFunction(lf);
                break;
            case CheckedStatementSyntax cs:
                EmitBlockContents(cs.Block, braces: true);
                break;
            case UsingStatementSyntax:
                Unsupported(s, "using (...)");
                break;
            case LockStatementSyntax:
                Unsupported(s, "lock");
                break;
            case YieldStatementSyntax ys:
                EmitYield(ys);
                break;
            case GotoStatementSyntax or LabeledStatementSyntax:
                Unsupported(s, "goto and labels");
                break;
            default:
                Unsupported(s, s.Kind().ToString());
                break;
        }
    }

    ITypeSymbol ReturnTarget(SyntaxNode node)
    {
        for (var p = node.Parent; p != null; p = p.Parent)
        {
            switch (p)
            {
                case AnonymousFunctionExpressionSyntax af:
                    return (_model.GetSymbolInfo(af).Symbol as IMethodSymbol)?.ReturnType;
                case LocalFunctionStatementSyntax lf:
                    return (_model.GetDeclaredSymbol(lf) as IMethodSymbol)?.ReturnType;
                case BaseMethodDeclarationSyntax md:
                    return (_model.GetDeclaredSymbol(md) as IMethodSymbol)?.ReturnType;
                case AccessorDeclarationSyntax ad:
                    return (_model.GetDeclaredSymbol(ad) as IMethodSymbol)?.ReturnType;
                case PropertyDeclarationSyntax pd:
                    return (_model.GetDeclaredSymbol(pd) as IPropertySymbol)?.Type;
            }
        }
        return null;
    }

    readonly Stack<string> _catchVars = new();

    void EmitLocalDeclaration(LocalDeclarationStatementSyntax ld)
    {
        if (ld.UsingKeyword != default)
        {
            Unsupported(ld, "using var");
            return;
        }
        var isConst = ld.IsConst;
        WithHoists(() =>
        {
            var parts = new List<string>();
            foreach (var v in ld.Declaration.Variables)
            {
                var sym = _model.GetDeclaredSymbol(v) as ILocalSymbol;
                var type = sym?.Type;
                var name = LocalName(v.Identifier.ValueText);
                if (v.Initializer != null)
                {
                    var init = Expr(v.Initializer.Value, type);
                    // `var list = new List<string>()` -> `let list: string[] = []` (TypeScript can't infer [] or null)
                    var annotate = !ld.Declaration.Type.IsVar || init == "[]" || init == "null";
                    parts.Add(name + (annotate ? ": " + TsType(type) : "") + " = " + init);
                }
                else parts.Add(name + ": " + TsType(type) + (IsNumeric(type) || type?.SpecialType == SpecialType.System_Boolean ? "" : ""));
            }
            return (isConst ? "const " : "let ") + string.Join(", ", parts) + ";";
        });
    }

    void EmitIf(IfStatementSyntax ifs, bool isElse)
    {
        var head = Header(() => "if (" + Cond(ifs.Condition) + ")");
        if (isElse) _w.Line("} else " + head + " {");
        else _w.Line(head + " {");
        _w.Indent++;
        EmitEmbedded(ifs.Statement);
        _w.Indent--;
        if (ifs.Else == null)
        {
            _w.Line("}");
            return;
        }
        if (ifs.Else.Statement is IfStatementSyntax elseIf && !NeedsHoist(elseIf.Condition))
        {
            EmitIf(elseIf, true);
            return;
        }
        _w.Line("} else {");
        _w.Indent++;
        EmitEmbedded(ifs.Else.Statement);
        _w.Indent--;
        _w.Line("}");
    }

    /// <summary>Whether a condition declares variables (then `else if` becomes `else { if }`).</summary>
    static bool NeedsHoist(ExpressionSyntax e) => e.DescendantNodesAndSelf().Any(n => n is DeclarationPatternSyntax or VarPatternSyntax or DeclarationExpressionSyntax or RecursivePatternSyntax);

    string Cond(ExpressionSyntax e) => StripParens(Expr(e));

    static string StripParens(string s)
    {
        if (s.Length < 2 || s[0] != '(' || s[^1] != ')') return s;
        var depth = 0;
        for (var i = 0; i < s.Length; i++)
        {
            if (s[i] == '(') depth++;
            else if (s[i] == ')') depth--;
            if (depth == 0 && i < s.Length - 1) return s;
        }
        return s.Substring(1, s.Length - 2);
    }

    void EmitFor(ForStatementSyntax fs)
    {
        var head = Header(() =>
        {
            var init = "";
            if (fs.Declaration != null)
            {
                var parts = new List<string>();
                foreach (var v in fs.Declaration.Variables)
                {
                    var t = (_model.GetDeclaredSymbol(v) as ILocalSymbol)?.Type;
                    parts.Add(LocalName(v.Identifier.ValueText) + (v.Initializer != null ? " = " + Expr(v.Initializer.Value, t) : ""));
                }
                init = "let " + string.Join(", ", parts);
            }
            else if (fs.Initializers.Count > 0) init = string.Join(", ", fs.Initializers.Select(x => Expr(x)));
            var cond = fs.Condition != null ? Cond(fs.Condition) : "";
            var inc = string.Join(", ", fs.Incrementors.Select(x => Expr(x)));
            return "for (" + init + "; " + cond + "; " + inc + ")";
        });
        _w.Open(head);
        EmitEmbedded(fs.Statement);
        _w.Close();
    }

    /// <summary>What to iterate in JavaScript: arrays as they are, Map/Set/Dictionary through Array.from (safe in Cocos' loose ES5 builds).</summary>
    string IterSource(ExpressionSyntax e)
    {
        var t = _model.GetTypeInfo(e).Type;
        var s = Expr(e);
        if (t is INamedTypeSymbol n && (IsDictionary(n) || IsHashSet(n) || n.OriginalDefinition.Name is "IDictionary" or "IReadOnlyDictionary" or "ISet")) return "Array.from(" + s + ")";
        if (t is INamedTypeSymbol k && k.OriginalDefinition.Name is "KeyCollection" or "ValueCollection") return s;
        return s;
    }

    void EmitForEach(ForEachStatementSyntax fe)
    {
        var name = LocalName(fe.Identifier.ValueText);
        var head = Header(() => "for (const " + name + " of " + IterSource(fe.Expression) + ")");
        _w.Open(head);
        EmitEmbedded(fe.Statement);
        _w.Close();
    }

    void EmitForEachVariable(ForEachVariableStatementSyntax fv)
    {
        string pattern = null;
        if (fv.Variable is DeclarationExpressionSyntax de && de.Designation is ParenthesizedVariableDesignationSyntax pd)
            pattern = "[" + string.Join(", ", pd.Variables.Select(v => v is SingleVariableDesignationSyntax sv ? LocalName(sv.Identifier.ValueText) : "")) + "]";
        if (pattern == null)
        {
            Unsupported(fv, "This foreach deconstruction");
            return;
        }
        var head = Header(() => "for (const " + pattern + " of " + IterSource(fv.Expression) + ")");
        _w.Open(head);
        EmitEmbedded(fv.Statement);
        _w.Close();
    }

    void EmitTry(TryStatementSyntax tr)
    {
        _w.Open("try");
        EmitBlockContents(tr.Block, braces: false);
        _w.Indent--;
        if (tr.Catches.Count > 0)
        {
            var v = tr.Catches.Select(c => c.Declaration?.Identifier.ValueText).FirstOrDefault(n => !string.IsNullOrEmpty(n)) ?? "__e" + (++_tmp);
            v = LocalName(v);
            _w.Line("} catch (" + v + ") {");
            _w.Indent++;
            _catchVars.Push(v);
            var first = true;
            var catchAll = false;
            foreach (var c in tr.Catches)
            {
                var type = c.Declaration != null ? _model.GetTypeInfo(c.Declaration.Type).Type : null;
                // .NET exception types all become Error in JavaScript: they catch everything
                var isAll = type == null || type.ContainingNamespace?.ToDisplayString() == "System";
                var local = c.Declaration?.Identifier.ValueText;
                string cond = null;
                if (!isAll) cond = v + " instanceof " + TsType(type, valuePosition: true);
                if (c.Filter != null) cond = (cond == null ? "" : cond + " && ") + "(" + Expr(c.Filter.FilterExpression) + ")";
                if (tr.Catches.Count == 1 && cond == null)
                {
                    if (!string.IsNullOrEmpty(local) && LocalName(local) != v) _w.Line("const " + LocalName(local) + " = " + v + ";");
                    EmitBlockContents(c.Block, braces: false);
                    catchAll = true;
                    break;
                }
                _w.Line((first ? "" : "} else ") + (cond != null ? "if (" + cond + ") {" : "{"));
                _w.Indent++;
                if (!string.IsNullOrEmpty(local) && LocalName(local) != v) _w.Line("const " + LocalName(local) + " = " + v + ";");
                EmitBlockContents(c.Block, braces: false);
                _w.Indent--;
                first = false;
                if (cond == null)
                {
                    catchAll = true;
                    _w.Line("}");
                    break;
                }
            }
            if (!catchAll)
            {
                _w.Line("} else {");
                _w.Line("    throw " + v + ";");
                _w.Line("}");
            }
            _catchVars.Pop();
            _w.Indent--;
        }
        if (tr.Finally != null)
        {
            _w.Line("} finally {");
            _w.Indent++;
            EmitBlockContents(tr.Finally.Block, braces: false);
            _w.Indent--;
        }
        _w.Line("}");
    }

    void EmitSwitch(SwitchStatementSyntax sw)
    {
        var simple = sw.Sections.SelectMany(s => s.Labels).All(l => l is DefaultSwitchLabelSyntax || l is CaseSwitchLabelSyntax);
        if (simple)
        {
            _w.Open(Header(() => "switch (" + Cond(sw.Expression) + ")"));
            foreach (var sec in sw.Sections)
            {
                foreach (var l in sec.Labels)
                    _w.Line(l is CaseSwitchLabelSyntax c ? "case " + Expr(c.Value) + ":" : "default:");
                _w.Indent++;
                foreach (var st in sec.Statements) EmitStatement(st);
                _w.Indent--;
            }
            _w.Close();
            return;
        }
        // pattern cases: an if/else chain on a temporary
        var subjectType = _model.GetTypeInfo(sw.Expression).Type;
        string subject = null;
        WithHoists(() =>
        {
            subject = "__sw" + (++_tmp);
            return "const " + subject + " = " + Expr(sw.Expression) + ";";
        });
        // `switch` in C# is a breakable scope
        _w.Open("do");
        var first = true;
        SwitchSectionSyntax defaultSection = null;
        foreach (var sec in sw.Sections)
        {
            if (sec.Labels.Any(l => l is DefaultSwitchLabelSyntax))
            {
                defaultSection = sec;
                if (sec.Labels.Count == 1) continue;
            }
            var conds = new List<string>();
            var head = Header(() =>
            {
                foreach (var l in sec.Labels)
                {
                    switch (l)
                    {
                        case CaseSwitchLabelSyntax c:
                            conds.Add(subject + " === " + Expr(c.Value));
                            break;
                        case CasePatternSwitchLabelSyntax cp:
                            var pc = Pattern(subject, cp.Pattern, subjectType);
                            if (cp.WhenClause != null) pc = "(" + pc + ") && (" + Expr(cp.WhenClause.Condition) + ")";
                            conds.Add(pc);
                            break;
                    }
                }
                return string.Join(" || ", conds.Select(c => conds.Count > 1 ? "(" + c + ")" : c));
            });
            _w.Line((first ? "" : "} else ") + "if (" + head + ") {");
            first = false;
            _w.Indent++;
            foreach (var st in sec.Statements) EmitStatement(st);
            _w.Indent--;
        }
        if (defaultSection != null)
        {
            _w.Line(first ? "{" : "} else {");
            _w.Indent++;
            foreach (var st in defaultSection.Statements) EmitStatement(st);
            _w.Indent--;
            _w.Line("}");
        }
        else if (!first) _w.Line("}");
        _w.Indent--;
        _w.Line("} while (false);");
    }
}
