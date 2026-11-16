import { BASE_STYLE } from '../common/style';

/** Audio Editor styles (on top of the shared base). */
export const AUDIO_STYLE = BASE_STYLE + /* css */ `
.ma { position: relative; }
.ma:focus { outline: none; }
.ma-volume { max-width: 70px; }
.ma-title { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: bold; }
.ma-main { flex: 1 1 auto; min-height: 0; display: flex; }
.ma-track { position: relative; flex: 1 1 auto; min-width: 120px; display: flex; flex-direction: column; background: var(--color-normal-fill-emphasis, #2b2b2b); }
.ma-ruler { flex: none; display: block; width: 100%; height: 34px; cursor: text; }
.ma-waves { position: relative; flex: 1 1 auto; min-height: 40px; cursor: text; overflow: hidden; }
.ma-waves canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
.ma-overlay { pointer-events: none; }
.ma-hscroll { position: relative; flex: none; height: 12px; background: var(--color-normal-fill-important, #262626); border-top: 1px solid var(--color-normal-border, #191919); }
.ma-hscroll .thumb { position: absolute; top: 2px; bottom: 2px; min-width: 16px; border-radius: 3px; background: var(--color-default-fill, #5a5a5a); }
.ma-hscroll .thumb:hover { background: var(--color-hover-fill, #6a6a6a); }
.ma-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.ma-splitter { flex: none; width: 4px; cursor: col-resize; background: var(--color-normal-border, #191919); }
.ma-splitter:hover { background: var(--color-focus-fill-important, #2c5d87); }
.ma-side { flex: none; min-width: 220px; }
.ma-apply-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px 2px 18px; }
.ma-apply-row .mu-btn { flex: none; height: 24px; padding: 0 14px; }
.ma-target { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.75; font-size: 11px; }
.ma-link { cursor: pointer; text-decoration: underline; margin-left: 6px; }
.ma-time { font-family: Consolas, Menlo, monospace; font-size: 11px; }
.ma-dim { opacity: 0.6; }
.ma-markers { padding: 2px 8px 2px 18px; display: flex; flex-direction: column; gap: 2px; }
.ma-marker { display: flex; align-items: center; gap: 6px; }
.ma-marker input { flex: 1 1 auto; }
.ma-marker .ma-time { cursor: pointer; }
.ma-marker .ma-time:hover { text-decoration: underline; }
.ma-marker .x { cursor: pointer; opacity: 0.6; }
.ma-marker .x:hover { opacity: 1; }
.ma-selbar { gap: 10px; flex-wrap: wrap; white-space: nowrap; }
.ma-field { display: inline-flex; align-items: center; gap: 4px; }
.ma-field label { opacity: 0.7; }
.ma-field input[type=text] { width: 86px; font-family: Consolas, Menlo, monospace; font-size: 11px; }
.ma-busy { position: absolute; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.3); }
.ma-busy-box { min-width: 240px; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--color-normal-fill, #383838); border: 1px solid var(--color-normal-border, #191919); border-radius: 3px; }
.ma-busy-box .mu-progress { flex: none; }
.ma-drop { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; background: rgba(0, 0, 0, 0.4); border: 2px dashed var(--color-focus-fill-important, #2c5d87); pointer-events: none; z-index: 40; }
.ma-modal-input { margin-bottom: 12px; }
.ma-modal-input input { width: 100%; }
`;
