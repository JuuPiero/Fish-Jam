// TS interop: TypeScript of the project (Scripts/TsLib/*.ts) and of an extension runtime
// (db://fx-tween) used from C# like any other API. The imports are generated.
// The project's TypeScript needs no using (global namespace, like the project's C#); an
// extension's is in Ext.<Package>. Ext.FxTween also has a class FxTween: both work.
using cc;
using static cc.Globals;
using Ext.FxTween;
using static Ext.FxTween.Exports;

public class Arena : Component
{
    // a TypeScript component as a saved reference, and as an array
    [SerializeField]
    private Health boss;
    public Health[] allies;

    // a TypeScript enum and a TypeScript @ccclass data class as saved fields
    public Team team = Team.Enemy;
    public Loadout loadout = new Loadout();

    // an extension enum as a saved field
    public FxEase ease = FxEase.OutBack;

    private FxTween _tween;

    protected override void start()
    {
        // getComponent / addComponent with a TypeScript component
        var hp = getComponent<Health>() ?? addComponent<Health>();
        hp.maxHp = 50 * MAX_TEAMS;
        hp.heal(10).heal(5);
        if (boss != null && boss.damage(25, DamageKind.Ice)) log("boss down");
        // string enums are strings in C#: plain strings going into them are cast in the TypeScript
        var kind = team == Team.Enemy ? DamageKind.Ice : DamageKind.Fire;
        hp.lastKind = kind;

        // a plain TypeScript singleton and its interface-typed results
        var board = ScoreBoard.instance;
        board.onChanged = e => log(e.name + ": " + e.points);
        board.add(node.name, team, 10);
        foreach (var e in board.top(3)) log(e.name + " " + formatHp(e.points, board.total()));

        // a project function named like cc's lerp lives in its folder's namespace
        var mid = Project.Scripts.TsLib.HealthExports.lerp(0, hp.maxHp, 0.5);
        log("mid " + mid + ", cc lerp " + lerp(0, 10, 0.5) + ", team " + (int)team);

        // not bound (excluded, or no exports): by name, untyped
        dynamic legacy = getComponent("LegacyHealth");
        if (legacy != null) legacy.damage(5);

        // an extension runtime: static factory, fluent `this` returns, a callback
        _tween = FxTween.move(node, new Vec3(0, 2, 0), 1).setEase(ease).onComplete(() => log("arrived (" + fxVersion() + ")"));
    }

    protected override void update(double dt)
    {
        if (_tween != null && !_tween.step(dt)) _tween = null;
    }
}
