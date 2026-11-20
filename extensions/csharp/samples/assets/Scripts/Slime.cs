// A component deriving from a C# base component.
using cc;
using static cc.Globals;

public class Slime : EnemyBase
{
    public double bounce = 1.2;

    public override void hit(int damage)
    {
        hp -= damage;
        if (hp <= 0) node.destroy();
    }
}
