// An abstract component base: it gets @ccclass because it declares saved fields.
using cc;
using static cc.Globals;

public abstract class EnemyBase : Component
{
    public int hp = 10;

    public abstract void hit(int damage);
}
