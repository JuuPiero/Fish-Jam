// TS decorators as C# attributes: advanced-inspector's Odin-like attributes (db://advanced-inspector).
// They only record metadata, so public fields keep their automatic @property (written last).
// Their namespace is Ext.AdvancedInspector. Its readOnly is also the C#-style [ReadOnly] (Cocos'
// readonly option, from cc): [ReadOnly] alone would be ambiguous (CS0104), so an alias names it.
using cc;
using static cc.Globals;
using Ext.AdvancedInspector;
using AI = Ext.AdvancedInspector;

public class InspectorDemo : Component
{
    [Title("Stats", Subtitle = "Health and speed", Line = false)]
    [BoxGroup("Stats", ShowLabel = false)]
    [ProgressBar(0, 100, "#e04040")]
    public double hp = 100;

    [BoxGroup("Stats")]
    [PropertySpace(4)]
    [GuiColor(new double[] { 120, 200, 255 })]
    [Range(0, 20)]
    public double speed = 3;

    public bool isBoss;

    public int mode;

    [ShowIf("isBoss")]
    [AI.ReadOnly]
    public int phase = 1;

    [ShowIf("mode", 1, 2)]
    [ValueDropdown(new[] { "easy", "normal", "hard" })]
    public string difficulty = "normal";

    [ValueDropdown("Skins")]
    [InlineButton("Randomize", "Rnd")]
    [InlineButton("ResetSkin")]
    public string skin = "default";

    [InfoBox("Bosses ignore knockback", "warning", "isBoss")]
    [ShowInInspector]
    public int Kills => _kills;

    private int _kills;

    [Button("Spawn", Size = "large", Color = "green")]
    public void Spawn()
    {
        _kills++;
        log("spawned " + difficulty);
    }

    [Button]
    void ResetSkin()
    {
        skin = "default";
    }

    [Button(Size = 30)]
    void Randomize()
    {
        var all = Skins();
        skin = all[(int)randomRangeInt(0, all.Length)];
    }

    string[] Skins() => new[] { "default", "red", "gold" };
}
