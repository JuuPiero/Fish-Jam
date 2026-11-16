# Media Utils

Editor-only media tools for Cocos Creator 3.8.6+. Nothing from this extension ships in game builds.

- **Image Tools**: compress, convert, resize, crop, rotate, adjust and fix alpha for one image or a batch, with a before / after preview.
- **Audio Editor**: an Audacity-like waveform editor. It has cut / copy / paste, undo, effects, markers and loop points, and exports to WAV, MP3 or OGG.

Both tools can **overwrite in place** or **save as a copy**.
- Overwrite keeps the asset's `.meta`, its uuid and its import settings.
- Overwritten originals are backed up, and **Restore Last** puts them back.

## Opening the tools

| Where | What |
|---|---|
| `Panel > Media Utils > Image Tools` / `Audio Editor` | Opens the panel. |
| `Extension > Media Utils > ...` | Opens a panel. **Restore Last Overwrite** and **Open README** are here too. |
| Assets panel, right-click an image > **Open in Image Tools** | Opens the clicked image. With several images selected, opens all of them as a batch. |
| Assets panel, right-click an audio clip > **Open in Audio Editor** | Opens the clip. |
| Drag and drop | Drop assets from the Assets panel, or files from Explorer, onto either panel. |

## Image Tools

The left column lists the images, the centre shows the preview, and the right side holds the settings, like the Inspector. Each section has its own checkbox; unchecked sections are skipped.

The steps always run in this order:

**crop → trim transparent border → rotate / flip → resize → pad canvas → color adjust → alpha → encode.**

### Steps

- **Crop**
  - Set X / Y / Width / Height in pixels, or click **Crop Box** and drag the box and its handles on the image.
  - The crop is stored relative to the image, so a batch crops the same region of every image.
- **Trim Transparent Border**
  - Removes the transparent border.
  - Pixels with alpha at or below the threshold count as transparent.
  - **Margin** keeps a few pixels around the content.
- **Rotate / Flip**: 90 / 180 / 270 degrees, horizontal and vertical flip.
- **Resize**
  - By **Percent**, or by **Pixels** with **Keep Aspect**.
  - Fit modes: Fill (stretch), Contain (letterbox, with a color), Cover (crop), Inside, Outside.
  - **Round Size**: power of two (nearest / up / down) or a multiple of 4. Texture compression formats (ETC, PVRTC, ASTC) want these sizes.
  - **Filter**: Nearest (pixel art), Bicubic, Mitchell, Lanczos 2, Lanczos 3.
  - **Allow Enlarge**: when off, images are never made bigger.
- **Pad / Extend Canvas**: per-side padding. The new area is filled with a color (alpha allowed), copied edge pixels, a mirror, or a repeat.
- **Color Adjust**: brightness, contrast, saturation, hue, grayscale, and a multiply tint. Double-click a slider to reset it.
- **Alpha**
  - **Alpha Bleed**: fills the color of fully transparent pixels from their neighbours. The image looks the same, but filtering and mipmaps stop pulling dark fringes into sprite edges.
  - **Premultiply Alpha**: multiplies RGB by alpha.

### Format & Compression

- **PNG**
  - Lossless by default (zlib level 0-9). Images with 256 colors or fewer are also tried as an exact indexed PNG, and the smaller file is kept.
  - **Palette (Quantise)** gives much smaller PNGs: max colors 2-256, quality, dither, effort (libimagequant).
- **JPG**: quality, 4:2:0 / 4:4:4 chroma, progressive, mozjpeg, and a background color for transparent pixels.
- **WebP**: quality, lossless, near-lossless, alpha quality, effort.
- **AVIF**: quality, lossless, chroma, effort.
  - Cocos does not import AVIF as a texture. Use it only for files loaded outside the asset pipeline.
- **Keep If Not Smaller**: when an image is only re-encoded to the same format and the result is not smaller, the file is left alone. This is on by default.

### Preview

- **Split** shows Before | After; drag the divider. **Before** and **After** show one image each.
- Mouse wheel zooms around the cursor; drag to pan. **F** or the fit button fits the image; **1:1** shows actual pixels.
- The bar under the preview shows the size, format and file size before and after, the % change, and POT / x4 / NPOT.
- A resized result is drawn at the original's scale, so quality can be compared pixel for pixel.

### Output

- **Overwrite**
  - Replaces the file. The `.meta` (uuid, import settings, sub-assets) is untouched, then asset-db `refresh-asset` reimports the file.
  - If the format changes (for example PNG to WebP), the file is renamed together with its `.meta` through asset-db `move-asset`. The uuid stays, so references in scenes and prefabs survive.
  - Originals are copied to `temp/media-utils/backup/<session>/` first. The last 20 sessions are kept.
