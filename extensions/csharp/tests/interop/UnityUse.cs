// A MonoBehaviour of the real unity-style extension (db://unity-style), written in C#: csharp's own
// [SerializeField] / [Tooltip] / [Range] (unity-style's duplicates are not bound: no CS0104),
// unity-style's [Header] / [Space], Unity messages (no CSX2010) and coroutines.
using System.Collections;
using cc;
using static cc.Globals;
using Ext.UnityStyle;

public class UnityUse : MonoBehaviour
{
    [SerializeField] private double speed = 2;
    [Header("Look")]
    [Tooltip("Tint of the target")]
    public Color tint = new Color(255, 255, 255, 255);
    [Space(8)]
    [Range(0, 1)]
    public double alpha = 1;
    [NonSerialized] public int runtimeOnly;
    [HideInInspector] public int hiddenCount;

    private int frames;

    void Awake()
    {
        runtimeOnly = 1;
    }

    void Start()
    {
        StartCoroutine(Blink(3));
        StartCoroutine("Fade");
    }

    void Update(double dt)
    {
        frames++;
        Translate(new Vec3(0, 0, (float)(speed * dt)));
    }

    IEnumerator Blink(int times)
    {
        for (var i = 0; i < times; i++)
        {
            tint.a = 0;
            yield return new WaitForSeconds(0.25);
            tint.a = 255;
            yield return null;
        }
        yield return Fade();                        // nested
        yield return StartCoroutine(Fade());        // waits for it
        var co = StartCoroutine(Fade());
        StopCoroutine(co);
    }

    IEnumerator Fade()
    {
        yield return new WaitUntil(() => frames > 10);
        alpha = 0.5;
    }
}
