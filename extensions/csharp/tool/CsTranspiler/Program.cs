using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CsTranspiler;

/// <summary>
/// C# -> TypeScript for Cocos Creator.
///
///   CsTranspiler compile &lt;cocosProjectDir&gt; [--write] [--json]
///       one-shot: compile assets/**/*.cs, print diagnostics, optionally write the .ts files
///   CsTranspiler emit &lt;file.cs&gt;... --root &lt;dir&gt;
///       print the TypeScript of the given files (tests)
///   CsTranspiler usings [cocosProjectDir]
///       print the global usings (for the IDE project; with the project, the TS interop ones too)
///   CsTranspiler server
///       long-lived: one JSON request per stdin line, one JSON response per stdout line.
///       Requests: {"id":1,"cmd":"compile","root":"...","write":true} | {"id":2,"cmd":"usings","root":"..."} | {"id":3,"cmd":"ping"} | {"cmd":"exit"}
///       Only these fixed commands exist; nothing is evaluated.
/// </summary>
public static class Program
{
    public static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Length == 0)
        {
            Console.Error.WriteLine("usage: CsTranspiler compile <dir> [--write] [--json] | emit <files> --root <dir> | usings [dir] | server");
            return 2;
        }
        try
        {
            switch (args[0])
            {
                case "compile":
                    return CompileCmd(args);
                case "emit":
                    return EmitCmd(args);
                case "usings":
                    Console.Write(args.Length > 1 ? new Workspace().GlobalUsingsFor(Path.GetFullPath(args[1])) : Workspace.GlobalUsings());
                    return 0;
                case "server":
                    return Server();
            }
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
        Console.Error.WriteLine("unknown command " + args[0]);
        return 2;
    }

    static int CompileCmd(string[] args)
    {
        var root = Path.GetFullPath(args.Length > 1 ? args[1] : ".");
        var write = args.Contains("--write");
        var ws = new Workspace();
        var r = ws.Compile(root, write);
        if (args.Contains("--json"))
        {
            Console.WriteLine(ToJson(r, 0).ToJsonString());
            return r.Diagnostics.Any(d => d.Severity == "error") ? 1 : 0;
        }
        foreach (var d in r.Diagnostics) Console.WriteLine(d);
        Console.WriteLine($"{r.Files.Count} file(s), {r.Written.Count} written, {r.Unchanged.Count} unchanged, {r.Kept.Count} kept (errors), {r.Ms} ms");
        return r.Diagnostics.Any(d => d.Severity == "error") ? 1 : 0;
    }

    static int EmitCmd(string[] args)
    {
        var rootIdx = Array.IndexOf(args, "--root");
        var root = rootIdx > 0 ? Path.GetFullPath(args[rootIdx + 1]) : Directory.GetCurrentDirectory();
        var files = args.Skip(1).Where((a, i) => !a.StartsWith("--") && (rootIdx < 0 || i + 1 != rootIdx + 1)).Select(Path.GetFullPath).ToList();
        var ws = new Workspace();
        var r = ws.Compile(root, false, files);
        foreach (var f in r.Files)
        {
            Console.WriteLine("=== " + Path.GetFileName(f.TsPath));
            Console.Write(f.Ts);
        }
        foreach (var d in r.Diagnostics) Console.Error.WriteLine(d);
        return r.Diagnostics.Any(d => d.Severity == "error") ? 1 : 0;
    }

    static JsonObject ToJson(CompileResult r, long id)
    {
        var diags = new JsonArray();
        foreach (var d in r.Diagnostics)
            diags.Add(new JsonObject { ["file"] = d.File, ["line"] = d.Line, ["column"] = d.Column, ["severity"] = d.Severity, ["code"] = d.Code, ["message"] = d.Message });
        static JsonArray Arr(IEnumerable<string> s)
        {
            var a = new JsonArray();
            foreach (var x in s) a.Add(x);
            return a;
        }
        return new JsonObject
        {
            ["id"] = id,
            ["ok"] = true,
            ["files"] = r.Files.Count,
            ["written"] = Arr(r.Written),
            ["unchanged"] = r.Unchanged.Count,
            ["kept"] = Arr(r.Kept),
            ["orphans"] = Arr(r.Orphans),
            ["errors"] = r.Diagnostics.Count(d => d.Severity == "error"),
            ["diagnostics"] = diags,
            ["ms"] = r.Ms,
        };
    }

    static int Server()
    {
        var ws = new Workspace();
        var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        stdout.WriteLine(new JsonObject { ["event"] = "ready", ["version"] = 1 }.ToJsonString());
        string line;
        while ((line = stdin.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonObject req;
            try { req = JsonNode.Parse(line) as JsonObject; }
            catch (Exception e)
            {
                stdout.WriteLine(new JsonObject { ["ok"] = false, ["error"] = "bad request: " + e.Message }.ToJsonString());
                continue;
            }
            var id = req?["id"]?.GetValue<long>() ?? 0;
            var cmd = req?["cmd"]?.GetValue<string>();
            try
            {
                switch (cmd)
                {
                    case "ping":
                        stdout.WriteLine(new JsonObject { ["id"] = id, ["ok"] = true }.ToJsonString());
                        break;
                    case "exit":
                        stdout.WriteLine(new JsonObject { ["id"] = id, ["ok"] = true }.ToJsonString());
                        return 0;
                    case "compile":
                        var root = req["root"]?.GetValue<string>();
                        if (string.IsNullOrEmpty(root) || !Directory.Exists(root)) throw new ArgumentException("root must be the Cocos project folder");
                        var write = req["write"]?.GetValue<bool>() ?? true;
                        stdout.WriteLine(ToJson(ws.Compile(Path.GetFullPath(root), write), id).ToJsonString());
                        break;
                    case "usings":
                        // with the project root: the TS interop ones too (using static ProjectExports)
                        var uroot = req["root"]?.GetValue<string>();
                        var text = !string.IsNullOrEmpty(uroot) && Directory.Exists(uroot) ? ws.GlobalUsingsFor(Path.GetFullPath(uroot)) : Workspace.GlobalUsings();
                        stdout.WriteLine(new JsonObject { ["id"] = id, ["ok"] = true, ["text"] = text }.ToJsonString());
                        break;
                    default:
                        stdout.WriteLine(new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = "unknown command " + cmd }.ToJsonString());
                        break;
                }
            }
            catch (Exception e)
            {
                stdout.WriteLine(new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = e.Message }.ToJsonString());
            }
        }
        return 0;
    }
}
