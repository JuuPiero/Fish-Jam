// Namespace mistakes, compiled by tests/samples.js against the samples' TS interop stubs: each
// error message must say how to fix it.
using cc;
using static cc.Globals;
using Ext.AdvancedInspector;

public class Hints : Component
{
    [ReadOnly]                 // CS0104: cc.ReadOnlyAttribute and Ext.AdvancedInspector.ReadOnlyAttribute
    public int a;

    [PlayGroundField]          // CS0246: in Ext.CocosPlayground, not used here
    public string b;

    private FxTween t;         // CS0246: in Ext.FxTween

    [Title("x")]               // fine: using Ext.AdvancedInspector
    public int c;

    protected override void start()
    {
        log(fxVersion());      // CS0103: in Ext.FxTween.Exports
    }
}

// a C# class named like the project's TypeScript Health (Scripts/TsLib/Health.ts): the C# one wins
public class Health
{
    public double hp;
}
