// A real extension runtime from C#: tween-pro (db://tween-pro/index) of the CocosGoat project.
// tests/samples.js compiles it against the stubs generated from that project, then type-checks
// the TypeScript it gives with tween-pro's own sources.
using cc;
using static cc.Globals;
using Ext.TweenPro;
using static Ext.TweenPro.Exports;

public class TweenUse : Component
{
    public Ease ease = Ease.OutBack;
    public LoopType loopType = LoopType.Yoyo;
    public TweenAnimation animation;

    protected override void start()
    {
        Tw.move(node, new Vec3(0, 2, 0), 1).setEase(ease).setLoops(-1, loopType);
        Tw.sequence()
            .append(Tw.scale(node, 1.2, 0.2))
            .append(Tw.scale(node, 1, 0.2))
            .appendCallback(() => log("pulse done"));
        var anim = animation ?? getComponent<TweenAnimation>();
        if (anim != null) log("tweens on " + node.name + ": " + Tw.totalPlayingTweens());
        log("ease at 0.5: " + evaluateEase(ease, 0.5));
    }

    protected override void onDestroy()
    {
        Tw.kill(node);
    }
}
