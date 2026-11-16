/**
 * Styles of the Console Pro panel. Colours come from Cocos' theme variables (and so
 * follow the editor-theme extension); fallbacks are Cocos' dark theme values.
 */
export const STYLE = /* css */ `
:host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
#app { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.cp { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; font-size: 12px; color: var(--color-normal-contrast, #cccccc); background: var(--color-normal-fill, #2b2b2b); outline: none; user-select: none; position: relative; }

/* toolbar */
.cp-toolbar { display: flex; align-items: center; gap: 2px; height: 24px; padding: 0 4px; border-bottom: 1px solid var(--color-normal-border, #050505); background: var(--color-normal-fill-weaker, #3d3d3d); flex: none; overflow: hidden; }
.cp-btn { height: 20px; padding: 0 7px; display: inline-flex; align-items: center; gap: 4px; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 2px; cursor: pointer; font-size: 12px; white-space: nowrap; flex: none; }
.cp-btn:hover { background: var(--color-hover-fill, #525252); }
.cp-btn.on { background: var(--color-active-fill, #1f1f1f); border-color: var(--color-normal-border, #050505); color: var(--color-normal-contrast-important, #ffffff); }
.cp-btn.icon { width: 22px; padding: 0; justify-content: center; }
.cp-btn.drop { width: 14px; padding: 0; justify-content: center; margin-left: -3px; }
.cp-btn svg { flex: none; }
.cp-btn.level { padding: 0 5px; gap: 3px; min-width: 22px; }
.cp-btn.level:not(.on) svg { opacity: 0.35; }
.cp-btn.level:not(.on) .n { opacity: 0.55; }
.cp-sep { width: 1px; height: 16px; margin: 0 3px; background: var(--color-normal-border, #050505); flex: none; }
.cp-grow { flex: 1 1 auto; min-width: 4px; }
.cp-search { position: relative; display: flex; align-items: center; width: 260px; min-width: 110px; flex: 0 1 260px; }
.cp-search input { flex: 1; min-width: 0; height: 18px; padding: 0 50px 0 20px; color: inherit; background: var(--color-normal-fill-important, #1f1f1f); border: 1px solid var(--color-normal-border, #050505); border-radius: 2px; outline: none; font-size: 12px; }
.cp-search input:focus { border-color: var(--color-focus-border, #40aaca); }
.cp-search input.bad { border-color: var(--color-danger-fill, #c73c3c); }
.cp-search .lens { position: absolute; left: 4px; top: 3px; opacity: 0.6; pointer-events: none; }
.cp-search .opts { position: absolute; right: 2px; display: flex; gap: 1px; }
.cp-search .opt { height: 16px; min-width: 16px; padding: 0 2px; display: inline-flex; align-items: center; justify-content: center; font: 11px/16px monospace; border-radius: 2px; cursor: pointer; opacity: 0.55; border: 1px solid transparent; }
.cp-search .opt:hover { opacity: 0.9; background: var(--color-hover-fill, #525252); }
.cp-search .opt.on { opacity: 1; background: var(--color-focus-fill-important, #135c73); color: var(--color-focus-contrast, #ffffff); }
.cp-search .x { cursor: pointer; opacity: 0.6; height: 16px; width: 14px; display: inline-flex; align-items: center; justify-content: center; }
.cp-search .x:hover { opacity: 1; }

/* channel chips */
.cp-chips { display: flex; align-items: center; gap: 3px; height: 22px; padding: 0 4px; border-bottom: 1px solid var(--color-normal-border, #050505); background: var(--color-normal-fill-weaker, #3d3d3d); flex: none; overflow-x: auto; overflow-y: hidden; white-space: nowrap; scrollbar-width: none; }
.cp-chips::-webkit-scrollbar { display: none; }
.cp-chip { height: 16px; padding: 0 6px; display: inline-flex; align-items: center; gap: 4px; border-radius: 8px; border: 1px solid var(--color-normal-border, #050505); background: var(--color-normal-fill, #2b2b2b); cursor: pointer; flex: none; font-size: 11px; }
.cp-chip:hover { background: var(--color-hover-fill, #525252); }
.cp-chip .n { opacity: 0.6; }
.cp-chip.src { border-radius: 2px; }
.cp-chip.hide { opacity: 0.45; text-decoration: line-through; }
.cp-chip.solo { background: var(--color-focus-fill-important, #135c73); color: var(--color-focus-contrast, #ffffff); border-color: var(--color-focus-border, #40aaca); }
.cp-chip.solo .n { opacity: 0.85; }
.cp-chips .label { opacity: 0.55; margin: 0 2px 0 2px; flex: none; font-size: 11px; }
.cp-chips .reset { opacity: 0.7; cursor: pointer; text-decoration: underline; flex: none; font-size: 11px; margin-left: 4px; }

/* list */
.cp-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; position: relative; outline: none; }
.cp-spacer { width: 1px; }
.cp-row { position: absolute; left: 0; right: 0; display: flex; align-items: flex-start; gap: 5px; padding: 0 6px 0 4px; box-sizing: border-box; cursor: default; overflow: hidden; }
.cp-row.odd { background: rgba(128, 128, 128, 0.07); }
.cp-row:hover { background: var(--color-hover-fill-weakest, rgba(128, 128, 128, 0.16)); }
.cp-row.sel { background: var(--color-focus-fill-important, #135c73); color: var(--color-focus-contrast, #ffffff); }
.cp-row.sel mark { background: rgba(255, 255, 255, 0.3); color: inherit; }
.cp-row .ic { flex: none; width: 16px; height: 20px; display: flex; align-items: center; }
.cp-row .tm { flex: none; opacity: 0.6; font-variant-numeric: tabular-nums; line-height: 20px; }
.cp-row .msg { flex: 1 1 auto; min-width: 0; line-height: 20px; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
.cp-list.wrap .cp-row .msg { white-space: pre-wrap; word-break: break-word; line-height: 16px; padding: 2px 0; }
.cp-list.wrap .cp-row .tm { line-height: 20px; }
/* Log Entry > 2..10 Lines (Unity): a 32 px level icon, the message then its stack */
.cp-list.tall .cp-row { align-items: flex-start; border-bottom: 1px solid rgba(128, 128, 128, 0.12); }
.cp-list.tall .cp-row .ic { width: 32px; height: 32px; margin-top: 3px; }
.cp-list.tall .cp-row .ic svg { width: 32px; height: 32px; }
.cp-list.tall .cp-row .msg { line-height: 16px; padding: 4px 0; }
.cp-list.tall .cp-row .tm, .cp-list.tall .cp-row .src { line-height: 16px; padding-top: 4px; }
.cp-list.tall .cp-row .cnt { margin-top: 5px; }
.cp-row .src { flex: none; opacity: 0.5; font-size: 11px; line-height: 20px; }
.cp-row .cnt { flex: none; min-width: 18px; height: 14px; margin-top: 3px; padding: 0 5px; box-sizing: border-box; border-radius: 7px; background: var(--color-normal-fill-emphasis, #555555); color: var(--color-normal-contrast-important, #ffffff); font-size: 10px; line-height: 14px; text-align: center; }
.cp-row.sel .cnt { background: rgba(255, 255, 255, 0.25); }
.cp-row.warn .msg { color: var(--color-warn-fill, #f2c12e); }
.cp-row.error .msg { color: var(--color-danger-fill, #ff6b5e); }
.cp-row.sel.warn .msg, .cp-row.sel.error .msg { color: inherit; }
.cp-colored-off .cp-row .msg { color: inherit !important; }
mark { background: rgba(255, 200, 0, 0.35); color: inherit; border-radius: 1px; }
.cp-empty { position: absolute; left: 0; right: 0; top: 40%; text-align: center; opacity: 0.45; pointer-events: none; }

/* splitter + details */
.cp-split { flex: none; height: 4px; margin-top: -2px; margin-bottom: -2px; cursor: row-resize; z-index: 3; position: relative; }
.cp-details { flex: none; min-height: 40px; display: flex; flex-direction: column; border-top: 1px solid var(--color-normal-border, #050505); background: var(--color-normal-fill-important, #232323); }
.cp-details-head { display: flex; align-items: center; gap: 4px; height: 22px; padding: 0 4px 0 8px; flex: none; border-bottom: 1px solid var(--color-normal-border, #050505); opacity: 0.95; }
.cp-details-head .meta { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.65; font-size: 11px; }
.cp-details-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 8px 8px; user-select: text; cursor: text; }
.cp-details-body .text { white-space: pre-wrap; word-break: break-word; line-height: 16px; margin: 0 0 6px; font-family: inherit; }
.cp-frames { margin: 0; padding: 0; list-style: none; }
.cp-frame { line-height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-frame .fn { opacity: 0.8; }
.cp-frame.internal { opacity: 0.45; }
.cp-frame a { color: var(--color-info-fill, #4ba3e3); cursor: pointer; text-decoration: none; }
.cp-frame a:hover { text-decoration: underline; }
.cp-frame.user a { font-weight: bold; }
.cp-frame .cs { margin-left: 8px; }
.cp-frame .raw { opacity: 0.55; margin-left: 6px; }
.cp-section { margin: 6px 0 2px; opacity: 0.55; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }

/* toast */
.cp-toast { position: absolute; right: 10px; bottom: 10px; max-width: 70%; padding: 4px 10px; border-radius: 2px; background: var(--color-normal-fill-emphasis, #141414); border: 1px solid var(--color-normal-border, #050505); color: var(--color-normal-contrast, #cccccc); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); pointer-events: none; z-index: 20; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
