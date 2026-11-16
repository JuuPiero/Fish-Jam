/**
 * Styles of the Project window. Colors come from Cocos' theme variables,
 * so the window follows the editor theme (including the editor-theme
 * extension's Unity palettes).
 */
export const STYLE = /* css */ `
:host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
#app { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pb { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; font-size: 12px; color: var(--color-normal-contrast, #ccc); outline: none; user-select: none; }

/* toolbar */
.pb-toolbar { display: flex; align-items: center; gap: 4px; height: 26px; padding: 0 6px; border-bottom: 1px solid var(--color-normal-border, #050505); background: var(--color-normal-fill-weaker, #3d3d3d); flex: none; }
.pb-btn { height: 20px; padding: 0 8px; display: inline-flex; align-items: center; gap: 4px; color: inherit; background: var(--color-default-fill, #3d3d3d); border: 1px solid var(--color-default-border, #3d3d3d); border-radius: 2px; cursor: pointer; font-size: 12px; white-space: nowrap; }
.pb-btn:hover { background: var(--color-hover-fill, #525252); }
.pb-btn.on { background: var(--color-focus-fill-important, #135c73); border-color: var(--color-focus-border-emphasis, #227f9b); color: var(--color-focus-contrast-emphasis, #fff); }
.pb-btn.icon { width: 22px; padding: 0; justify-content: center; }
.pb-btn:disabled { opacity: 0.45; cursor: default; }
.pb-grow { flex: 1; min-width: 4px; }
.pb-search { position: relative; display: flex; align-items: center; width: 260px; max-width: 45%; }
.pb-search input { flex: 1; min-width: 0; height: 20px; padding: 0 22px 0 22px; color: inherit; background: var(--color-normal-fill-important, #1f1f1f); border: 1px solid var(--color-normal-border, #050505); border-radius: 10px; outline: none; font-size: 12px; }
.pb-search input:focus { border-color: var(--color-focus-border, #40aaca); }
.pb-search .lens { position: absolute; left: 6px; opacity: 0.6; pointer-events: none; }
.pb-search .clear { position: absolute; right: 4px; width: 16px; height: 16px; line-height: 14px; text-align: center; border-radius: 8px; cursor: pointer; opacity: 0.7; }
.pb-search .clear:hover { opacity: 1; background: var(--color-hover-fill, #525252); }

/* dropdowns */
.pb-drop { position: relative; }
.pb-menu { position: absolute; top: 22px; right: 0; z-index: 20; box-sizing: border-box; min-width: 170px; max-height: 320px; overflow-y: auto; overflow-x: hidden; padding: 3px 0; background: var(--color-normal-fill-emphasis, #141414); border: 1px solid var(--color-normal-border, #050505); border-radius: 2px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
.pb-menu-item { display: flex; align-items: center; gap: 6px; height: 22px; flex: none; padding: 0 10px; cursor: pointer; white-space: nowrap; }
.pb-menu-item:hover { background: var(--color-focus-fill-important, #135c73); color: var(--color-focus-contrast-emphasis, #fff); }
.pb-menu-item .check { width: 12px; text-align: center; }
.pb-menu-sep { height: 1px; margin: 3px 0; background: var(--color-normal-border, #050505); }
.pb-menu-note { padding: 4px 10px; color: var(--color-normal-contrast-emphasis, #8f8f8f); }
.pb-menu input { width: calc(100% - 16px); margin: 4px 8px; height: 20px; padding: 0 4px; color: inherit; background: var(--color-normal-fill-important, #1f1f1f); border: 1px solid var(--color-normal-border, #050505); border-radius: 2px; outline: none; }

/* body */
.pb-body { flex: 1 1 auto; min-height: 0; display: flex; }
.pb-left { flex: none; min-width: 120px; overflow: auto; border-right: 1px solid var(--color-normal-border, #050505); padding: 2px 0; }
.pb-split { flex: none; width: 4px; margin-left: -2px; cursor: col-resize; z-index: 2; }
.pb-right { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }

/* tree */
.pb-row { display: flex; align-items: center; height: 18px; padding-right: 6px; white-space: nowrap; cursor: pointer; }
.pb-row:hover { background: var(--color-hover-fill-emphasis, #2b2b2b); }
.pb-row.sel { background: var(--color-focus-fill-important, #135c73); color: var(--color-focus-contrast-emphasis, #fff); }
/* drop target while dragging (assets, Hierarchy nodes, files): the folder that takes the drop */
.pb .pb-row.drop, .pb .pb-line.drop, .pb .pb-crumb.drop { background: var(--color-focus-fill-emphasis, #1d4f6e); color: var(--color-focus-contrast-emphasis, #fff); box-shadow: inset 0 0 0 1px var(--color-focus-border-emphasis, #3a8fc0); }
.pb-row.head { font-weight: bold; }
.pb-arrow { width: 14px; flex: none; text-align: center; font-size: 9px; opacity: 0.8; }
.pb-row svg, .pb-row ui-icon { flex: none; width: 14px; height: 14px; margin-right: 4px; }
.pb-row .label { overflow: hidden; text-overflow: ellipsis; }
.pb-row .ro { margin-left: 6px; font-size: 10px; color: var(--color-normal-contrast-emphasis, #8f8f8f); }

/* breadcrumb */
.pb-crumbs { display: flex; align-items: center; gap: 2px; height: 22px; padding: 0 6px; border-bottom: 1px solid var(--color-normal-border, #050505); flex: none; overflow: hidden; white-space: nowrap; }
.pb-crumb { padding: 0 3px; border-radius: 2px; cursor: pointer; }
.pb-crumb:hover { background: var(--color-hover-fill, #525252); }
.pb-crumb.last { font-weight: bold; cursor: default; }
.pb-crumb.last:hover { background: none; }
.pb-crumb-sep { opacity: 0.5; }
.pb-scope { display: flex; gap: 2px; margin-left: 6px; }
.pb-scope .pb-btn { height: 18px; padding: 0 6px; font-size: 11px; }

/* items */
.pb-items-wrap { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; position: relative;
  /* grid mascot settings (see .pb-mascot below) */
  --mascot-wall: 4px; --mascot-x: calc(-9.2% - var(--mascot-wall)); --mascot-height: 200px; --mascot-bottom: 0px; --mascot-shy-x: -86%; --mascot-hands-out: 10px; }
.pb-items { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; position: relative; outline: none; }
/* Grid mascot (static/hiding.png, mirrored): she hides behind the folder tree and peeks into the grid; the tree's
   right border is her wall. She never takes clicks and ducks behind the tree when the pointer comes near.
   Two copies of the picture: the body is cut at the divider; the hands copy keeps only the fingers past the wall,
   which rest on the divider over the tree. Settings are on .pb-items-wrap:
   --mascot-wall       where her wall is: px left of the grid's edge. The tree's border line is 1..2 px left of the grid
                       (the splitter overlaps it); 4px puts the picture's own wall outline over it. The body is cut and
                       the hands start exactly there, and the grid keeps its items clear of her (measureMascot reads it).
   --mascot-x          sideways shift; 9.2% of her width is the fingers past the wall in the mirrored picture.
   --mascot-height     her size; also capped at 60% of the grid height.
   --mascot-bottom     lift from the bottom of the grid.
   --mascot-shy-x      where she ducks to when the pointer comes near (-100% = fully behind the tree).
   --mascot-hands-out  how far over the tree the fingers may show. */
.pb-mascot-clip { position: absolute; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none;
  z-index: 1000; /* above everything in the panel, dropdowns (20) included; clicks still go through */ }
.pb-mascot-clip.body { clip-path: inset(0 0 0 calc(0px - var(--mascot-wall))); /* cut at her wall */ }
.pb-mascot-clip.hands { clip-path: inset(0 0 0 calc(0px - var(--mascot-wall) - var(--mascot-hands-out))); }
.pb-mascot { position: absolute; left: 0; bottom: var(--mascot-bottom); height: min(var(--mascot-height), 60%); width: auto; pointer-events: none; user-select: none;
  transform: translateX(var(--mascot-x)) scaleX(-1); transition: transform 0.28s ease-in-out; animation: pb-peek 0.7s ease-out 0.4s backwards; }
/* the fingers past the wall: columns 387..426 of 426, rows 645..837 of 1192 (unmirrored picture); starts at 90%
   instead of 90.85% so it overlaps the body copy by a hair and no seam shows at the wall */
.pb-mascot-clip.hands .pb-mascot { clip-path: inset(53.5% 0 29% 90%); }
.pb-mascot.shy { transform: translateX(var(--mascot-shy-x)) scaleX(-1); }
@keyframes pb-peek { from { transform: translateX(-100%) scaleX(-1); } to { transform: translateX(var(--mascot-x)) scaleX(-1); } }

/* Toolbar mascot (static/undertable.png), in the gap between Create and Search, peeking over the toolbar's bottom border.
   Two copies of the picture: the body is cut at the border (she is behind the "table"); the hands copy keeps only the
   hands (and chin) and may reach a few px past the border, so the hands rest on top of it.
   --peek-x            where in the gap (50% = the middle of the gap between Create and Search).
   --peek-height       size, in % of the toolbar height.
   --peek-y            5.5% puts the picture's own table line on the border.
   --peek-drop         extra push down, so the border runs through the hands (bigger = hands lower over the border).
   --peek-hands-below  how far below the border the hands may show.
   --peek-duck-y       how far she ducks while the pointer is over the gap (100% = fully hidden). */
.pb-peek-gap { --peek-x: 50%; --peek-height: 105.8%; --peek-y: 5.5%; --peek-drop: 1.5px; --peek-hands-below: 6px; --peek-duck-y: 78%;
  position: relative; align-self: stretch; }
.pb-peek-clip { position: absolute; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none; z-index: 1000; /* above everything in the panel; clicks still go through */ }
.pb-peek-clip.body { clip-path: inset(0); }
.pb-peek-clip.hands { clip-path: inset(0 0 calc(-1px - var(--peek-hands-below)) 0); }
.pb-peek { position: absolute; left: var(--peek-x); bottom: 0; height: var(--peek-height); width: auto; pointer-events: none; user-select: none;
  transform: translate(-50%, calc(var(--peek-y) + var(--peek-drop))); transition: transform 0.25s ease-in-out; animation: pb-peek-up 0.6s ease-out 0.8s backwards; }
/* the hands of the picture: rows 372..421 of 421, columns 190..400 of 593 */
.pb-peek-clip.hands .pb-peek { clip-path: inset(88.4% 32.5% 0 32%); }
.pb-peek-gap:hover .pb-peek { transform: translate(-50%, var(--peek-duck-y)); }
@keyframes pb-peek-up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, calc(var(--peek-y) + var(--peek-drop))); } }
.pb-items.drop { box-shadow: inset 0 0 0 2px var(--color-focus-border-emphasis, #227f9b); }
.pb-canvas { position: relative; }
.pb-cell { position: absolute; box-sizing: border-box; padding: 4px; display: flex; flex-direction: column; align-items: center; border-radius: 3px; }
.pb-cell.sub { background: var(--color-normal-fill-important, #1f1f1f); }
.pb .pb-cell.drop { background: var(--color-focus-fill-emphasis, #1d4f6e); box-shadow: inset 0 0 0 1px var(--color-focus-border-emphasis, #3a8fc0); }
.pb-cell.drop .pb-name { color: var(--color-focus-contrast-emphasis, #fff); }
/* ping: an asset shown without selecting it (Inspector reference, new prefab) */
@keyframes pb-ping { 0%, 40% { background: var(--color-warn-fill, #8a6a1c); } 100% { background: transparent; } }
.pb-cell.ping, .pb-line.ping { animation: pb-ping 1.2s ease-out; }
.pb-thumb { position: relative; display: flex; align-items: center; justify-content: center; border-radius: 3px; }
.pb-cell.sel .pb-thumb { background: rgba(64, 128, 200, 0.28); }
.pb-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: auto; }
.pb-thumb svg { width: 70%; height: 70%; }
.pb-thumb ui-icon { font-size: 40px; }
.pb-expand { position: absolute; right: -6px; top: 50%; margin-top: -9px; width: 14px; height: 18px; line-height: 18px; text-align: center; font-size: 9px; border-radius: 2px; background: var(--color-normal-fill-weaker, #3d3d3d); cursor: pointer; }
.pb-expand:hover { background: var(--color-hover-fill-weaker, #525252); }
.pb-name { margin-top: 3px; max-width: 100%; padding: 0 3px; text-align: center; line-height: 14px; font-size: 11px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; border-radius: 2px; }
.pb-cell.sel .pb-name { background: var(--color-focus-fill-important, #135c73); color: var(--color-focus-contrast-emphasis, #fff); }
.pb-rename { width: 100%; height: 18px; margin-top: 2px; padding: 0 3px; font-size: 11px; color: inherit; background: var(--color-normal-fill-important, #1f1f1f); border: 1px solid var(--color-focus-border, #40aaca); border-radius: 2px; outline: none; box-sizing: border-box; }

/* list mode */
.pb-line { position: absolute; left: 0; right: 0; height: 20px; display: flex; align-items: center; gap: 6px; padding: 0 8px; box-sizing: border-box; }
.pb-line:hover { background: var(--color-hover-fill-emphasis, #2b2b2b); }
.pb-line.sel { background: var(--color-focus-fill-important, #135c73); color: var(--color-focus-contrast-emphasis, #fff); }
.pb-line.sub { padding-left: 26px; }
.pb-line .ico { width: 16px; height: 16px; flex: none; display: flex; align-items: center; justify-content: center; }
.pb-line .ico img { max-width: 16px; max-height: 16px; }
.pb-line .ico svg { width: 16px; height: 16px; display: block; }
.pb-line .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-line .ty { width: 110px; flex: none; color: var(--color-normal-contrast-emphasis, #8f8f8f); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-line .fd { width: 40%; flex: none; color: var(--color-normal-contrast-emphasis, #8f8f8f); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-line .pb-rename { margin: 0; flex: 1; }

.pb-empty { padding: 24px; text-align: center; color: var(--color-normal-contrast-emphasis, #8f8f8f); }

/* status bar */
.pb-status { display: flex; align-items: center; gap: 8px; height: 22px; padding: 0 8px; border-top: 1px solid var(--color-normal-border, #050505); flex: none; }
.pb-status .path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-normal-contrast-emphasis, #8f8f8f); }
/* Folder Color > Custom... box */
.pb { position: relative; }
.pb-colorpick { position: absolute; z-index: 2000; width: 200px; padding: 8px; box-sizing: border-box; background: var(--color-normal-fill, #2b2b2b); border: 1px solid var(--color-normal-border, #111); border-radius: 3px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.pb-colorpick-title { margin-bottom: 6px; color: var(--color-normal-contrast-emphasis, #999); }
.pb-colorpick-row { display: flex; align-items: center; gap: 6px; }
.pb-colorpick-row + .pb-colorpick-row { margin-top: 8px; }
.pb-colorpick-row.end { justify-content: flex-end; }
.pb-colorpick input[type=color] { width: 36px; height: 22px; padding: 0; border: 1px solid var(--color-normal-border, #111); border-radius: 2px; background: none; cursor: pointer; }
.pb-colorpick-hex { flex: 1; min-width: 0; height: 20px; padding: 0 5px; box-sizing: border-box; color: inherit; font: 12px Consolas, monospace; background: var(--color-normal-fill-important, #1f1f1f); border: 1px solid var(--color-normal-border, #111); border-radius: 2px; outline: none; }
.pb-btn.primary { color: var(--color-primary-contrast, #fff); background: var(--color-primary-fill-emphasis, #3a79bb); border-color: var(--color-primary-border-emphasis, #3a79bb); }

/* zoom slider: Unity's small slider (thin dark track, small round knob), colors from the editor theme */
.pb-status input[type=range] { -webkit-appearance: none; appearance: none; width: 90px; height: 16px; margin: 0; padding: 0; background: transparent; cursor: pointer; outline: none; }
.pb-status input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: var(--color-normal-fill-important, #1f1f1f); box-shadow: inset 0 0 0 1px var(--color-normal-border, #050505); }
.pb-status input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 10px; height: 10px; margin-top: -3px; border-radius: 50%;
  background: var(--color-normal-contrast-emphasis, #999); border: 1px solid var(--color-normal-border, #050505); box-sizing: border-box; transition: background 0.1s; }
.pb-status input[type=range]:hover::-webkit-slider-thumb { background: var(--color-normal-contrast, #ccc); }
.pb-status input[type=range]:active::-webkit-slider-thumb, .pb-status input[type=range]:focus-visible::-webkit-slider-thumb { background: var(--color-focus-fill-emphasis, var(--color-focus-fill, #3a79bb)); }
.pb-status .path.hint { color: var(--color-normal-contrast, #ccc); }

/* Import Asset Package / Export Package dialogs (inside the panel) */
.pb-modal-back { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.35); }
.pb-modal { display: flex; flex-direction: column; box-sizing: border-box; width: min(620px, calc(100% - 24px)); height: calc(100% - 24px); max-height: 560px; min-height: 0; padding: 8px 10px;
  background: var(--color-normal-fill, #2b2b2b); border: 1px solid var(--color-normal-border, #111); border-radius: 3px; user-select: none; }
.pb-modal-title { flex: none; font-weight: bold; font-size: 13px; margin-bottom: 4px; }
.pb-modal-sub { flex: none; color: var(--color-normal-contrast-emphasis, #999); line-height: 16px; }
.pb-modal-path { flex: none; margin-top: 2px; color: var(--color-normal-contrast-emphasis, #999); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: text; }
.pb-modal-opts { flex: none; display: flex; align-items: center; gap: 12px; margin: 6px 0; flex-wrap: wrap; }
.pb-modal-opts .lbl { color: var(--color-normal-contrast-emphasis, #999); }
.pb-modal-opts label, .pb-modal-foot label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; }
.pb-modal-list { flex: 1 1 auto; min-height: 0; overflow: auto; border: 1px solid var(--color-normal-border, #111); background: var(--color-normal-fill-important, #1f1f1f); padding: 2px 0; }
.pb-pkg-row { display: flex; align-items: center; gap: 5px; height: 20px; padding-right: 6px; white-space: nowrap; }
.pb-pkg-row:hover { background: var(--color-hover-fill-emphasis, #2b2b2b); }
.pb-pkg-row.off .nm, .pb-pkg-row.off .ico { opacity: 0.45; }
.pb-pkg-row.dir .nm { font-weight: bold; }
.pb-pkg-row input[type=checkbox] { margin: 0; flex: none; }
.pb-pkg-row .ico { width: 16px; height: 16px; flex: none; display: flex; align-items: center; justify-content: center; }
.pb-pkg-row .ico svg { width: 16px; height: 16px; display: block; }
.pb-pkg-row .nm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pb-pkg-row .tag { flex: none; font-size: 10px; padding: 0 4px; line-height: 14px; border-radius: 2px; color: var(--color-normal-contrast-emphasis, #999); border: 1px solid var(--color-normal-border, #111); }
.pb-pkg-row .st { flex: none; font-size: 11px; color: var(--color-normal-contrast-emphasis, #999); }
.pb-pkg-row .st.new, .pb-pkg-row .st.folder-new { color: var(--color-success-fill, #4c9a4c); }
.pb-pkg-row .st.changed, .pb-pkg-row .st.moved, .pb-pkg-row .st.taken { color: var(--color-warn-fill, #c99a2e); }
.pb-pkg-row select { flex: none; max-width: 200px; height: 18px; font-size: 11px; color: var(--color-normal-contrast, #ccc); background: var(--color-default-fill, #3d3d3d); border: 1px solid var(--color-default-border, #3d3d3d); border-radius: 2px; outline: none; }
.pb-modal-error { flex: none; margin-top: 4px; color: var(--color-danger-fill, #d05050); user-select: text; }
.pb-modal-foot { flex: none; display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.pb-modal-foot .sum { color: var(--color-normal-contrast-emphasis, #999); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-chip { display: inline-block; padding: 0 5px; margin-left: 4px; border-radius: 7px; font-size: 10px; line-height: 14px; background: var(--color-normal-fill-weaker, #3d3d3d); }
`;
