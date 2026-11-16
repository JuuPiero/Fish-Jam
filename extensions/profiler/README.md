# Profiler for Cocos Creator

Unity-style **Profiler** and **Frame Debugger** for Cocos Creator 3.8.6+. The editor windows read a running game over a WebSocket. The game can be Play in Editor, a browser preview, or a phone on the same network.

The connection carries telemetry from the game and a fixed set of commands from the editor: record on/off, capture a frame, step. No code is ever sent to or run in the game.

## Install

Copy `profiler` into `extensions/` of the project and enable it in Extension Manager. `dist/` is prebuilt. The runtime is mounted as `db://profiler` and starts by itself in previews and debug builds.

## Profiler window

Open it from **Panel > Profiler** or **Extension > Profiler > Profiler**.

- **Target**: the connected games (Play in Editor, Preview, Build), with their platform.
- **Record** starts or stops sending frames. It is on by default and remembered.
- **Deep Profile** times every script's `update` and `lateUpdate` (slower, like Unity's).
- **Clear** forgets the recorded frames. **Current** follows the newest frame again.
- **CPU Usage**: stacked by part of the frame.
  - Rendering, Scripts (Start / Update / LateUpdate), Systems (physics, tween, animation, scheduler... each director System), Input (input events, and work between frames), Other.
  - Reference lines at 16.7 ms (60 FPS) and 33.3 ms (30 FPS).
- **Rendering**: draw calls per frame. The legend also shows triangles and instances.
- **Memory**: JS heap (where the platform reports it) and an estimate of texture memory. The legend shows loaded assets and scene nodes.
- Charts keep the last 300 frames.
  - Hover shows the values, click selects a frame, double-click goes back to Current. Left/Right arrows step frames.
  - Click a legend entry to hide or show its series.
- **Hierarchy** of the selected frame:
  - Columns: Total %, Self %, Calls, Time ms, Self ms.
  - Same-name samples under the same parent are merged, as in Unity. Click a column header to sort, click ▸ to expand.

### Your own markers

```ts
import { Profiler } from 'db://profiler/index';

Profiler.beginSample('AI.Think');
// ...
Profiler.endSample();

Profiler.sample('Pathfinding', () => this.findPath());
```

Markers nest under whatever runs at the time, for example under `Update (Scripts)` when called from `update()`. They cost nothing when the editor is not recording. Markers called between frames, such as input handlers on the web, appear under **Between Frames**.

### Connecting

- **Play in Editor** and **browser previews** on this machine connect automatically. The editor listens on 127.0.0.1, port 7471 (or 7472 / 7473 if busy).
- **A phone on the LAN**:
  1. Turn on **LAN** in the Profiler window. The window lists this computer's addresses.
  2. On the phone, open the preview URL with that address instead of `localhost`.
  3. The game connects back to the page's host.
- **A native or release build**:
  - Add a **ProfilerConnector** component (Add Component > Profiler) with the editor machine's IP and **Connect In Release** if needed.
  - Or call `Profiler.enable({ host: '192.168.1.10' })`.
- Release builds stay inert unless one of these opts in.

## Frame Debugger window

Open it from **Panel > Frame Debugger** or **Extension > Profiler > Frame Debugger**.

- **Enable** captures one frame of the selected game.
  - The left side lists render passes (target size, cleared or loaded) and their draw calls.
  - The right side shows the selected draw: shader, effect, material, pass index, the node drawn, vertices / indices / instances / triangles, and its render pass with the clear color.
- The slider, ◀ ▶ buttons, arrow keys or a click on a draw **step** the game's rendering. The game keeps drawing every frame but stops after that draw, so the view shows the frame up to it.
- **Capture** takes a new frame. **Disable** stops stepping and restores normal rendering.

**Web renderer only** (Play in Editor, browser previews, web builds). On native the pipeline records in C++ and the hook is never called. Games report whether they support it, and the target list says "not supported".

## How it hooks the engine

- Director events `BEGIN_FRAME`, `BEFORE_UPDATE`, `AFTER_UPDATE`, `BEFORE_DRAW`, `AFTER_DRAW` and `END_FRAME` delimit the parts of each frame.
- While recording, own-property wrappers time these methods:
  - `director._compScheduler.startPhase / updatePhase / lateUpdatePhase`
  - every `director._systems[i].update / postUpdate`
  - `director.root.frameMove`
  - with Deep Profile, the `update` / `lateUpdate` of each component class in the scene, wrapped on the prototype
- The wrappers are removed when recording stops.
- Draw calls, triangles and instances come from `device.numDrawCalls / numTris / numInstances`. The device sets them at present, so they are read at the next frame start.
- The Frame Debugger shadows `beginRenderPass`, `bindPipelineState`, `bindDescriptorSet`, `bindInputAssembler` and `draw` on `director.root.device.commandBuffer`. Both the builtin custom pipeline and the legacy pipeline record into it.
  - The shadows exist only while capturing, stepping or counting render passes, and are deleted afterwards.
  - Material set (1) and local set (2) descriptor sets are matched to the scene's materials and models to name the material and node.

## Not verified yet

All the pure logic and the transport are tested in node (`npm test`: recorder, hierarchy, chart math, protocol, a real WebSocket round trip, and the Frame Debugger hook on a fake command buffer). Still untested in Cocos:

- The engine-internal names (`_compScheduler`, `_systems`, `root.frameMove`) and the numbers they give on each platform.
- Whether the device counters are non-zero on native.
- Texture memory is an estimate (width × height × 4, +33% with mipmaps). The JS heap only exists in Chromium.
- Frame Debugger:
  - Material names for UI batches and post effects are usually empty: they draw with engine-made descriptor sets.
  - Stepping draws later passes' clears, so after a pass ends early the screen may show a cleared target. It does not show the intermediate render target the way Unity does.

Tests: `npm test`. Build: `npm run build`.
