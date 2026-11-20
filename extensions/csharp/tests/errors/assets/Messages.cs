// Unity-named lifecycle methods on a plain Cocos component, and iterators where Cocos calls a hook.
using System.Collections;
using cc;
using static cc.Globals;

public class Messages : Component
{
    void Update(double dt) { }                // CSX2010: Cocos calls update, not Update (no base handles Unity messages)

    IEnumerator start()                       // CSX2012: an iterator called as a lifecycle hook never runs
    {
        yield return null;
    }

    async IAsyncEnumerable<int> Stream()      // CSX1001: async iterators are not supported
    {
        await Task.Delay(1);
        yield return 1;
    }
}
