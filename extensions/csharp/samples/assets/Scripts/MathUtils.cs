// Static helpers: generics, LINQ, integer math, strings, patterns, exceptions, overloads.
using cc;
using static cc.Globals;

public static class MathUtils
{
    public const int GridSize = 64;

    public static int CellOf(double position) => (int)(position / GridSize);

    public static int Half(int value) => value / 2;

    public static double Lerp(double a, double b, double t) => a + (b - a) * Math.Clamp(t, 0, 1);

    public static Vec3 Lerp(Vec3 a, Vec3 b, double t)
    {
        var o = new Vec3();
        Vec3.lerp(o, a, b, t);
        return o;
    }

    public static T Pick<T>(List<T> items, int seed) where T : class
    {
        if (items == null || items.Count == 0) return null;
        return items[Math.Abs(seed) % items.Count];
    }

    public static List<int> Evens(IEnumerable<int> numbers) => numbers.Where(n => n % 2 == 0).OrderBy(n => n).ToList();

    public static string Describe(object value)
    {
        if (value is null) return "null";
        if (value is Node n && n.active) return "active node " + n.name;
        if (value is string s && s.Length > 0) return $"text '{s.ToUpper()}'";
        return value switch
        {
            int i when i < 0 => "negative",
            double d => "number " + d.ToString("F2"),
            Component c => "component of " + c.node.name,
            _ => "something",
        };
    }

    public static int ParseOr(string text, int fallback)
    {
        if (int.TryParse(text, out var n)) return n;
        try
        {
            if (string.IsNullOrEmpty(text)) throw new ArgumentException("empty");
            return fallback;
        }
        catch (ArgumentException e)
        {
            warn(e.Message);
            return fallback;
        }
        finally
        {
            log("parsed " + text);
        }
    }
}
