import { BASE_STYLE } from '../common/style';

/** Image Tools styles (on top of the shared base). */
export const IMAGE_STYLE = BASE_STYLE + /* css */ `
.mi { position: relative; }
.mi-main { flex: 1 1 auto; min-height: 0; display: flex; }
.mi-list { flex: none; min-width: 140px; background: var(--color-normal-fill-emphasis, #2f2f2f); }
.mi-file { padding: 4px 8px; border-bottom: 1px solid var(--color-normal-border, #191919); cursor: pointer; }
.mi-file:hover { background: var(--color-hover-fill, #474747); }
.mi-file.sel { background: var(--color-focus-fill-important, #2c5d87); color: var(--color-focus-contrast, #ffffff); }
.mi-file.sel .mu-ok, .mi-file.sel .mu-warn, .mi-file.sel .mu-err { color: inherit; font-weight: bold; }
.mi-file-name { display: flex; align-items: center; gap: 5px; min-width: 0; }
.mi-file-name .name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi-file-name .badge { flex: none; font-size: 9px; padding: 0 3px; border-radius: 2px; border: 1px solid currentColor; opacity: 0.75; }
.mi-file-name .x { flex: none; opacity: 0; cursor: pointer; }
.mi-file:hover .x { opacity: 0.7; }
.mi-file-name .x:hover { opacity: 1; }
.mi-file-info { display: flex; gap: 8px; font-size: 11px; opacity: 0.8; padding-left: 2px; margin-top: 1px; }
.mi-splitter { flex: none; width: 4px; cursor: col-resize; background: var(--color-normal-border, #191919); }
.mi-splitter:hover { background: var(--color-focus-fill-important, #2c5d87); }
.mi-center { flex: 1 1 auto; min-width: 120px; display: flex; flex-direction: column; }
.mi-viewbar { border-bottom: 1px solid var(--color-normal-border, #191919); }
.mi-zoom { min-width: 44px; text-align: right; opacity: 0.8; }
.mi-busy { opacity: 0.75; font-style: italic; }
.mi-stage { position: relative; flex: 1 1 auto; min-height: 60px; overflow: hidden; cursor: grab;
  background-color: #2b2b2b;
  /* transparency checkerboard */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23363636'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23363636'/%3E%3C/svg%3E");
  background-size: 16px 16px; }
.mi-stage.panning { cursor: grabbing; }
.mi-stage-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.mi-stage-error { position: absolute; left: 8px; bottom: 8px; right: 8px; padding: 4px 6px; background: var(--color-normal-fill, #383838); border-radius: 2px; }
.mi-layer { position: absolute; inset: 0; pointer-events: none; }
.mi-layer img { position: absolute; image-rendering: auto; }
.mi-layer img.pixelated { image-rendering: pixelated; }
.mi-split-line { position: absolute; top: 0; bottom: 0; width: 9px; margin-left: -4px; cursor: ew-resize; display: flex; justify-content: center; }
.mi-split-line::before { content: ''; width: 1px; height: 100%; background: var(--color-normal-contrast, #dddddd); }
.mi-split-line .grip { position: absolute; top: 50%; width: 9px; height: 28px; margin-top: -14px; background: var(--color-normal-contrast, #dddddd); border-radius: 2px; }
.mi-tag { position: absolute; top: 6px; padding: 1px 6px; font-size: 11px; background: rgba(0, 0, 0, 0.55); color: #fff; border-radius: 2px; pointer-events: none; }
.mi-tag.left { left: 6px; }
.mi-tag.right { right: 6px; }
.mi-crop { position: absolute; border: 1px solid #fff; outline: 1px dashed #000; cursor: move; }
.mi-shade { position: absolute; background: rgba(0, 0, 0, 0.5); pointer-events: none; }
.mi-crop .h { position: absolute; width: 9px; height: 9px; background: #fff; border: 1px solid #000; }
.mi-crop .h.nw { left: -5px; top: -5px; cursor: nwse-resize; }
.mi-crop .h.n { left: calc(50% - 5px); top: -5px; cursor: ns-resize; }
.mi-crop .h.ne { right: -5px; top: -5px; cursor: nesw-resize; }
.mi-crop .h.e { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.mi-crop .h.se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.mi-crop .h.s { left: calc(50% - 5px); bottom: -5px; cursor: ns-resize; }
.mi-crop .h.sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.mi-crop .h.w { left: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.mi-crop-size { position: absolute; left: 0; top: -18px; font-size: 11px; color: #fff; text-shadow: 0 0 2px #000; white-space: nowrap; pointer-events: none; }
.mi-compare { gap: 6px; flex-wrap: wrap; white-space: normal; }
.mi-hints { opacity: 0.7; }
.mi-settings { flex: none; min-width: 220px; display: flex; flex-direction: column; background: var(--color-normal-fill, #383838); }
.mi-settings-scroll { flex: 1 1 auto; min-height: 0; }
.mi-apply { flex: none; border-top: 1px solid var(--color-normal-border, #191919); }
.mi-settings .dim { opacity: 0.7; }
.mi-apply { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.mi-apply-buttons { display: flex; gap: 6px; }
.mi-apply-buttons .mu-btn { flex: 1 1 0; height: 26px; }
.mi-progress-row { display: flex; gap: 6px; align-items: center; }
.mi-drop { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; background: rgba(0, 0, 0, 0.4); border: 2px dashed var(--color-focus-fill-important, #2c5d87); pointer-events: none; z-index: 40; }
`;
