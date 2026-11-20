// The serialization rule (Unity-style) and the C#-style attributes, field by field.
using cc;
using static cc.Globals;

public enum Rarity
{
    Common,
    Rare,
    Epic,
}

// Nested data: [Serializable] classes get @ccclass and their public fields are saved.
[Serializable]
public class ItemStack
{
    public string id = "";
    public int count = 1;
    public Rarity rarity;
    public SpriteFrame icon;
    private int _cache;          // private: not saved
}

// [ClassName] sets the @ccclass name (keep it when renaming the class: saved data refers to it).
[Serializable, ClassName("Samples.Loot")]
public class Loot
{
    public ItemStack item;       // nested serializable class
    [Range(0, 1)]
    public double chance = 0.5;
}

// Not [Serializable]: a public field of this type is left plain, as in Unity.
public class SessionStats
{
    public int kills;
}

[ExecutionOrder(-10), DisallowMultiple, Help("https://docs.cocos.com/creator/3.8/manual/en/")]
public class Inventory : Component
{
    [Group("Items")]
    public List<ItemStack> items = new List<ItemStack>();

    [Group("Items")]
    public Loot[] lootTable;

    [Tooltip("Coins"), Min(0), Step(10)]
    [SerializeField]
    private int _gold = 100;     // private + [SerializeField]: saved, and shown although it starts with _

    [SerializeField, DisplayName("Max slots"), Max(99)]
    protected int capacity = 20;

    [HideInInspector]
    public double lastSave;      // saved, not shown

    [NonSerialized]
    public double runtimeOnly;   // public but not saved

    [Multiline, FormerlySerializedAs("desc")]
    public string description = "";

    [ReadOnly]
    public string version = "1.0";

    [Type(typeof(Sprite))]
    public Component badge;      // the type of the property overridden

    public Rarity minRarity = Rarity.Rare;
    public Color tint = new Color(255, 255, 255, 255);

    public Dictionary<string, int> counts = new Dictionary<string, int>();  // can't be saved: plain
    public Action<int> onGoldChanged;                                       // delegate: plain
    public SessionStats stats = new SessionStats();                         // not [Serializable]: plain
    public static int instances;                                            // static: plain
    public readonly List<string> log = new List<string>();                  // readonly: plain
    protected double cooldown;                                              // protected without [SerializeField]: plain

    public int Gold => _gold;

    public void AddGold(int amount)
    {
        _gold += amount;
        onGoldChanged?.Invoke(_gold);
    }
}
