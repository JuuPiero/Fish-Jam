// C# iterators: IEnumerator coroutines (generators) run by unity-style's StartCoroutine, here through
// the unity-lite fixture (samples/extensions/unity-lite); IEnumerable iterators, foreach, MoveNext.
using System.Collections;
using cc;
using static cc.Globals;
using Ext.UnityLite;

public class Coroutines : MonoBehaviour
{
    [SerializeField] private double interval = 0.5;    // csharp's own [SerializeField]: unity-lite's duplicate is not bound
    [Header("Blink")]                                   // unity-lite's (csharp has no [Header])
    [Tooltip("How many times")]
    public int times = 2;
    [Space(10)]
    public Node target;

    public List<string> trace = new List<string>();
    public int frames;

    // Unity messages: MonoBehaviour calls them, so no CSX2010
    void Start()
    {
        StartCoroutine(Blink(times));
    }

    void Update(double dt)
    {
        frames++;
    }

    public IEnumerator Blink(int count)
    {
        for (var i = 0; i < count; i++)
        {
            trace.Add("on " + i);
            yield return new WaitForSeconds(interval);
            trace.Add("off " + i);
            yield return null;                          // the next frame
        }
        yield return Child("nested");                   // runs inside this one
        yield return StartCoroutine(Child("waited"));   // waits for another coroutine
        if (count < 0) yield break;
        trace.Add("done");
    }

    IEnumerator Child(string label)
    {
        trace.Add(label + " start");
        yield return null;
        trace.Add(label + " end");
    }

    /// <summary>An IEnumerable iterator: runs to its end when called (IEnumerable is an array in TypeScript).</summary>
    public static IEnumerable<int> Evens(int max)
    {
        for (var i = 0; ; i++)
        {
            if (i > max) yield break;
            if (i % 2 == 0) yield return i;
        }
    }

    public IEnumerable<string> Labels
    {
        get
        {
            yield return "a";
            yield return name;
        }
    }

    IEnumerator<int> Countdown(int from)
    {
        try
        {
            for (var i = from; i > 0; i--) yield return i;
        }
        finally
        {
            trace.Add("countdown closed");
        }
    }

    public int Sum()
    {
        var total = 0;
        foreach (var e in Evens(6)) total += e;            // 0 + 2 + 4 + 6
        IEnumerable<int> Twice(int v)
        {
            yield return v;
            yield return v;
        }
        foreach (var t in Twice(5)) total += t;           // + 10
        var it = Countdown(3);
        while (it.MoveNext()) total += it.Current;        // + 3 + 2 + 1
        it.Dispose();
        return total;
    }

    /// <summary>A local iterator function keeps `this` (it adds to trace).</summary>
    public IEnumerator Steps(int n)
    {
        IEnumerator Step(int i)
        {
            trace.Add("step " + i);
            yield return null;
        }
        for (var i = 0; i < n; i++) yield return Step(i);
    }
}
