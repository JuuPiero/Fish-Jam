// A TS base component that declares Update(dt) itself (samples.js adds its stub): overriding it is
// not a misspelt Cocos `update`, so no CSX2010.
using cc;
using static cc.Globals;
using Ext.Hint;

public class Overrides : Ticker
{
    public override void Update(double dt)
    {
        log("tick " + dt);
    }
}
