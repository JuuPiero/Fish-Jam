# Hot Reload for Cocos Creator 3.8.6

Edit and save a script **while the game is playing in the editor** (Play in Editor, including the SceneGamePanel Game panel): the new code runs in the game at once, **without restarting and without losing state**. Positions, scores and the current level stay as they were.

```
[Hot Reload] Player.ts: 2 methods updated, 1 method added, 1 field added (trail)
[Hot Reload] Enemy.ts: restart needed (new @property 'hp'), keeping the running code
```

It works for TypeScript and JavaScript scripts, and for C# scripts made with the `csharp` extension, because those become `.ts` files that Cocos compiles like any other.

## Use

1. Press Play in Cocos' toolbar or in the Game panel.
2. Change a script and save it. Cocos compiles it, and the Console shows a `[Hot Reload]` line.
3. Your change is live from the next call: the next `update()`, the next click handler, and so on.

Menu **Extension → Hot Reload**:

| Item | Does |
|---|---|
| Enable / Disable Hot Reload | When off, Cocos handles script changes as usual. On by default; saved in the editor profile. |
| Restart Game | Stop and Play again (Play in Editor). |
| Save Diagnostics | Writes `diagnostics.json` in this folder: the state of each scene process (for bug reports). |
| Open README | This file. |

## What changes live

| Change | Live? |
|---|---|
| The body of a method (`update`, `onClick`, game logic…) | Yes, for every running object |
| New methods, getters/setters, static methods | Yes |
| Callbacks registered earlier (`schedule`, `input.on`, `node.on`, `tween().call`…) | Yes: they run the new code |
| New plain fields (`private trail: Vec3[] = []`) | Yes: added to running components with their initial value |
| A new `update()` / `lateUpdate()`, or one removed | Yes: running components are scheduled / unscheduled |
| Static data (`static instance`) | Kept: the new code reads and writes the running values |
| New helper classes used inside the file | Yes |
| New or removed `@property`, a changed property type | **Restart needed** |
| A changed base class (`extends`) | **Restart needed** |
| Changed class decorators (`@executeInEditMode`, `@requireComponent`, `@executionOrder`, `@disallowMultiple`, `@playOnFocus`) | **Restart needed** |
| A new `@ccclass` class | **Restart needed** |
| A compile or load error in the new code | The running code stays; the error is shown |

When a restart is needed, nothing is changed: the game keeps running the old code. Use **Restart Game** when you are ready.

After you press Stop, the scripts are reloaded the normal Cocos way, so the next Play always starts from clean code.

## Limits

- **Code that already ran is not run again.** `onLoad`, `start`, `onEnable` and constructors ran with the old code. A new `start()` only matters for objects created later.
- **Module-level variables start fresh in the new code.** For example, `let count = 0` written outside a class. Keep state in class fields or statics instead.
- **Arrow-function fields belong to each object.** `onTap = () => {...}` keeps its old body on objects that already exist. Use methods for code you want to tweak live.
- **New fields reach running components only.** For plain classes, such as a `GameManager` that isn't a component, existing objects can't be found, so a new field reads `undefined` until it is assigned.
- **If the script was loaded after Play started**, callbacks grabbed before that keep the old code. The Console says when this happens.
- **Exported functions and constants** are re-run with the module, but files that imported them keep the old values until a restart.
- **Browser Preview and builds are not covered.** Hot Reload only works for Play in Editor. Browser Preview still refreshes the page as usual.

## How it works

Cocos 3.8.6 loads project scripts with the editor's script executor (`@editor/lib-programming`):
- Each script is a SystemJS module compiled into the "quick pack" (`pack:///…` URLs).
- When scripts change, Cocos broadcasts `programming:pack-build-end`.
- The executor's `reload()` normally unregisters every project class, deletes every module and imports them all again.

While the game is playing, Hot Reload does a targeted swap instead:

1. **Notice the compile.** The main process forwards `programming:pack-build-end` / `programming:compiled` to the scene processes. A full `reload()` that Cocos starts in the game's process during Play is intercepted too.
2. **Find what changed.** The scene script refreshes the pack (`_reloadPackMods`, under the pack lock) and compares chunk timestamps to find the changed modules.
3. **Load only those modules.** Each changed module is loaded again through Cocos' own loader (`System.delete` + `System.import`). Its classes are temporarily unregistered first, so Cocos raises no "class already registered" errors.
4. **Pair old and new classes.** New classes are matched to the running ones by `@ccclass` name, otherwise by export name. If properties, the base class or class decorators changed, everything is put back and "restart needed" is reported.
5. **Move the code.** The running class receives the new methods. Its methods were wrapped when Play started, so callbacks grabbed earlier also run the new code. Statics are shared and `instanceof` keeps working; new fields go onto running components.
6. **Keep identities.** The running classes stay the registered ones, so `getComponent('Player')`, prefab instantiation and the scene keep using them.

Only modules that Cocos compiled from the project's own scripts are loaded, through Cocos' loader. The main process and the scene scripts exchange fixed messages only; no code is sent between them.

## Troubleshooting

- **Nothing happens on save:** use **Save Diagnostics** while playing and look at the process whose `playing` is `true`. Check `executorFound`, the `wrapped` hooks and the `log` (`compiled`, `report` entries).
- **Cocos restarts the game itself on save:** report it with the diagnostics. The `executor-reload-intercepted` entries show who asked for the reload.

## Development

```bash
npm install
npm run build   # tsc + esbuild -> dist/
npm test        # patch logic + the scene script against a fake engine
```
