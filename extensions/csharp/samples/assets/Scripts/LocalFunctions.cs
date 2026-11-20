// Local functions: called by name (never this.f()), capturing locals and the component.
using cc;
using static cc.Globals;

public class LocalFunctions : Component
{
    public double speed = 2;
    private int _calls;

    protected override void start()
    {
        var label = "start";

        // uses a captured local and the component's own members
        void Report(string what)
        {
            _calls++;
            log($"{label}: {what} ({_calls}) speed={speed}");
        }

        // static local function: no captures
        static int Square(int v) => v * v;

        // generic and recursive
        T First<T>(List<T> items) where T : class => items.Count > 0 ? items[0] : null;
        int Fib(int n) => n < 2 ? n : Fib(n - 1) + Fib(n - 2);

        Report("ready");
        Report($"square {Square(4)}, fib {Fib(10)}");
        var names = new List<string> { "a", "b" };
        log(First(names));

        // a local function as a callback
        void Tick(double dt) => Report($"tick {dt:F2}");
        scheduleOnce(Tick, 0.5);
    }
}
