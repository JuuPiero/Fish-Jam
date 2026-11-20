// Keyboard and touch input with Cocos' own API.
using cc;
using static cc.Globals;

public class PlayerController : Component
{
    public double moveSpeed = 200;

    private readonly Vec3 _velocity = new Vec3();
    private bool _left, _right;

    protected override void onLoad()
    {
        input.on(Input.EventType.KEY_DOWN, onKeyDown, this);
        input.on(Input.EventType.KEY_UP, onKeyUp, this);
        node.on(Node.EventType.TOUCH_START, onTouchStart, this);
    }

    protected override void onDestroy()
    {
        input.off(Input.EventType.KEY_DOWN, onKeyDown, this);
        input.off(Input.EventType.KEY_UP, onKeyUp, this);
        node.off(Node.EventType.TOUCH_START, onTouchStart, this);
    }

    void onKeyDown(EventKeyboard e)
    {
        switch (e.keyCode)
        {
            case KeyCode.KEY_A:
            case KeyCode.ARROW_LEFT:
                _left = true;
                break;
            case KeyCode.KEY_D:
            case KeyCode.ARROW_RIGHT:
                _right = true;
                break;
            case KeyCode.SPACE:
                jump(300);
                break;
        }
    }

    void onKeyUp(EventKeyboard e)
    {
        if (e.keyCode == KeyCode.KEY_A || e.keyCode == KeyCode.ARROW_LEFT) _left = false;
        if (e.keyCode == KeyCode.KEY_D || e.keyCode == KeyCode.ARROW_RIGHT) _right = false;
    }

    void onTouchStart(EventTouch e)
    {
        var p = e.getUILocation();
        log($"touch at {p.x:F1}, {p.y:F1}");
    }

    void jump(double height)
    {
        tween(node).by(0.25, new { position = new Vec3(0, height, 0) }).by(0.25, new { position = new Vec3(0, -height, 0) }).start();
    }

    protected override void update(double dt)
    {
        var dir = (_right ? 1 : 0) - (_left ? 1 : 0);
        _velocity.x = dir * moveSpeed;
        var pos = node.position.clone();
        pos.x += _velocity.x * dt;
        node.setPosition(pos);
    }
}