- **Save as Copy**
  - Writes `<name><suffix>.<ext>` next to the source, or into a chosen folder. The name is numbered if it is taken.
  - Inside the project the copy goes through asset-db `import-asset`, so it gets its own `.meta` and is imported.
- **Apply to Current** / **Apply to All (N)**: runs the batch with a progress bar. A batch can be cancelled between files.
- **Restore Last** undoes the newest overwrite session, renaming files back if their format changed. It is in the toolbar and in the Extension menu.

## Audio Editor

### Waveform and transport

- Stereo shows two lanes (L / R); mono shows one.
- Zoomed out, each pixel column shows the min / max of its samples. Zoomed in far enough, it draws a line through the samples, with dots per sample.
- **Mouse wheel**: zoom around the cursor. **Shift + wheel**: scroll. **Alt + wheel**: vertical zoom.
- The scrollbar is under the waveform. The toolbar has Zoom In / Out, **Zoom to Selection** (Ctrl+E) and **Fit** (Ctrl+F).
- Transport:

| Action | Key |
|---|---|
| Play / Stop | Space |
| Pause | P |
| Play looped | Shift+Space |
| Skip to start / end | Home / End |

- **Play Selection** and the **Loop** toggle are toolbar buttons.
- When Loop is on, playback repeats:
  - the selection;
  - or, with no selection, the loop region;
  - or else the whole file.
- The playhead pages along during playback. Clicking the ruler moves the cursor, and also the playback if it is playing.

### Selection

- Drag on the waveform to select. **Shift + click** extends the selection; dragging an edge of the selection resizes it.
- **Ctrl+A** selects all. **Esc** collapses the selection to a cursor.
- **Snap to zero crossings** (toolbar toggle, on by default) moves the selection edges to the nearest zero crossing (within 10 ms) of the summed channels, so cuts do not click.
- The bottom bar shows the sample rate, channels and length. Selection **Start / End / Length** can be typed there (`1:02.5`, `62.5`, `0:01:02.500`).

### Edits

All edits can be undone and redone at many levels.

| Edit | Key |
|---|---|
| Cut / Copy / Paste | Ctrl+X / Ctrl+C / Ctrl+V |
| Delete | Delete or Backspace |
| Trim to Selection | Ctrl+T |
| Silence / Insert Silence | Ctrl+L |
| Duplicate | Ctrl+D |
| Undo / Redo | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z |

- Paste replaces the selection, or inserts at the cursor.
- Clips copied from another file are converted to this file's sample rate and channel count.
- **Silence** with a selection makes it silent. Without one, it inserts N seconds at the cursor.
- **Duplicate** inserts a copy right after the selection.
- The undo history keeps only the replaced samples, not a copy of the whole file per step.

### Effects

Effects apply to the selection, or to the whole file when nothing is selected. They run in a Web Worker, so the editor stays responsive.

| Effect | Notes |
|---|---|
| Amplify | Gain in dB, optional clipping. Shows the current peak and the maximum gain without clipping. |
| Normalize | Peak target in dB, optional DC removal, per-channel option. |
| Fade In / Fade Out | Over the selection. Curves: linear, exponential, logarithmic, S-curve. |
| Noise Gate | Threshold, reduction, attack, hold, release. Channels are linked, with look-ahead. |
| Trim Silence | Removes leading and/or trailing silence below a threshold, keeping some padding. |
| Reverse, Remove DC Offset | |
| Change Speed | Tempo and pitch change together (band-limited resampling, like a tape). |
| Change Tempo | Changes the length and keeps the pitch (WSOLA time-stretch). |
| Change Pitch | Changes the pitch and keeps the length: WSOLA time-stretch, then resampling. Clean on voice and SFX; big shifts on dense music sound slightly phasey. |
| Convert to Mono / Stereo, Resample | Whole file. Resampling is windowed-sinc. |

### Markers and loop

- **Ctrl+M** (or the marker button) adds a marker at the cursor, or at the playhead while playing.
- Markers appear in the ruler and on the waveform. Drag them in the ruler; double-click one to rename it. The side panel lists them with rename, go-to and delete.
- **Loop**: *Set from Selection* / *Select* / *Clear*. The loop region is drawn as a band in the ruler and as dashed lines on the waveform.
- In WAV files, markers are saved as `cue ` + `LIST/adtl/labl` chunks and the loop as a `smpl` chunk, and both are read back when the file opens. MP3 and OGG exports do not keep them.

### Export

| Format | Options |
|---|---|
| WAV | 16-bit, 24-bit or 32-bit float. |
| MP3 | Constant bitrate (32-320 kbps), or VBR quality V0-V9. MP3 supports only 8 / 11.025 / 12 / 16 / 22.05 / 24 / 32 / 44.1 / 48 kHz; other rates are resampled to the nearest one. |
| OGG Vorbis | Quality -1 to 10. The panel shows the approximate bitrate. |

