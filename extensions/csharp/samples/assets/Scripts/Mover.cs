// Vector operators: lowered to Vec3.add / subtract / multiplyScalar / negate into new values.
using cc;
using static cc.Globals;

public class Mover : Component
{
    public Vec3 velocity = new Vec3(1, 0, 0);
    public double speed = 2;

    private Quat _spin = new Quat();

    protected override void update(double dt)
    {
        var step = velocity * speed * dt;
        var pos = node.position + step;
        if (pos.y < 0) pos -= new Vec3(0, pos.y, 0);
        node.setPosition(pos);
        var back = -velocity / 2;
        log(back.toString());
        Quat.fromEuler(_spin, 0, 90 * dt, 0);
        node.setRotation(node.rotation * _spin);
    }
}
