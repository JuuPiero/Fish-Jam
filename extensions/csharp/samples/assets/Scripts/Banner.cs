// TS decorators as C# attributes: cocos-playground's @playGroundField (db://cocos-playground).
// It declares the Cocos property itself, so these fields get no second @property: the type is
// filled from the field, and [Tooltip] / [Range] / [Slide] go into its `property` options.
using cc;
using static cc.Globals;
using Ext.CocosPlayground;

public enum BannerTheme
{
    Light,
    Dark,
    Neon,
}

public class Banner : Component
{
    [PlayGroundField(Label = "Headline", Group = "Text")]
    public string headline = "Play now!";

    [PlayGroundField(Label = "Background", Group = "Look")]
    [Tooltip("Shown behind the headline")]
    public Color background = new Color(255, 200, 0, 255);

    [PlayGroundField(Label = "Slides", Group = "Look")]
    public Texture2D[] slides;

    [PlayGroundField(Label = "Theme")]
    public BannerTheme theme = BannerTheme.Dark;

    [PlayGroundField(Label = "Speed", Type = typeof(float))]
    [Range(0, 10, 0.5), Slide]
    public double speed = 2;

    // a private field: the decorator saves it all the same
    [PlayGroundField(Label = "Taps to win")]
    private int _taps = 3;

    protected override void start()
    {
        log(headline + " (" + theme + ", " + (slides?.Length ?? 0) + " slides, " + _taps + " taps, speed " + speed + ")");
    }
}
