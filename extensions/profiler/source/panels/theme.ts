/**
 * Chart and window colors. The Cocos editor is dark, so these are the dark
 * steps of the reference data-viz palette, validated against the chart
 * surface (#1a1a19) with the dataviz skill's validator: lightness band,
 * chroma, adjacent CVD separation (worst 8.4), normal-vision floor and 3:1
 * contrast all pass. Categorical slots are used in this fixed order.
 */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

export const INK = {
    surface: '#1a1a19',
    primary: '#f0efec',
    secondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    baseline: '#383835',
};

/** Shared window CSS (editor CSS variables, falling back to the dark ink above). */
export const BASE_CSS = /* css */ `
:host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
#app { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; font-size: 12px; color: var(--color-normal-contrast, ${INK.primary}); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; box-sizing: border-box; }
.pf-toolbar { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1px solid var(--color-normal-border, #222); flex-wrap: wrap; }
.pf-grow { flex: 1; }
.pf-dim { color: var(--color-normal-contrast-weaker, ${INK.muted}); }
.pf-btn { height: 22px; padding: 0 10px; color: inherit; background: var(--color-normal-fill-emphasis, #3b3b3b); border: 1px solid var(--color-normal-border, #222); border-radius: 3px; cursor: pointer; font-size: 12px; }
.pf-btn:hover { background: var(--color-normal-fill, #474747); }
.pf-btn.on { background: #2f5d8a; border-color: #1d3e5e; color: #fff; }
.pf-btn:disabled { opacity: 0.45; cursor: default; }
.pf-select { height: 22px; max-width: 280px; color: inherit; background: var(--color-normal-fill-emphasis, #1f1f1f); border: 1px solid var(--color-normal-border, #191919); border-radius: 2px; font-size: 12px; }
.pf-check { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.pf-empty { padding: 16px; line-height: 1.6; color: var(--color-normal-contrast-weaker, ${INK.secondary}); }
.pf-empty b { color: var(--color-normal-contrast, ${INK.primary}); }
.pf-mono { font-family: var(--font-mono, ui-monospace, Consolas, monospace); font-variant-numeric: tabular-nums; }
.pf-table { width: 100%; border-collapse: collapse; }
.pf-table th { position: sticky; top: 0; background: var(--color-normal-fill, #2b2b2b); color: var(--color-normal-contrast-weaker, ${INK.secondary}); font-weight: normal; text-align: right; padding: 3px 8px; border-bottom: 1px solid var(--color-normal-border, #222); cursor: pointer; user-select: none; white-space: nowrap; }
.pf-table th:first-child, .pf-table td:first-child { text-align: left; }
.pf-table td { padding: 2px 8px; text-align: right; white-space: nowrap; border-bottom: 1px solid rgba(255,255,255,0.03); font-variant-numeric: tabular-nums; }
.pf-table tr.sel td { background: var(--color-focus-fill-important, #2c5d87); color: var(--color-focus-contrast, #fff); }
.pf-table tr:not(.sel):hover td { background: rgba(255,255,255,0.04); }
.pf-caret { display: inline-block; width: 12px; color: ${INK.muted}; cursor: pointer; }
.pf-tip { position: fixed; pointer-events: none; z-index: 10; background: #262625; border: 1px solid rgba(255,255,255,0.10); border-radius: 4px; padding: 6px 8px; font-size: 11px; line-height: 1.5; color: ${INK.primary}; min-width: 140px; }
.pf-tip .row { display: flex; align-items: center; gap: 6px; }
.pf-tip .key { width: 10px; height: 2px; border-radius: 1px; flex: none; }
.pf-tip .v { margin-left: auto; padding-left: 12px; font-variant-numeric: tabular-nums; }
`;