- **Sample rate**: keep, or resample (8 kHz to 48 kHz). **Channels**: keep, mono or stereo.
- **Overwrite** works as in Image Tools. The uuid is kept, `.wav` to `.ogg` renames the file together with its `.meta`, and the original is backed up.
- **Save as Copy** writes a new file with a suffix, or into a folder.

## How it works

- **Images** are processed in the editor's main process with **the `sharp` that ships with Cocos Creator**. Cocos 3.8.6 has sharp 0.32.6 with libvips 8.14.5 under `resources/app.asar(.unpacked)/node_modules/sharp`.
  - No native module of our own is installed, so there is no Electron ABI mismatch.
  - Input files are read into memory first, so libvips never holds a file open (on Windows an open file would block the overwrite).
  - The pure-JS pixel steps run in a `worker_threads` worker for large images: trim bounds, color adjust, alpha bleed / premultiply, color counting.
- **Audio** is decoded in the panel with Chromium's `decodeAudioData`, at the file's own sample rate. The rate is probed from the MP3, Ogg, MP4 or FLAC header, because decodeAudioData would resample. WAV uses our own decoder, which also reads markers.
  - Effects and encoders run in a Web Worker. If a worker cannot be created, they run on the panel's thread.
  - The encoder `.wasm` files ship in `dist/wasm`.

## Libraries and licences

| Library | Used for | Licence | Shipped |
|---|---|---|---|
| sharp 0.32.6 + libvips 8.14.5 (incl. mozjpeg, libwebp, libheif/aom, libimagequant 2.4.1 BSD fork, libspng/libpng, zlib-ng) | Image decode / resize / encode | sharp: Apache-2.0; libvips and some dependencies: LGPL-3.0 (see sharp's `THIRD-PARTY-NOTICES.md`) | **No**: Cocos' own copy is used at runtime |
| [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) 0.7.0 | JS glue for the encoders | MIT | Yes (bundled into `dist/panels/audio-editor.js`) |
| libvorbis / libogg (Xiph.Org, libVorbis 1.3.7) in `dist/wasm/ogg.wasm` | OGG Vorbis encoding | BSD-3-Clause | Yes |
| **LAME** (3.100) in `dist/wasm/mp3.wasm` | MP3 encoding | **LGPL-2.0-or-later** | Yes, see below |
| Vue 3.5 | Panel UI | MIT | Yes (bundled) |

**MP3 / LAME licence note.** There is no permissively licensed MP3 encoder of usable quality. Every practical one is derived from LAME (LGPL), or is Shine (GPL). The MP3 encoder is therefore isolated:
- LAME is the unmodified `mp3.wasm` binary from wasm-media-encoders. It is a separate file, loaded at runtime, and used only for MP3 export.
- It can be replaced with any compatible build, and deleting it only disables MP3 export.
- `source/shared/audio/encode-mp3.ts` is the only code that loads it.
- Everything else in this extension is permissive (MIT / BSD / Apache).

If you redistribute the extension, keep this notice and offer the LAME source: https://lame.sourceforge.io (wasm build scripts: https://github.com/arseneyr/wasm-media-encoders).

All icons are inline SVGs drawn for this extension.

## Development

```bash
npm install
npm run build      # tsc type check + esbuild bundle into dist/ (+ dist/wasm)
npm test           # node tests: audio edits / effects / codecs, image ops through Cocos' sharp
npm run smoke      # headless Chrome smoke test of both panels with a mocked Editor (after build + test)
```

Tests and environment:
- `npm test` loads sharp from the Cocos install. Set `COCOS_CREATOR` if it is not at `D:\App\cocos\editors\Creator\3.8.6`.
- Outside Electron, sharp's JS dependencies (semver, detect-libc, color-string, ...) only exist inside `app.asar`, so the test runner extracts them once into `tests/out/asar-deps`.
- Sample files come from `MEDIA_UTILS_SAMPLES` (default `E:\Workspace\cocos\MediaUtils\assets`) and are copied to a temp folder; the project's assets are never touched.
- The smoke test drives the real `dist/main.js` through a fake asset-db and saves screenshots to `%TEMP%\media-utils-tests\smoke`.

Source layout:

| Path | Contents |
|---|---|
| `source/main.ts` | Main process: IPC methods, asset-db glue |
| `source/main/` | Sharp loader, image pipeline, pixel worker, output writer + backups |
| `source/assets-menu.ts` | Assets panel context menu |
| `source/shared/audio/` | Document + undo, effects, resampler, WSOLA, WAV, export, analysis (pure TS, tested) |
| `source/shared/image/` | Options, sizing maths, pixel ops (pure TS, tested) |
| `source/panels/` | The two Vue panels, the audio worker, canvas drawing, playback |
