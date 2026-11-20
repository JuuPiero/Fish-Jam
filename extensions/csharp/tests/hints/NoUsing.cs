// [Button] without `using Ext.AdvancedInspector;`: C# finds cc.Button, no attribute (CS0616).
using cc;
using static cc.Globals;

public class NoUsing : Component
{
    [Button]
    void Spawn()
    {
    }
}
