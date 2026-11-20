// Two classes with the same ccclass name: an error on both.
using cc;
using static cc.Globals;

[ClassName("Shared.Name")]
public class DupA : Component
{
}
