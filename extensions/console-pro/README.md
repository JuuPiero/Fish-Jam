# Console Pro

A better Console for Cocos Creator 3.8.6, modelled on Unity's Console and the Console Pro asset (behaviour only, no code from it). Editor only: nothing is added to your game build. Cocos' own Console is not changed and keeps working.

Open it from **Panel > Console Pro** or **Extension > Console Pro**, then dock it where you like.

## Features

| Area | What you get |
|---|---|
| List | Virtualized list (100k lines scroll smoothly), level icons (log, info, warning, error, success), alternating rows, the selected row in the theme's focus colour. |
| Toolbar | **Clear** (its arrow has **Clear on Play** and "Clear Cocos' Console Too"), **Collapse**, **Error Pause**, search, timestamps, wrap, level toggles with counts, the **More** menu. |
| Log Entry | **More › Log Entry › 1–10 Lines**, like Unity. With 2 or more lines, each row is taller, has a 32 px level icon, and shows the message's first lines, then its stack frames (engine and editor frames skipped). Picking it turns wrap off; wrap shows whole messages instead. |
| Levels | Click a level button to hide or show it. **Alt+click** shows only that level; Alt+click again shows all. |
| Search | Plain text by default. **Aa** matches case, **.\*** switches to a regular expression (a bad regex turns the box red and searches the plain text). Matches are highlighted. |
| Channels | A chip for each source (**Main**, **Scene**, **Game**, **Panel**) and for each `[Tag]` that messages start with (`[Hot Reload]`, `[C#]`, `[Media Utils]`...). Click a chip to hide it, double-click or Alt+click to solo it, right-click for a menu. "Show all" resets them. |
| Collapse | Identical messages (same level, source, text and stack) become one row with a count. |
| Details | The full message (selectable text) and the stack. Each frame is a link that opens the file at its line. Frames are mapped through source maps to your `.ts` file. Generated C# scripts also show a link to the `.cs` file. |
| Open | Double-click a row, press **Enter**, or use the details' open button: the first frame in your project's code opens in your code editor. |
| Copy | **Ctrl+C** copies the selected rows (Shift+Ctrl+C adds their stacks). When text is selected in the details pane, Ctrl+C copies that text instead. The row menu has Copy, Copy with Stack and Copy Stack. |
| Export | **More > Export Visible...** saves the rows that pass the filter, with their stacks, to a `.log` or `.txt` file. |
| History | The main process keeps the last 50,000 lines (**More > History Size**). Closing or reloading the panel loses nothing. Reloading the extension keeps them too, within the same editor session. |
| Remembered | Filters, toggles, chip states and the details height are saved per panel. |

Keyboard: **Ctrl+F** search, **Up/Down** select (with Shift to extend), **PageUp/PageDown**, **Home/End**, **Enter** open, **Ctrl+A** select all, **Esc** clears the search (in the box) or the selection.

## Where the lines come from

Cocos keeps every log line in one place, its log hub `@base/electron-logger` in the editor's main process:
- it patches the main process console;
- every panel, the edit-scene webview and the Play-in-Editor webview forward their `console.*` calls to it;
- its list is what `Editor.Logger.query()` returns and what Cocos' Console shows.

Console Pro reads that hub, so it shows the same lines as Cocos' Console:

| Source | How it is captured |
|---|---|
| Main process (asset-db, builder, extensions' main scripts) | The Logger's `record` event (`Editor.Logger.__protected__.on`). A one-second watchdog reads `Editor.Logger.query()`, the public API, and takes over with polling if the event ever stops firing. |
| Panels | The same: panels forward their console to the hub. |
| Edit scene (scene scripts, engine in the editor) | The same, and the scene script (below) confirms the source. |
| Play-in-Editor (`console.log`, `cc.log`, `warn`, `error`) | The same. Cocos' PIE logger prefixes these lines with `PreviewInEditor`, and the scene script confirms them as **Game**. |
| Uncaught errors / unhandled promise rejections | The scene script listens to the window `error` and `unhandledrejection` events in the scene and PIE processes. Console Pro adds them, marked "uncaught", unless Cocos already recorded the same error. |
| Browser preview (a game running in Chrome) | **Not captured.** Those logs stay in the browser's DevTools. |

**The scene script** (`dist/scene.js`, loaded by Cocos in both scene processes) only adds information:
- For every console call it sends the level, the first words and the time to the main process, over one fixed message (`console-pro` / `scene-events`). The main process pairs these with the hub's records to tell **Scene** from **Game**. The call itself still reaches Cocos' console unchanged.
- It reports the PIE play state, for Clear on Play and Error Pause.
- It never evaluates anything it receives.

To turn the console part off, untick **More > Tag Scene / Game Lines** and reload the scene. Lines then fall back to a guess, from the `PreviewInEditor` prefix and the stack, and the details pane shows "(guessed)".

## Opening files

Stack urls are mapped to project files:
- `db://assets/...` and other asset-db urls (the latter through `asset-db query-path`);
- `file:///...` and plain paths;
- compiled chunks: `pack:///chunks/xx/<id>.js`, `.../temp/programming/packer-driver/targets/editor|preview/chunks/...`, `http://.../scripting/x/chunks/...`. These are followed through the chunk's `.js.map` back to your `.ts` file and line.
- `packages://<extension>/...`;
- compiler output written in the message, such as `assets/Player.cs(12,9): error ...`.

The code editor is Cocos' **Preferences > External Program > Script Editor** when it is set. VS Code-like editors open with `-g file:line:col`; JetBrains IDEs, Sublime, Notepad++, Visual Studio and Vim get their own line syntax. Arguments with `${file}`, `${line}` or `${col}` in that preference are used as written. Without a preference, VS Code is looked up in its usual install folders, then `code` on the PATH. The last fallback is the system's default app.

**C# scripts** (the `csharp` extension): when a frame lands in a `.ts` file that starts with `// <auto-generated> from X.cs`, the details pane also links to `X.cs`. Double-click opens the `.cs` file (turn this off in **More > Open C# Source on Double-click**).
- The csharp extension writes no line map, so the `.cs` line is **approximate**.
- It is found by matching the enclosing class member, then the statement's identifiers. It is usually exact for ordinary statements.

## Settings

| Setting | Where | Stored in |
|---|---|---|
| Error Pause, Clear on Play, History Size, Tag Scene / Game Lines | toolbar, **More** menu | Editor profile (global), package `console-pro` |
| Levels, search, chips, collapse, timestamps, wrap, columns | panel | the panel's local storage |

## Build and tests

```
npm install
npm run build        # tsc --noEmit, then esbuild into dist/
npm test             # unit tests (stack parsing, url mapping, source maps, C# mapping, collapse, tags, filters, ring buffer, main process with a fake editor, scene script)
npm run smoke        # the real panel in headless Chrome with a mocked Editor and 100k lines
```

## Limits

- Browser preview logs are not captured (see above).
- Error Pause sends Cocos' own PIE pause (`scene` / `editor-preview-call-method('pause', true)`), a few milliseconds after the error. The game can run another frame or two first.
- Cocos' own Console still shows its own list. Its Clear and Console Pro's Clear are separate; "Clear Cocos' Console Too" clears both.
- With the scene script's console tagging on, stacks that Cocos records from the scene processes include one extra frame from `console-pro/dist/scene.js`. Console Pro hides it; Cocos' Console shows it.
