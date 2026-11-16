/**
 * Inline SVG icons (16 x 16, currentColor). Drawn for this extension; no icon
 * font or package, so there is no licence to carry.
 */
const S = (body: string) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const F = (body: string) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">${body}</svg>`;

export const ICONS: Record<string, string> = {
    play: F('<path d="M4 2.5v11l9-5.5z"/>'),
    pause: F('<rect x="3.5" y="2.5" width="3" height="11" rx="0.5"/><rect x="9.5" y="2.5" width="3" height="11" rx="0.5"/>'),
    stop: F('<rect x="3" y="3" width="10" height="10" rx="1"/>'),
    playSel: F('<path d="M5 4v8l6-4z"/><rect x="1.5" y="2" width="1.4" height="12"/><rect x="13.1" y="2" width="1.4" height="12"/>'),
    loop: S('<path d="M3 7V6a2 2 0 0 1 2-2h7"/><path d="M10 2l2 2-2 2"/><path d="M13 9v1a2 2 0 0 1-2 2H4"/><path d="M6 14l-2-2 2-2"/>'),
    toStart: F('<rect x="2.5" y="3" width="1.6" height="10"/><path d="M13 3v10L5 8z"/>'),
    toEnd: F('<rect x="11.9" y="3" width="1.6" height="10"/><path d="M3 3v10l8-5z"/>'),
    cut: S('<circle cx="4.5" cy="11.5" r="2"/><circle cx="11.5" cy="11.5" r="2"/><path d="M6 10L12 2.5M10 10L4 2.5"/>'),
    copy: S('<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 3.5V3a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/>'),
    paste: S('<rect x="3" y="3" width="10" height="11" rx="1"/><path d="M6 3V2h4v1"/><path d="M6 7h4M6 10h4"/>'),
    trash: S('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/>'),
    trim: S('<path d="M2 3v10M14 3v10"/><path d="M5 8h6"/><path d="M7 6l-2 2 2 2M9 6l2 2-2 2"/>'),
    silence: S('<path d="M2 8h12"/><path d="M5 5v6M11 5v6" stroke-dasharray="1.5 1.5"/>'),
    duplicate: S('<rect x="2" y="4" width="6" height="8" rx="1"/><rect x="8.5" y="4" width="6" height="8" rx="1" stroke-dasharray="2 1.2"/>'),
    undo: S('<path d="M4.5 6.5h6a3 3 0 0 1 0 6H7"/><path d="M7 3.5l-3 3 3 3"/>'),
    redo: S('<path d="M11.5 6.5h-6a3 3 0 0 0 0 6H9"/><path d="M9 3.5l3 3-3 3"/>'),
    zoomIn: S('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5M5 7h4M7 5v4"/>'),
    zoomOut: S('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5M5 7h4"/>'),
    zoomFit: S('<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/><path d="M5 8h6"/>'),
    zoomSel: S('<path d="M2 3v10M14 3v10"/><path d="M4.5 8h7M6.5 6l-2 2 2 2M9.5 6l2 2-2 2"/>'),
    snap: S('<path d="M1.5 8c1.5-5 3-5 4.5 0s3 5 4.5 0 3-5 4.5 0"/><path d="M8 2v12" stroke-dasharray="1.5 1.5"/>'),
    marker: F('<path d="M4 1.5h8v6l-4 3-4-3z"/><rect x="7.3" y="10" width="1.4" height="5"/>'),
    open: S('<path d="M2 4.5V12a1 1 0 0 0 1 1h9.5l2-6H5l-2 6"/><path d="M2 4.5V3.5a1 1 0 0 1 1-1h3l1.5 1.5H12a1 1 0 0 1 1 1V7"/>'),
    save: S('<path d="M3 2.5h8l2.5 2.5v8.5H3z"/><path d="M5.5 2.5v3h4v-3M5 13.5V9h6v4.5"/>'),
    folder: S('<path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>'),
    plus: S('<path d="M8 3v10M3 8h10"/>'),
    close: S('<path d="M4 4l8 8M12 4l-8 8"/>'),
    restore: S('<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2.5 2.5v3h3"/><path d="M8 5v3l2 1.5"/>'),
    rotateCw: S('<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M12 1.5V5H8.5"/>'),
    rotateCcw: S('<path d="M3 8a5 5 0 1 0 1.5-3.5"/><path d="M4 1.5V5h3.5"/>'),
    flipH: S('<path d="M8 1.5v13" stroke-dasharray="1.5 1.5"/><path d="M6 4L2 12h4zM10 4l4 8h-4z"/>'),
    flipV: S('<path d="M1.5 8h13" stroke-dasharray="1.5 1.5"/><path d="M4 6l8-4v4zM4 10l8 4v-4z"/>'),
    crop: S('<path d="M4 1.5V12h10.5M1.5 4H12v10.5"/>'),
    arrow: F('<path d="M5 3l6 5-6 5z"/>'),
    split: S('<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M8 1.5v13"/>'),
    image: S('<rect x="2" y="2.5" width="12" height="11" rx="1"/><circle cx="5.5" cy="6" r="1.3"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3"/>'),
    audio: S('<path d="M1.5 8h1.5M4.5 5v6M7 3v10M9.5 5.5v5M12 7v2M14.5 8h0"/>'),
    check: S('<path d="M3 8.5l3 3 7-7"/>'),
    reveal: S('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/>'),
    selection: S('<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/><rect x="5" y="5" width="6" height="6" rx="0.5"/>'),
};

export function icon(name: string): string {
    return ICONS[name] || '';
}
