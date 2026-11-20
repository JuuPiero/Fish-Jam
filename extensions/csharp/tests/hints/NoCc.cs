// Cocos is a namespace, not a global using: without `using cc;` / `using static cc.Globals;`
// the errors say which using is missing.
public class NoCc
{
    Vec3 offset;

    void Hello()
    {
        log("hello");
    }
}
