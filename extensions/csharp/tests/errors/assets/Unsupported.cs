// Each construct here must be reported, with a file:line message.
using cc;
using static cc.Globals;

public struct Point
{
    public double x, y;
}

public class Unsupported : Component
{
    public static bool TryRead(string s, out int value)
    {
        value = 0;
        return false;
    }

    public int this[int i] => i;

    void Use()
    {
        var t = (1, 2);
        lock (this) { }
        var q = from n in new[] { 1, 2 } select n;
    }

    public interface IShape { }

    bool Check(object o) => o is IShape;
}

public class SecondComponent : Component { }
