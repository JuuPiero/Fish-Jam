/** Inline SVG icons (16 px, flat). Level icons follow Unity's Console colours. */
import { Level } from '../shared/types';

const svg = (body: string, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const LEVEL_ICONS: Record<Level, string> = {
    // speech bubble
    log: svg('<path d="M2.5 3h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5v-2.5H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#c4c4c4"/><rect x="7.25" y="4.6" width="1.5" height="3.6" rx=".5" fill="#2b2b2b"/><rect x="7.25" y="8.9" width="1.5" height="1.4" rx=".5" fill="#2b2b2b"/>'),
    info: svg('<circle cx="8" cy="8" r="6.5" fill="#3d8fd6"/><rect x="7.2" y="7" width="1.6" height="4.8" rx=".5" fill="#fff"/><circle cx="8" cy="4.9" r="1" fill="#fff"/>'),
    warn: svg('<path d="M8 1.6 15 14H1z" fill="#f2c12e" stroke="#f2c12e" stroke-linejoin="round"/><rect x="7.2" y="5.5" width="1.6" height="4.6" rx=".5" fill="#2b2b2b"/><rect x="7.2" y="11" width="1.6" height="1.6" rx=".5" fill="#2b2b2b"/>'),
    error: svg('<path d="M5.3 1.5h5.4l3.8 3.8v5.4l-3.8 3.8H5.3l-3.8-3.8V5.3z" fill="#e0453a"/><rect x="7.2" y="4" width="1.6" height="5.4" rx=".5" fill="#fff"/><rect x="7.2" y="10.4" width="1.6" height="1.6" rx=".5" fill="#fff"/>'),
    success: svg('<circle cx="8" cy="8" r="6.5" fill="#4caf50"/><path d="M4.8 8.2 7 10.4l4.3-4.6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
};

export const ICONS = {
    search: svg('<circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m10 10 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>', 14),
    clock: svg('<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.5V8l2.5 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>', 14),
    wrap: svg('<path d="M2 3.5h12M2 8h9.5a2.25 2.25 0 0 1 0 4.5H8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="m9.5 10.8-1.8 1.7 1.8 1.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>', 14),
    more: svg('<circle cx="8" cy="3.5" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="12.5" r="1.3" fill="currentColor"/>', 14),
    copy: svg('<rect x="5" y="5" width="8.5" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 11V3a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor" stroke-width="1.3"/>', 13),
    open: svg('<path d="M9 2.5h4.5V7M13.3 2.7 7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" fill="none" stroke="currentColor" stroke-width="1.4"/>', 13),
    close: svg('<path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>', 12),
    chevron: svg('<path d="m4.5 6 3.5 3.5L11.5 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', 10),
    solo: svg('<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>', 11),
};
