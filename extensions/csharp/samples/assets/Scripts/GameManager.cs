// A plain singleton (not a component) with C# events.
using cc;
using static cc.Globals;

public enum GameState
{
    Menu,
    Playing,
    Paused,
    Over = 10,
}

public class GameManager
{
    static GameManager _instance;
    public static GameManager Instance => _instance ?? (_instance = new GameManager());

    public event Action<int> ScoreChanged;
    public event Action<GameState> StateChanged;

    public int Score { get; private set; }
    public GameState State { get; private set; } = GameState.Menu;
    public int HighScore { get; private set; }

    public void AddScore(int points)
    {
        Score += points;
        if (Score > HighScore) HighScore = Score;
        ScoreChanged?.Invoke(Score);
    }

    public void SetState(GameState state)
    {
        if (State == state) return;
        State = state;
        StateChanged?.Invoke(state);
        if (state == GameState.Over) log($"Game over with {Score} points");
    }

    public string Describe() => State switch
    {
        GameState.Menu => "In menu",
        GameState.Playing when Score > 100 => "Doing great",
        GameState.Playing => "Playing",
        _ => State.ToString(),
    };

    public void Reset()
    {
        Score = 0;
        ScoreChanged?.Invoke(0);
        SetState(GameState.Menu);
    }
}
