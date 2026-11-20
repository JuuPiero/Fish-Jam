// Loading assets: resources.load<T>(path, callback) and a Promise-style wrapper.
using cc;
using static cc.Globals;

public class Loader : Component
{
    public string path = "prefabs/Enemy";

    protected override void start()
    {
        resources.load<Prefab>(path, (err, prefab) =>
        {
            if (err != null)
            {
                error("Could not load " + path + ": " + err.Message);
                return;
            }
            var n = instantiate(prefab);
            node.addChild(n);
            n.addComponent<Rotator>().speed = 45;
        });
        _ = LoadFrame("textures/hero/spriteFrame");
    }

    async Task<SpriteFrame> LoadFrame(string url)
    {
        var tcs = new TaskCompletionSource<SpriteFrame>();
        resources.load<SpriteFrame>(url, (err, frame) => tcs.SetResult(frame));
        return await tcs.Task;
    }
}
