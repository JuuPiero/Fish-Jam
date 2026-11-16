/**
 * Shared panel styles. Colours come from Cocos' theme variables so the panels
 * follow the editor theme (including the editor-theme extension's palettes).
 * Selection uses --color-focus-fill-important.
 */
export const BASE_STYLE = /* css */ `
:host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
#app { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.mu { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; font-size: 12px; color: var(--color-normal-contrast, #cccccc); background: var(--color-normal-fill, #383838); outline: none; user-select: none; }
.mu * { box-sizing: border-box; }
.mu svg { display: block; flex: none; }

/* toolbar */
.mu-toolbar { display: flex; align-items: center; gap: 3px; min-height: 28px; padding: 3px 6px; border-bottom: 1px solid var(--color-normal-border, #191919); background: var(--color-normal-fill-weaker, #3c3c3c); flex: none; flex-wrap: wrap; }
.mu-sep { width: 1px; align-self: stretch; margin: 2px 4px; background: var(--color-normal-border, #191919); }
.mu-grow { flex: 1 1 auto; min-width: 4px; }
.mu-btn { height: 22px; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; color: inherit; background: var(--color-default-fill, #4a4a4a); border: 1px solid var(--color-default-border, #2a2a2a); border-radius: 2px; cursor: pointer; font-size: 12px; white-space: nowrap; font-family: inherit; }
.mu-btn:hover:not(:disabled) { background: var(--color-hover-fill, #565656); }
.mu-btn:active:not(:disabled) { background: var(--color-active-fill, #2e2e2e); }
.mu-btn.on { background: var(--color-focus-fill-important, #2c5d87); border-color: var(--color-focus-border, #3a72a8); color: var(--color-focus-contrast, #ffffff); }
.mu-btn.icon { width: 24px; padding: 0; }
.mu-btn.primary { background: var(--color-primary-fill, #2c5d87); border-color: var(--color-primary-border, #3a72a8); color: var(--color-primary-contrast, #ffffff); }
.mu-btn.primary:hover:not(:disabled) { background: var(--color-primary-fill-emphasis, #3a72a8); }
.mu-btn:disabled { opacity: 0.45; cursor: default; }
.mu-btn svg { width: 14px; height: 14px; }

/* fields */
.mu input[type=text], .mu input[type=number], .mu select { height: 20px; min-width: 0; padding: 0 4px; color: inherit; background: var(--color-normal-fill-important, #2a2a2a); border: 1px solid var(--color-normal-border, #191919); border-radius: 2px; outline: none; font-size: 12px; font-family: inherit; }
.mu input[type=text]:focus, .mu input[type=number]:focus, .mu select:focus { border-color: var(--color-focus-border, #3a72a8); }
.mu input[type=number] { width: 64px; }
.mu input[type=number]::-webkit-inner-spin-button { opacity: 0.5; }
.mu input[type=checkbox] { margin: 0; accent-color: var(--color-focus-fill-important, #2c5d87); }
.mu input[type=color] { width: 36px; height: 20px; padding: 0 1px; border: 1px solid var(--color-normal-border, #191919); background: var(--color-normal-fill-important, #2a2a2a); border-radius: 2px; }
.mu input[type=range] { -webkit-appearance: none; appearance: none; height: 16px; background: transparent; min-width: 40px; flex: 1 1 auto; }
.mu input[type=range]::-webkit-slider-runnable-track { height: 3px; background: var(--color-normal-fill-important, #2a2a2a); border-radius: 2px; }
.mu input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; margin-top: -3.5px; border-radius: 5px; background: var(--color-normal-contrast, #cccccc); }

/* inspector-like rows */
.mu-row { display: flex; align-items: center; gap: 6px; min-height: 22px; padding: 1px 8px 1px 18px; }
.mu-row > label:first-child, .mu-row > .mu-label { flex: 0 0 38%; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-normal-contrast-emphasis, #bdbdbd); }
.mu-row .mu-val { flex: 1 1 auto; display: flex; align-items: center; gap: 4px; min-width: 0; }
.mu-row .mu-val select, .mu-row .mu-val input[type=text] { flex: 1 1 auto; }
.mu-row .num { width: 52px; text-align: right; }
.mu-hint { padding: 2px 8px 4px 18px; color: var(--color-normal-contrast-weaker, #9a9a9a); font-size: 11px; line-height: 1.35; }
.mu-warn { color: var(--color-warn-fill, #d9a33a); }
.mu-err { color: var(--color-danger-fill, #e05555); }
.mu-ok { color: var(--color-success-fill, #6fbf5f); }

/* foldouts */
.mu-fold { border-bottom: 1px solid var(--color-normal-border, #191919); }
.mu-fold-head { display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 6px; cursor: pointer; background: var(--color-normal-fill-weaker, #3c3c3c); font-weight: bold; }
.mu-fold-head:hover { background: var(--color-hover-fill, #474747); }
.mu-fold-head .arrow { width: 10px; height: 10px; transition: transform 0.1s; opacity: 0.8; }
.mu-fold-head .arrow.open { transform: rotate(90deg); }
.mu-fold-body { padding: 3px 0 6px; }
.mu-fold.off .mu-fold-body { opacity: 0.55; }

/* segmented choice */
.mu-seg { display: inline-flex; }
.mu-seg .mu-btn { border-radius: 0; margin-left: -1px; padding: 0 6px; }
.mu-seg .mu-btn:first-child { border-radius: 2px 0 0 2px; margin-left: 0; }
.mu-seg .mu-btn:last-child { border-radius: 0 2px 2px 0; }

/* progress */
.mu-progress { position: relative; height: 16px; flex: 1 1 auto; background: var(--color-normal-fill-important, #2a2a2a); border: 1px solid var(--color-normal-border, #191919); border-radius: 2px; overflow: hidden; }
.mu-progress > div { position: absolute; left: 0; top: 0; bottom: 0; background: var(--color-focus-fill-important, #2c5d87); }
.mu-progress > span { position: relative; display: block; text-align: center; line-height: 14px; font-size: 11px; }

/* status bar */
.mu-status { display: flex; align-items: center; gap: 8px; min-height: 22px; padding: 2px 8px; border-top: 1px solid var(--color-normal-border, #191919); background: var(--color-normal-fill-weaker, #3c3c3c); flex: none; white-space: nowrap; overflow: hidden; }
.mu-status .msg { overflow: hidden; text-overflow: ellipsis; }

/* modal */
.mu-modal-back { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35); display: flex; align-items: center; justify-content: center; z-index: 50; }
.mu-modal { min-width: 280px; max-width: 80%; padding: 12px; background: var(--color-normal-fill, #383838); border: 1px solid var(--color-normal-border, #191919); border-radius: 3px; }
.mu-modal p { margin: 0 0 12px; line-height: 1.4; white-space: pre-wrap; }
.mu-modal .buttons { display: flex; justify-content: flex-end; gap: 6px; }

.mu-scroll { overflow-y: auto; overflow-x: hidden; min-height: 0; }
.mu-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.mu-scroll::-webkit-scrollbar-thumb { background: var(--color-normal-fill-emphasis, #555555); border-radius: 4px; }
.mu-empty { padding: 16px; text-align: center; color: var(--color-normal-contrast-weaker, #9a9a9a); line-height: 1.5; }
`;
