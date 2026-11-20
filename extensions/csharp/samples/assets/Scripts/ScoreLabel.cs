// A component that listens to the GameManager declared in another file.
using cc;
using static cc.Globals;

[RequireComponent(typeof(Label))]
public class ScoreLabel : Component
{
    public string prefix = "Score: ";
    public GameState showIn = GameState.Playing;

    private Label _label;

    protected override void onLoad()
    {
        _label = getComponent<Label>();
    }

    protected override void onEnable()
    {
        GameManager.Instance.ScoreChanged += OnScore;
        GameManager.Instance.StateChanged += OnState;
        OnScore(GameManager.Instance.Score);
    }

    protected override void onDisable()
    {
        GameManager.Instance.ScoreChanged -= OnScore;
        GameManager.Instance.StateChanged -= OnState;
    }

    void OnScore(int score)
    {
        _label.@string = prefix + score.ToString();
    }

    void OnState(GameState state)
    {
        node.active = state == showIn;
    }
}
