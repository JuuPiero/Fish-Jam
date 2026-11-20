// instantiate + getComponent<T>, the scheduler, async/await, List and Dictionary.
using cc;
using static cc.Globals;

public class Spawner : Component
{
    public Prefab enemyPrefab;
    public int maxEnemies = 5;
    public double interval = 1.5;

    private readonly List<Node> _enemies = new List<Node>();
    private readonly Dictionary<string, int> _killsByType = new Dictionary<string, int>();
    private int _spawned;

    protected override void start()
    {
        schedule(spawnOne, interval);
        _ = countdown(3);
    }

    async Task countdown(int seconds)
    {
        for (var i = seconds; i > 0; i--)
        {
            log($"Wave in {i}...");
            await Task.Delay(1000);
        }
        log("Go!");
    }

    void spawnOne()
    {
        if (_enemies.Count >= maxEnemies) return;
        var enemy = instantiate(enemyPrefab);
        enemy.name = "Enemy" + (++_spawned);
        enemy.setPosition(randomRange(-300, 300), 400, 0);
        node.addChild(enemy);
        var sprite = enemy.getComponent<Sprite>();
        if (sprite != null) sprite.color = new Color(255, 120, 120, 255);
        var label = enemy.getComponentInChildren<Label>();
        if (label is Label l) l.@string = enemy.name;
        _enemies.Add(enemy);
    }

    public void kill(Node enemy, string type)
    {
        if (!_enemies.Remove(enemy)) return;
        enemy.destroy();
        if (_killsByType.TryGetValue(type, out var n)) _killsByType[type] = n + 1;
        else _killsByType[type] = 1;
        scheduleOnce(() => log("Killed " + type), 0.1);
    }

    public string report()
    {
        var parts = new List<string>();
        foreach (var kv in _killsByType) parts.Add($"{kv.Key}: {kv.Value}");
        var total = _killsByType.Values.Sum();
        var average = _enemies.Count == 0 ? 0 : total / _enemies.Count;
        return string.Join(", ", parts) + $" (total {total}, per enemy {average})";
    }

    protected override void onDisable()
    {
        unschedule(spawnOne);
    }
}
