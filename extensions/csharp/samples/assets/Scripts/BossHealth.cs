// A C# component extending a TypeScript component (Scripts/TsLib/Health.ts).
using cc;
using static cc.Globals;

public class BossHealth : Health
{
    public double armor = 0.5;

    public override bool damage(double amount, string kind = DamageKind.Fire)
    {
        return base.damage(amount * (1 - armor), kind);
    }
}
