// Serialization mistakes are warnings with file:line.
using cc;
using static cc.Globals;

public class Warnings : Component
{
    [Tooltip("never shown")]
    private int hidden;                      // CSX2006: Inspector attribute, not serialized

    [SerializeField]
    private Dictionary<string, int> map;     // CSX2009: Cocos can't save a Dictionary
}

public class NotSerializable
{
    [SerializeField]
    private int x;                           // CSX2007: the class is not a component nor [Serializable]
}
