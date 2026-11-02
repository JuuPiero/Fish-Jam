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
  - Image quality.
  - Flip image vertically.
  - Save diagnostics.

When not playing, the panel shows what the scene's cameras see.

## How it works

- Play starts Cocos' Play-in-Editor (PIE) and puts it in its *paused* state, in which the Scene panel ("Preview") can be edited.
- PIE runs in its own scene webview, not the one `execute-scene-script` talks to. The Game panel finds that webview and talks to the extension's scene script inside it over a fixed IPC channel (`game-panel:call`). Only the script's own `gp*` methods can be called; nothing is evaluated.
- The scene script (`source/scene.ts`) keeps the game logic running every frame. It resumes the director when the editor ticks it, and ticks the director itself when nobody does. It refuses to do so in a process that is not running PIE.
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

PIE emulates a device by sizing its webview in the Preview panel, and the game uses that size as its screen. While playing, the Game panel sizes that webview to the aspect you choose (`source/pie-aspect.ts`), so the game, including its UI layout, switches immediately, like Unity. If Cocos re-applies its own device size, the panel takes it back; if Cocos keeps fighting, it gives up. Then a yellow **!** on the resolution button shows that the game runs at another size, and the panel displays that real size. On Stop the webview gets its original style back.

Don't use the Play button in Cocos' main toolbar at the same time as the Game panel.

**⋮ → Save diagnostics** writes `diagnostics.json` (read-only snapshot of the editor/engine state) to the extension folder for troubleshooting. It is also written automatically when play mode fails to start.

## Development

```bash
npm install
npm run build      # tsc + esbuild -> dist/ (Vue is bundled in)
npm test           # frame pacing and pixel helpers
npm run preview    # tests/preview/out/preview.html: the UI in a browser with a fake game
                   # tests/preview/out/capture.html#interact: async readback + encoder checks (WebGL2)
```

After building, reload `game-panel` in **Extension → Extension Manager**, or restart Creator.
