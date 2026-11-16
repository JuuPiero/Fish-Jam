/**
 * Device Simulator data and geometry (pure, no editor or DOM APIs).
 *
 * Every device is described in its portrait orientation, in screen pixels:
 * screen size, screen corner radius, the bezel around the screen, the camera
 * cutout and the safe area insets (what iOS / Android report to a game that
 * hides the status bar). deviceLayout() turns that into the geometry of one
 * orientation. To add a device, add an entry to DEVICES.
 *
 * Values come from the makers' public specs (resolution, point scale, safe
 * area insets). Corner radii, bezels and cutout sizes are close approximations.
 */

export type Orientation = 'portrait' | 'landscapeLeft' | 'landscapeRight';
export type CutoutKind = 'none' | 'notch' | 'island' | 'punch' | 'waterdrop';

export interface Insets {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface DeviceSpec {
    id: string;
    name: string;
    brand: 'Apple' | 'Google' | 'Samsung' | 'Generic';
    /** Screen size in pixels, portrait. */
    width: number;
    height: number;
    /** Pixels per point (iOS) or per dp (Android). */
    scale: number;
    dpi: number;
    /** Rounded corners of the screen, px. */
    screenRadius: number;
    /** Body around the screen, px, portrait. */
    bezel: { side: number; top: number; bottom: number };
    /** Camera cutout, px, portrait, centered horizontally; `top` from the screen's top edge. */
    cutout: { kind: CutoutKind; width: number; height: number; top: number };
    /** A round home button under the screen. */
    homeButton?: boolean;
    /** The iOS home indicator bar. */
    homeIndicator?: boolean;
    /**
     * Safe area insets, px. `landscape` is Landscape Left (the device's top on
     * the left, Unity's convention); Landscape Right mirrors it unless given.
     */
    safe: { portrait: Insets; landscape: Insets; landscapeRight?: Insets };
}

const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

function ins(top: number, bottom: number, left = 0, right = 0): Insets {
    return { top, bottom, left, right };
}

/** iOS insets in points -> px. */
function pt(scale: number, top: number, bottom: number, left = 0, right = 0): Insets {
    return ins(top * scale, bottom * scale, left * scale, right * scale);
}

const NOTCH_IPHONE = (scale: number, top: number) => ({
    portrait: pt(scale, top, 34),
    landscape: pt(scale, 0, 21, top, top),
});

export const DEVICES: DeviceSpec[] = [
    {
        id: 'iphone-se3', name: 'iPhone SE (3rd gen)', brand: 'Apple', width: 750, height: 1334, scale: 2, dpi: 326,
        screenRadius: 0, bezel: { side: 56, top: 220, bottom: 220 }, cutout: { kind: 'none', width: 0, height: 0, top: 0 },
        homeButton: true, safe: { portrait: ZERO, landscape: ZERO },
    },
    {
        id: 'iphone-8', name: 'iPhone 8', brand: 'Apple', width: 750, height: 1334, scale: 2, dpi: 326,
        screenRadius: 0, bezel: { side: 56, top: 220, bottom: 220 }, cutout: { kind: 'none', width: 0, height: 0, top: 0 },
        homeButton: true, safe: { portrait: ZERO, landscape: ZERO },
    },
    {
        id: 'iphone-x', name: 'iPhone X / XS / 11 Pro', brand: 'Apple', width: 1125, height: 2436, scale: 3, dpi: 458,
        screenRadius: 117, bezel: { side: 77, top: 77, bottom: 77 }, cutout: { kind: 'notch', width: 627, height: 90, top: 0 },
        homeIndicator: true, safe: NOTCH_IPHONE(3, 44),
    },
    {
        id: 'iphone-11', name: 'iPhone 11 / XR', brand: 'Apple', width: 828, height: 1792, scale: 2, dpi: 326,
        screenRadius: 83, bezel: { side: 72, top: 72, bottom: 72 }, cutout: { kind: 'notch', width: 460, height: 66, top: 0 },
        homeIndicator: true, safe: NOTCH_IPHONE(2, 48),
    },
    {
        id: 'iphone-13', name: 'iPhone 13 / 14', brand: 'Apple', width: 1170, height: 2532, scale: 3, dpi: 460,
        screenRadius: 142, bezel: { side: 62, top: 62, bottom: 62 }, cutout: { kind: 'notch', width: 486, height: 96, top: 0 },
        homeIndicator: true, safe: NOTCH_IPHONE(3, 47),
    },
    {
        id: 'iphone-14-pro', name: 'iPhone 14 Pro / 15 / 15 Pro / 16', brand: 'Apple', width: 1179, height: 2556, scale: 3, dpi: 460,
        screenRadius: 165, bezel: { side: 50, top: 50, bottom: 50 }, cutout: { kind: 'island', width: 378, height: 112, top: 33 },
        homeIndicator: true, safe: NOTCH_IPHONE(3, 59),
    },
    {
        id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max / 15 Plus', brand: 'Apple', width: 1290, height: 2796, scale: 3, dpi: 460,
        screenRadius: 165, bezel: { side: 52, top: 52, bottom: 52 }, cutout: { kind: 'island', width: 378, height: 112, top: 33 },
        homeIndicator: true, safe: NOTCH_IPHONE(3, 59),
    },
    {
        id: 'iphone-16-pro', name: 'iPhone 16 Pro', brand: 'Apple', width: 1206, height: 2622, scale: 3, dpi: 460,
        screenRadius: 171, bezel: { side: 40, top: 40, bottom: 40 }, cutout: { kind: 'island', width: 378, height: 112, top: 42 },
        homeIndicator: true, safe: NOTCH_IPHONE(3, 62),
    },
    {
        id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', brand: 'Apple', width: 1320, height: 2868, scale: 3, dpi: 460,
        screenRadius: 171, bezel: { side: 42, top: 42, bottom: 42 }, cutout: { kind: 'island', width: 378, height: 112, top: 42 },
        homeIndicator: true, safe: NOTCH_IPHONE(3, 62),
    },
    {
        id: 'ipad-10', name: 'iPad (10th gen)', brand: 'Apple', width: 1640, height: 2360, scale: 2, dpi: 264,
        screenRadius: 36, bezel: { side: 113, top: 111, bottom: 111 }, cutout: { kind: 'none', width: 0, height: 0, top: 0 },
        homeIndicator: true, safe: { portrait: pt(2, 0, 20), landscape: pt(2, 0, 20) },
    },
    {
        id: 'ipad-pro-11', name: 'iPad Pro 11"', brand: 'Apple', width: 1668, height: 2388, scale: 2, dpi: 264,
        screenRadius: 36, bezel: { side: 69, top: 69, bottom: 69 }, cutout: { kind: 'none', width: 0, height: 0, top: 0 },
        homeIndicator: true, safe: { portrait: pt(2, 0, 20), landscape: pt(2, 0, 20) },
    },
    {
        id: 'ipad-pro-12-9', name: 'iPad Pro 12.9"', brand: 'Apple', width: 2048, height: 2732, scale: 2, dpi: 264,
        screenRadius: 36, bezel: { side: 69, top: 69, bottom: 69 }, cutout: { kind: 'none', width: 0, height: 0, top: 0 },
        homeIndicator: true, safe: { portrait: pt(2, 0, 20), landscape: pt(2, 0, 20) },
    },
    {
        id: 'pixel-7', name: 'Pixel 7', brand: 'Google', width: 1080, height: 2400, scale: 2.625, dpi: 416,
        screenRadius: 110, bezel: { side: 42, top: 42, bottom: 50 }, cutout: { kind: 'punch', width: 60, height: 60, top: 36 },
        safe: { portrait: ins(118, 0), landscape: ins(0, 0, 118, 0) },
    },
    {
        id: 'pixel-8', name: 'Pixel 8', brand: 'Google', width: 1080, height: 2400, scale: 2.625, dpi: 428,
        screenRadius: 105, bezel: { side: 40, top: 40, bottom: 46 }, cutout: { kind: 'punch', width: 54, height: 54, top: 40 },
        safe: { portrait: ins(128, 0), landscape: ins(0, 0, 128, 0) },
    },
    {
        id: 'galaxy-s23', name: 'Galaxy S23', brand: 'Samsung', width: 1080, height: 2340, scale: 2.75, dpi: 425,
        screenRadius: 90, bezel: { side: 38, top: 38, bottom: 40 }, cutout: { kind: 'punch', width: 64, height: 64, top: 34 },
        safe: { portrait: ins(105, 0), landscape: ins(0, 0, 105, 0) },
    },
    {
        id: 'galaxy-a14', name: 'Galaxy A14 (waterdrop)', brand: 'Samsung', width: 1080, height: 2408, scale: 2.625, dpi: 401,
        screenRadius: 70, bezel: { side: 35, top: 35, bottom: 90 }, cutout: { kind: 'waterdrop', width: 150, height: 72, top: 0 },
        safe: { portrait: ins(104, 0), landscape: ins(0, 0, 104, 0) },
    },
    {
        id: 'android-16x9', name: 'Generic Android 16:9', brand: 'Generic', width: 1080, height: 1920, scale: 3, dpi: 441,
        screenRadius: 0, bezel: { side: 40, top: 150, bottom: 150 }, cutout: { kind: 'none', width: 0, height: 0, top: 0 },
        safe: { portrait: ZERO, landscape: ZERO },
    },
];

export const DEFAULT_DEVICE_ID = 'iphone-14-pro';

export function findDevice(id: string | undefined | null): DeviceSpec {
    return DEVICES.find((d) => d.id === id) || DEVICES.find((d) => d.id === DEFAULT_DEVICE_ID)!;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** One device in one orientation. Screen coordinates: px, origin at the screen's top-left. */
export interface DeviceLayout {
    device: DeviceSpec;
    orientation: Orientation;
    /** Game resolution in this orientation. */
    screenW: number;
    screenH: number;
    /** Body around the screen, px. */
    frame: Insets;
    /** Whole device, px. */
    totalW: number;
    totalH: number;
    screenRadius: number;
    outerRadius: number;
    /** Cutout box in screen coordinates (rotated with the device), or null. */
    cutout: (Rect & { kind: CutoutKind }) | null;
    /** Home indicator bar in screen coordinates, or null. */
    indicator: Rect | null;
    /** Home button circle in device coordinates (origin at the body's top-left), or null. */
    homeButton: { cx: number; cy: number; r: number } | null;
    /** Safe area insets, px, in this orientation. */
    safe: Insets;
}

/** Portrait rect -> the same rect after turning the device (top to the left / right). */
export function rotateRect(r: Rect, o: Orientation, portraitW: number, portraitH: number): Rect {
    if (o === 'landscapeLeft') return { x: r.y, y: portraitW - (r.x + r.w), w: r.h, h: r.w };
    if (o === 'landscapeRight') return { x: portraitH - (r.y + r.h), y: r.x, w: r.h, h: r.w };
    return { x: r.x, y: r.y, w: r.w, h: r.h };
}

/** Portrait edge insets (bezel) -> the edges after turning the device. */
export function rotateEdges(e: Insets, o: Orientation): Insets {
    if (o === 'landscapeLeft') return { left: e.top, right: e.bottom, top: e.right, bottom: e.left };
    if (o === 'landscapeRight') return { right: e.top, left: e.bottom, top: e.left, bottom: e.right };
    return { ...e };
}

export function safeInsets(d: DeviceSpec, o: Orientation): Insets {
    if (o === 'portrait') return { ...d.safe.portrait };
    const l = d.safe.landscape;
    if (o === 'landscapeLeft') return { ...l };
    return d.safe.landscapeRight ? { ...d.safe.landscapeRight } : { top: l.top, bottom: l.bottom, left: l.right, right: l.left };
}

export function deviceLayout(d: DeviceSpec, o: Orientation): DeviceLayout {
    const portrait = o === 'portrait';
    const screenW = portrait ? d.width : d.height;
    const screenH = portrait ? d.height : d.width;
    const frame = rotateEdges({ top: d.bezel.top, bottom: d.bezel.bottom, left: d.bezel.side, right: d.bezel.side }, o);
    const totalW = screenW + frame.left + frame.right;
    const totalH = screenH + frame.top + frame.bottom;
    let cutout: DeviceLayout['cutout'] = null;
    if (d.cutout.kind !== 'none' && d.cutout.width > 0 && d.cutout.height > 0) {
        const r = rotateRect({ x: (d.width - d.cutout.width) / 2, y: d.cutout.top, w: d.cutout.width, h: d.cutout.height }, o, d.width, d.height);
        cutout = { ...r, kind: d.cutout.kind };
    }
    let indicator: Rect | null = null;
    if (d.homeIndicator) {
        // iOS keeps the bar at the bottom of whatever way the screen is up
        const w = Math.min(screenW * 0.4, 134 * d.scale);
        const h = 5 * d.scale;
        indicator = { x: (screenW - w) / 2, y: screenH - 8 * d.scale - h, w, h };
    }
    let homeButton: DeviceLayout['homeButton'] = null;
    if (d.homeButton) {
        const r = Math.min(d.bezel.bottom * 0.32, d.width * 0.075);
        // centre of the portrait bottom bezel, in body coordinates
        const pcx = d.bezel.side + d.width / 2;
        const pcy = d.bezel.top + d.height + d.bezel.bottom / 2;
        const bodyW = d.width + 2 * d.bezel.side;
        const bodyH = d.height + d.bezel.top + d.bezel.bottom;
        const c = rotateRect({ x: pcx, y: pcy, w: 0, h: 0 }, o, bodyW, bodyH);
        homeButton = { cx: c.x, cy: c.y, r };
    }
    const outerRadius = d.screenRadius > 0 ? d.screenRadius + Math.min(frame.left, frame.top, frame.right, frame.bottom) : Math.min(totalW, totalH) * 0.08;
    return {
        device: d,
        orientation: o,
        screenW,
        screenH,
        frame,
        totalW,
        totalH,
        screenRadius: d.screenRadius,
        outerRadius,
        cutout,
        indicator,
        homeButton,
        safe: safeInsets(d, o),
    };
}

/** Safe area as fractions of the screen size (what the game is told). */
export function safeFractions(l: DeviceLayout): Insets {
    return {
        top: l.safe.top / l.screenH,
        bottom: l.safe.bottom / l.screenH,
        left: l.safe.left / l.screenW,
        right: l.safe.right / l.screenW,
    };
}

/** Safe rect in screen px (origin top-left). */
export function safeRect(l: DeviceLayout): Rect {
    return { x: l.safe.left, y: l.safe.top, w: l.screenW - l.safe.left - l.safe.right, h: l.screenH - l.safe.top - l.safe.bottom };
}

/** A mouse position over the game image (client px) -> (u, v) in the game, y down; `inside` when on the screen. */
export function pointerOnScreen(clientX: number, clientY: number, screen: { left: number; top: number; width: number; height: number }) {
    const u = (clientX - screen.left) / screen.width;
    const v = (clientY - screen.top) / screen.height;
    return { u, v, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

/** SVG path of a cutout in its own portrait box (w x h), black on the screen. */
export function cutoutPath(kind: CutoutKind, w: number, h: number): string {
    const f = (n: number) => (Math.round(n * 100) / 100).toString();
    switch (kind) {
        case 'notch': {
            const r = Math.min(h * 0.6, w / 4);
            return `M0,0 H${f(w)} V${f(h - r)} Q${f(w)},${f(h)} ${f(w - r)},${f(h)} H${f(r)} Q0,${f(h)} 0,${f(h - r)} Z`;
        }
        case 'island': {
            const r = Math.min(h, w) / 2;
            return `M${f(r)},0 H${f(w - r)} A${f(r)},${f(r)} 0 0 1 ${f(w - r)},${f(h)} H${f(r)} A${f(r)},${f(r)} 0 0 1 ${f(r)},0 Z`;
        }
        case 'punch': {
            const r = Math.min(w, h) / 2;
            return `M${f(w / 2 - r)},${f(h / 2)} A${f(r)},${f(r)} 0 1 0 ${f(w / 2 + r)},${f(h / 2)} A${f(r)},${f(r)} 0 1 0 ${f(w / 2 - r)},${f(h / 2)} Z`;
        }
        case 'waterdrop':
            return `M0,0 C${f(w * 0.3)},0 ${f(w * 0.22)},${f(h)} ${f(w / 2)},${f(h)} C${f(w * 0.78)},${f(h)} ${f(w * 0.7)},0 ${f(w)},0 Z`;
        default:
            return '';
    }
}

/** SVG transform that draws the portrait cutout path into its rotated box. */
export function cutoutTransform(o: Orientation, portraitW: number, portraitH: number): string {
    if (o === 'landscapeLeft') return `translate(0 ${portraitW}) rotate(-90)`;
    if (o === 'landscapeRight') return `translate(${portraitH} 0) rotate(90)`;
    return '';
}
