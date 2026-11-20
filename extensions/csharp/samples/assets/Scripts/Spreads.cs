// params and collection expressions: the generated TypeScript never uses spread syntax
// (Cocos' loose build turns spread into concat/apply, which loses Set/Map data).
using cc;
using static cc.Globals;

public class Spreads : Component
{
    public string tag = "spread";

    // our own params method: a plain array parameter in TypeScript
    public int Sum(params int[] values)
    {
        var total = 0;
        foreach (var v in values) total += v;
        return total;
    }

    protected override void start()
    {
        int[] a = [1, 2];
        var list = new List<int> { 3, 4 };
        var set = new HashSet<int> { 5, 6 };

        // params: items, nothing, or an existing array
        log($"sums {Sum(1, 2, 3)} {Sum()} {Sum(a)}");

        // a local function with params
        int Count(params string[] names) => names.Length;
        log(Count("a", "b"), Count());

        // collection expressions with spreads, from arrays, lists and a set
        int[] all = [..a, 9, ..list];
        List<int> fromSet = [..set, 7];
        HashSet<int> unique = [..a, ..a];
        log(all.Length, fromSet.Count, unique.Count);

        // an array passed to Cocos' rest parameters
        object[] extra = [1, "two", 3.5];
        log("values:", extra);   // C#: extra is ONE item here
        log(extra);              // C#: extra IS the params array -> log.apply(null, extra)
        node.emit("hit", extra);

        // .NET params with an array
        string[] words = ["x", "y", "z"];
        log(string.Join(", ", words), string.Format("{0}-{1}", extra));
    }
}
