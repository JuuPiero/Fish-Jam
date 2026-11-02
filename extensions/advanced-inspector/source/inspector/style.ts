/**
 * Styles of the component renderer (injected into its ui-panel shadow root).
 * Cocos' contrast colors run from -weakest (brightest text) to -emphasis
 * (dimmer), e.g. the engine writes on focus-colored buttons with
 * --color-focus-contrast-weakest.
 */
export const style = /* css */ `
:host { display: block; }
.ai-root { display: flex; flex-direction: column; }
.ai-hidden { display: none !important; }

/* ---------------------------------------------------------------- items */
.ai-item { position: relative; min-width: 0; }
.ai-item.ai-tinted { background: var(--ai-tint-bg); box-shadow: inset 2px 0 0 var(--ai-tint); border-radius: 2px; padding-left: 4px; }
.ai-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; min-width: 0; }
.ai-row > ui-prop { margin-top: 0 !important; }
.ai-main { flex: 1 1 auto; min-width: 0; }
.ai-extra { display: flex; align-items: center; gap: 2px; flex: none; }
.ai-extra:empty { display: none; }
.ai-suffix { color: var(--color-normal-contrast-emphasis, #999); font-size: 12px; padding: 0 2px; }
.ai-disabled .ai-custom { opacity: 0.55; pointer-events: none; }

/* ---------------------------------------------------------------- title */
.ai-title { margin: 10px 0 2px; }
.ai-title.line { border-bottom: 1px solid var(--color-normal-border, #444); padding-bottom: 3px; }
.ai-title-text { font-size: 12px; color: var(--color-normal-contrast-weakest, #eee); }
.ai-title-text.bold { font-weight: bold; }
.ai-subtitle { font-size: 11px; margin-top: 1px; color: var(--color-normal-contrast-emphasis, #999); }

/* ------------------------------------------------------------- info box */
.ai-info {
    display: flex; align-items: flex-start; gap: 7px; margin-top: 4px; padding: 6px 8px;
    border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.18);
    font-size: 12px; line-height: 16px; color: var(--color-normal-contrast, #ccc);
    white-space: pre-wrap; word-break: break-word;
}
.ai-info-icon {
    flex: none; width: 16px; height: 16px; border-radius: 50%; color: #fff;
    font: bold 11px/16px sans-serif; text-align: center;
}
.ai-info-info .ai-info-icon { background: #3d7fd6; }
.ai-info-info .ai-info-icon::before { content: 'i'; }
.ai-info-warning { border-color: rgba(217, 164, 0, 0.45); }
.ai-info-warning .ai-info-icon { background: #d9a400; border-radius: 0; clip-path: polygon(50% 0, 100% 100%, 0 100%); line-height: 19px; color: #222; }
.ai-info-warning .ai-info-icon::before { content: '!'; }
.ai-info-error { border-color: rgba(217, 69, 61, 0.55); }
.ai-info-error .ai-info-icon { background: #d9453d; }
.ai-info-error .ai-info-icon::before { content: '\\00d7'; font-size: 13px; }

/* --------------------------------------------------------------- button */
.ai-btn {
    box-sizing: border-box; display: flex; align-items: center; justify-content: center;
    width: 100%; height: 24px; padding: 0 8px; margin: 0;
    font-family: inherit; font-size: 12px; color: var(--color-normal-contrast, #ccc);
    background: var(--color-default-fill, #3c3c3c); border: 1px solid var(--color-default-border, #1e1e1e);
    border-radius: var(--size-normal-radius, 3px); outline: none; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ai-btn:hover { filter: brightness(1.18); }
.ai-btn:active { filter: brightness(0.88); }
.ai-btn:focus-visible { border-color: var(--color-focus-border, #2f7de1); }
.ai-btn[disabled] { opacity: 0.45; cursor: default; filter: none; }
.ai-btn.blue { background: #2c66bd; border-color: #1d4686; color: #fff; }
.ai-btn.red { background: #b5433b; border-color: #7f2c26; color: #fff; }
.ai-btn.green { background: #3d8a47; border-color: #2a6031; color: #fff; }
.ai-btn.tint { background: var(--ai-tint); color: #fff; }
.ai-method { margin-top: 4px; }
.ai-inline { width: auto; height: 20px; padding: 0 6px; }

/* --------------------------------------------------------------- groups */
.ai-box { margin-top: 6px; border: 1px solid var(--color-normal-border, #1d1d1d); border-radius: 3px; background: rgba(0, 0, 0, 0.12); }
.ai-box-header {
    padding: 3px 6px; font-size: 12px; font-weight: bold; color: var(--color-normal-contrast-weakest, #eee);
    background: rgba(255, 255, 255, 0.05); border-bottom: 1px solid var(--color-normal-border, #1d1d1d);
}
.ai-box-body { padding: 0 6px 6px; }

.ai-foldout { margin-top: 4px; }
.ai-foldout-body { padding-bottom: 4px; }

.ai-tabs { margin-top: 6px; border: 1px solid var(--color-normal-border, #1d1d1d); border-radius: 3px; background: rgba(0, 0, 0, 0.12); }
.ai-tabbar { display: flex; background: rgba(0, 0, 0, 0.2); border-bottom: 1px solid var(--color-normal-border, #1d1d1d); }
.ai-tab {
    flex: 1 1 0; min-width: 0; padding: 4px 6px; font-size: 12px; text-align: center; cursor: pointer;
    color: var(--color-normal-contrast-emphasis, #999); border-bottom: 2px solid transparent;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ai-tab:hover { color: var(--color-normal-contrast, #ccc); }
.ai-tab.active { color: var(--color-normal-contrast-weakest, #fff); font-weight: bold; background: rgba(255, 255, 255, 0.06); border-bottom-color: var(--color-focus-border, #2f7de1); }
.ai-tabpage { padding: 0 6px 6px; }
.ai-tabpage:not(.active) { display: none; }

/* Bottom-aligned, so a title or space above one member keeps the fields in line. */
.ai-hgroup { display: flex; gap: 6px; align-items: flex-end; min-width: 0; }
.ai-hgroup > * { flex: 1 1 0; min-width: 0; }
.ai-bgroup { display: flex; gap: 2px; margin-top: 4px; min-width: 0; }
.ai-bgroup > * { flex: 1 1 0; min-width: 0; }
.ai-bgroup .ai-method { margin-top: 0; }

/* ---------------------------------------------------------- progress bar */
.ai-progress {
    position: relative; flex: 1; height: 18px; border-radius: 2px; overflow: hidden; cursor: ew-resize;
    background: rgba(0, 0, 0, 0.35); border: 1px solid var(--color-normal-border, #1a1a1a);
}
.ai-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ai-bar, #4caf50); }
.ai-progress-text {
    position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none;
    font-size: 11px; line-height: 18px; text-align: center; color: #fff; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}

/* -------------------------------------------------------- min max slider */
.ai-minmax { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.ai-minmax ui-num-input { width: 56px; flex: none; }
.ai-mm-track { position: relative; flex: 1; min-width: 40px; height: 18px; cursor: pointer; }
.ai-mm-rail { position: absolute; left: 0; right: 0; top: 8px; height: 3px; border-radius: 2px; background: rgba(0, 0, 0, 0.45); }
.ai-mm-range { position: absolute; top: 8px; height: 3px; background: var(--color-focus-fill, #2f7de1); }
.ai-mm-thumb {
    position: absolute; top: 3px; width: 8px; height: 12px; margin-left: -4px; border-radius: 2px;
    background: #d0d0d0; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
}

/* ------------------------------------------------------- toggle buttons */
.ai-toggles { display: flex; flex: 1; min-width: 0; }
.ai-toggle { height: 20px; flex: 1 1 0; min-width: 0; border-radius: 0; margin-left: -1px; }
.ai-toggle:first-child { margin-left: 0; border-top-left-radius: 3px; border-bottom-left-radius: 3px; }
.ai-toggle:last-child { border-top-right-radius: 3px; border-bottom-right-radius: 3px; }
.ai-toggle.on { background: var(--color-focus-fill, #2f7de1); border-color: var(--color-focus-border, #1d5fb8); color: #fff; }

.ai-dropdown { flex: 1; min-width: 0; }

/* ------------------------------------------------------ show in inspector */
.ai-inspect { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
.ai-inspect > ui-prop:first-child { margin-top: 0 !important; }
.ai-ilabel { display: flex; align-items: center; min-width: 0; overflow: hidden; white-space: nowrap; }
.ai-iarrow { flex: none; width: 12px; font-size: 9px; color: var(--color-normal-contrast-emphasis, #999); }
.ai-iarrow.toggle::before { content: '\\25B6'; }
.ai-iarrow.toggle.open::before { content: '\\25BC'; }
.ai-irow-container .ai-ilabel { cursor: pointer; }
.ai-itext { overflow: hidden; text-overflow: ellipsis; }
.ai-icontent { display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0; }
.ai-icontent > ui-num-input, .ai-icontent > ui-input { flex: 1 1 auto; min-width: 0; }
.ai-icontent > ui-checkbox { flex: none; }
.ai-icontent > .ai-ikey { flex: 1 1 auto; }
.ai-idim, .ai-ivalue { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-idim { color: var(--color-normal-contrast-emphasis, #999); }
.ai-ierror { flex: 1 1 auto; color: #e0625b; white-space: normal; }
.ai-ivec { display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0; }
.ai-ivec > ui-num-input { flex: 1 1 0; min-width: 0; }
.ai-iaxis { flex: none; font-size: 11px; color: var(--color-normal-contrast-emphasis, #999); }
.ai-iswatch { flex: none; width: 32px; height: 14px; border-radius: 2px; border: 1px solid var(--color-normal-border, #1b1b1b); }
.ai-iref { flex: none; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; color: var(--color-normal-contrast-weakest, #eee); }
.ai-iref:hover { text-decoration: underline; }
.ai-iref.missing { color: #e0625b; cursor: default; text-decoration: none; }
.ai-iremove { flex: none; width: 20px; height: 20px; padding: 0; font-size: 14px; }
.ai-iadd { flex: none; width: auto; height: 20px; padding: 0 8px; }
`;
