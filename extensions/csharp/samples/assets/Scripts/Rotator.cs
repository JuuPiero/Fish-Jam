// Rotates its node. Public fields are saved and shown in the Inspector; no [ccclass] needed.
using cc;
using static cc.Globals;

[Menu("Samples/Rotator")]
public class Rotator : Component
{
    [Tooltip("Degrees per second")]
    public double speed = 90;

    public int turns;

    public Vec3 axis = new Vec3(0, 1, 0);

    public Node target;

    public Node[] extras;

    public Prefab prefab;

    [Range(0, 1, 0.1), Slide]
    public float damping = 0.5f;

    public string title = "Spinner";

    public bool clockwise;

    private double _angle;

    protected override void start()
    {
        log("Rotator on " + node.name);
        if (target == null) target = node;
    }

    protected override void update(double dt)
    {
        var dir = clockwise ? -1 : 1;
        _angle += speed * dt * dir;
        if (_angle >= 360)
        {
            _angle -= 360;
            turns++;
        }
        target.setRotationFromEuler(axis.x * _angle, axis.y * _angle, axis.z * _angle);
        foreach (var e in extras ?? new Node[0])
        {
            e.angle = _angle;
        }
    }
}
