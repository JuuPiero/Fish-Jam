# Game panel for Cocos Creator 3.8

A Unity-style **Game** view. Press Play and the game runs in the Game panel while Cocos' **Scene** panel stays editable; edits in the Scene show up in the Game panel straight away.

## Usage

1. **Panel → Game**, then dock it next to the Scene panel.
2. Press ▶ in the Game toolbar (or `Ctrl+P` while the Game panel has focus).
   - ⏸ `Ctrl+Shift+P`: pause.
   - ⏭ `Ctrl+Alt+P`: step one frame.
   - ▶ again: stop.
3. Click inside the game to give it mouse and keyboard input. While the Game panel has focus, keys go to the game instead of editor shortcuts.

Toolbar:
- **Game / Simulator**: the Game view, or the Device Simulator (below).
- **Display 1–8**: shows the cameras that target that display. Cocos cameras use Display 1 unless they set a target display.
- **Aspect / resolution**:
  - Free Aspect: the panel size.
  - Design Resolution: from Project Settings.
  - Aspect ratios such as 16:9 or 9:16, and fixed sizes such as Full HD or iPhone.
  - **Add…** creates your own sizes, saved in the project settings.
- **Scale**: zoom; 1x means one game pixel per screen pixel. Double-click the slider to fit.
- **Stats**: FPS, draw calls, resolution and play mode.
- **⋮ menu**:
  - Show cameras when not playing.
  - Resize Scene view to game aspect (off by default, see [Resolution while playing](#resolution-while-playing)).
  - Image quality.
  - Flip image vertically.
  - Save diagnostics.

When not playing, the panel shows what the scene's cameras see.

## Device Simulator

Pick **Simulator** in the dropdown at the left of the toolbar (**Game** goes back). This is like Unity's Device Simulator.

The game runs at a real device's resolution, drawn inside that device:
- its body and rounded screen corners;
- its camera cutout: notch, Dynamic Island, punch hole or waterdrop;
- its home indicator or home button.

Toolbar in Simulator mode:
- **Device**:

  | Maker | Devices |
  | --- | --- |
  | Apple | iPhone SE (3rd gen), iPhone 8, iPhone X / XS / 11 Pro, iPhone 11 / XR, iPhone 13 / 14, iPhone 14 Pro / 15 / 15 Pro / 16, iPhone 15 Pro Max / 15 Plus, iPhone 16 Pro, iPhone 16 Pro Max, iPad (10th gen), iPad Pro 11", iPad Pro 12.9" |
  | Google | Pixel 7, Pixel 8 |
  | Samsung | Galaxy S23, Galaxy A14 (waterdrop) |
  | Generic | Android 16:9 |

- **Portrait / Landscape Left / Landscape Right**: Landscape Left puts the top of the device to the left, as in Unity. The resolution, bezels, cutout and safe area turn with the device.
- **Safe Area**: an outline of the safe area over the game.
- **Scale**: as in the Game view. Fit sizes the whole device to the panel.

The device and orientation are saved with the other panel settings.

**While playing**, the Scene panel's view is sized to the device's screen, so the game runs at the device's resolution. The Simulator always does this, whatever the ⋮ option says; see [Resolution while playing](#resolution-while-playing) for what that means for picking in the Scene view.

**While playing**, the game is told the device's safe area:
- `sys.getSafeAreaRect()` and every `cc.SafeArea` component get the device's insets, like on the phone.
  - On the web the engine reads the safe area from the page's CSS variables `--safe-top / --safe-bottom / --safe-left / --safe-right` (`screenAdapter.safeAreaEdge`). The panel sets them on the Play-in-Editor page.
  - `cc.SafeArea` only stretches its node in the editor's engine build, which Play-in-Editor uses. So its runtime adaptation is applied by the panel: Widget margins from `sys.getSafeAreaRect`, and the node keeps its position through its anchor.
  - It is applied again after resizes, scene changes, and for SafeAreas enabled later.
- Switching back to **Game** or pressing Stop restores the real safe area.
- Clicks map to the screen as in the Game view. Clicks on the body or on the cutout do nothing.

To add a device, add an entry to `source/devices.ts`. Each entry has the screen size in pixels, the point scale, the screen corner radius, the bezel, the cutout, and the safe area insets for portrait and landscape.

The safe area insets follow the platforms' published values:
- iOS: 44/47/48/59/62 pt top, 34 pt bottom, 21 pt bottom in landscape.
- Android: the status bar / cutout height on the cutout side.

Corner radii, bezels and cutout sizes are close approximations.

Not yet checked in Cocos (it works in the browser preview with a fake game):
- The safe area as the game sees it:
  - that the CSS variables reach `sys.getSafeAreaRect` in the Play-in-Editor page;
  - that the `cc.SafeArea` adaptation holds while Widgets keep aligning.
- A device that Cocos refuses to switch to shows the yellow **!**, as fixed resolutions do. The frame then follows the size the game really runs at.

## How it works

- Play starts Cocos' Play-in-Editor (PIE) and puts it in its *paused* state, in which the Scene panel ("Preview") can be edited.
- PIE runs in its own scene webview, not the one `execute-scene-script` talks to. The Game panel finds that webview and talks to the extension's scene script inside it over a fixed IPC channel (`game-panel:call`). Only the script's own `gp*` methods can be called; nothing is evaluated.
- The scene script (`source/scene.ts`) keeps the game logic running every frame. It resumes the director when the editor ticks it, and ticks the director itself when nobody does. It refuses to do so in a process that is not running PIE.
- The director only runs inside a frame: it is resumed when a frame begins and paused again when it ends. Between frames PIE is in exactly the state Cocos' own Pause leaves it in.
  - This keeps the Scene panel editable while playing: click and box selection, and the move, rotate and scale gizmos.
  - In PIE the engine has no mouse listeners of its own. Cocos' preview scene facade forwards the Scene view's mouse to the game, at a higher priority than the gizmos and the camera, while the director runs. A director left running between frames made it take every click and drag.
  - Input from the Game panel is dispatched with the director running, so game code sees it as on a device.
  - Game code that runs outside a frame (timers, promises) sees `director.isPaused()` return true.
- Every game Camera is mirrored by a camera that renders into a RenderTexture. The Game panel pulls frames (JPEG) from it and sends mouse/keyboard input back into the engine.
- As with Cocos' own preview, changes made while playing are lost when you stop.

### Performance

- The game ticks at its own frame rate (`game.frameRate`, 60 by default), like the built game. It does not tick at the screen's refresh rate, which would be 144 times a second on a 144 Hz screen.
- While playing, PIE parks the game cameras on a hidden window, where they would still render the whole scene every frame for nobody to see. The panel turns that render off; its mirror cameras draw what you see. A camera you select keeps rendering, since the editor may preview it.
- Parked cameras keep the size and matrices of the game's real screen. The hidden window keeps the size PIE first gave it, so after an aspect change raycasts (`screenPointToRay`) and UI hit tests would land off target. The matrices are also rebuilt when input moves cameras onto the screen.
- After a frame arrives, the panel asks for the next one at once. The scene answers as soon as the next frame is copied, and frames are decoded while the next one is fetched. What you see (and aim at) lags the game as little as possible.
- Frames are copied off the GPU asynchronously (WebGL2 pixel buffer + fence, `source/capture.ts`) instead of with `readPixels`. `readPixels` made the GPU, shared by the whole editor, wait every frame.
- JPEG encoding runs on a worker thread. Over the PIE channel frames travel as bytes, not base64.
- The panel redraws its controls only when something it shows changes, and the frame statistics at most 4 times a second.
- **Stats → Capture** shows how frames are captured (`async+worker` normally, `sync` on the old fallback), the time per frame and the JPEG size.

### Resolution while playing

PIE runs the game in the webview the Scene panel shows while playing, and the game uses that webview's size as its screen. The editor camera and the gizmos render to the same canvas.

**Default (Game view): the Scene panel keeps its size.**
- The game runs at the Scene view's size: its UI layout, Widgets, `screen.windowSize`, `view` and raycasts all use that screen.
- The Game panel shows the game at that aspect, letterboxed. The resolution button shows that size; its tooltip explains it, and Play says so once when another size is chosen.
- Picking and gizmos in the Scene view stay exact.

**⋮ → Resize Scene view to game aspect** (and always in the Simulator):
- The Game panel sizes the Scene panel's webview to the chosen aspect (`source/pie-aspect.ts`). The game, including its UI layout, switches at once, as in Unity.
- If Cocos re-applies its own device size, the panel takes it back; if Cocos keeps fighting, it gives up. A yellow **!** on the resolution button then shows that the game runs at another size, and the panel displays that real size.
- On Stop, or when the option is turned off, the webview gets its original style back.
- **Known limit: clicks in the Scene view can land off target in this mode.**
  - The Scene panel catches the mouse on its own element: its webview has `pointer-events: none` (Cocos' `builtin/scene/static/style/index.less`). It forwards the coordinates to the scene process, mapped against the layout it set up itself, not against a webview that was resized and centred afterwards.
  - The engine side is consistent: the canvas backing size, `screen.windowSize`, the main window and the editor camera all match the resized webview (`diagnostics.json`).
  - Keeping the game at another size than the Scene view without resizing it would mean faking `screen.windowSize` for the game. The same value sizes the canvas the editor camera renders to, so it is not done.
  - **⋮ → Save diagnostics** while playing records the last press over the Scene view twice: as the panel saw it (`pieElement.lastPress`) and as the scene process received it (`scene.sizes.lastSceneMouseDown`), next to the canvas, window and editor camera sizes.

Don't use the Play button in Cocos' main toolbar at the same time as the Game panel.

**⋮ → Save diagnostics** writes `diagnostics.json` (read-only snapshot of the editor/engine state) to the extension folder for troubleshooting. It is also written automatically when play mode fails to start.

## Development

```bash
npm install
npm run build      # tsc + esbuild -> dist/ (Vue is bundled in)
npm test           # frame pacing, pixel helpers, simulator devices / layout / safe area
npm run preview    # tests/preview/out/preview.html: the UI in a browser with a fake game
                   # tests/preview/out/capture.html#interact: async readback + encoder checks (WebGL2)
```

After building, reload `game-panel` in **Extension → Extension Manager**, or restart Creator.
