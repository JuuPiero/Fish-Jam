/**
 * Asset icons of the Project window, drawn for this extension in the manner of
 * Unity's Project window (gray folders, blue prefab cube, script pages with a
 * language badge, shaded material sphere...). Original artwork: no Unity or
 * third-party icon images are used, and nothing is fetched at runtime.
 *
 * Grays use currentColor, so they follow the editor theme (light gray on the
 * dark palettes, dark gray on the light ones). Accents are mid-tones that read
 * on both backgrounds.
 */

function svg(body: string): string {
    return '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
}

// ------------------------------------------------------------------ parts

const FOLDER_BACK = '<path d="M3 8.5C3 7.7 3.7 7 4.5 7H12l2.5 2.5h13c.8 0 1.5.7 1.5 1.5v14.5c0 .8-.7 1.5-1.5 1.5h-23C3.7 27 3 26.3 3 25.5z" fill="currentColor" opacity="0.5"/>';
const FOLDER_FRONT = '<path d="M3 13.5c0-.8.7-1.5 1.5-1.5h23c.8 0 1.5.7 1.5 1.5v12c0 .8-.7 1.5-1.5 1.5h-23c-.8 0-1.5-.7-1.5-1.5z" fill="currentColor" opacity="0.78"/>';
const FOLDER_OPEN_FRONT = '<path d="M7 13.5h22.4c.9 0 1.5.8 1.3 1.6l-2.9 10.7c-.2.7-.8 1.2-1.5 1.2H4.4c-.9 0-1.5-.8-1.3-1.6l2.5-10.7c.2-.7.7-1.2 1.4-1.2z" fill="currentColor" opacity="0.78"/>';
const FOLDER_EMPTY =
    '<path d="M3.75 8.5c0-.4.3-.75.75-.75h7.2l2.5 2.5h13.3c.4 0 .75.3.75.75v14.5c0 .4-.3.75-.75.75h-23c-.4 0-.75-.3-.75-.75z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-opacity="0.75" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M4.5 12.75h23" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.2"/>';

/** Isometric cube with three face colors. */
function cube(top: string, left: string, right: string): string {
    return '<path d="M16 3.5l12 6-12 6-12-6z" fill="' + top + '"/>' + '<path d="M4 9.5l12 6V29L4 23z" fill="' + left + '"/>' + '<path d="M28 9.5V23l-12 6V15.5z" fill="' + right + '"/>';
}

/** Sphere shaded with stacked circles (no gradients: ids would clash in v-html copies). */
function sphere(c0: string, c1: string, c2: string, hi: string): string {
    return (
        '<circle cx="16" cy="16" r="12" fill="' + c0 + '"/>' +
        '<circle cx="14.6" cy="14.6" r="9.2" fill="' + c1 + '"/>' +
        '<circle cx="12.8" cy="12.8" r="5.6" fill="' + c2 + '"/>' +
        '<circle cx="11.4" cy="11.4" r="2.2" fill="' + hi + '"/>'
    );
}

/** Document page with a folded corner. */
const PAGE =
    '<path d="M7 3.5h12l6.5 6.5v18.5H7z" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-opacity="0.85" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M19 3.5V10h6.5" fill="none" stroke="currentColor" stroke-opacity="0.85" stroke-width="1.4" stroke-linejoin="round"/>';

function lines(d: string): string {
    return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.4" stroke-linecap="round"/>';
}

/** Language badge at the bottom right of a page; longer texts get a smaller font so up to 4 letters fit. */
function badge(text: string, bg: string, fg: string): string {
    const size = text.length <= 2 ? 8.6 : text.length === 3 ? 7.2 : 6;
    const y = text.length <= 2 ? 27.6 : text.length === 3 ? 27.2 : 26.8;
    return (
        '<rect x="13" y="19" width="17.5" height="11" rx="2" fill="' + bg + '"/>' +
        '<text x="21.75" y="' + y + '" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="' + size + '" fill="' + fg + '">' + text + '</text>'
    );
}

const BLUE_CUBE = cube('#8CC4F5', '#4A9BE6', '#2F78C2');
const ORANGE = '#E8964A';
const GREEN = '#4E9A55';
const SKY = '#5D8FC4';
const SUN = '#F2C14E';

const PACKAGE =
    '<path d="M4 9l12 5 12-5-12-5z" fill="currentColor" opacity="0.85"/>' +
    '<path d="M4 9v14l12 5V14z" fill="currentColor" opacity="0.62"/>' +
    '<path d="M28 9v14l-12 5V14z" fill="currentColor" opacity="0.42"/>' +
    '<path d="M10 6.5l12 5v5" fill="none" stroke="#C9A36A" stroke-width="2.4"/>';

// ------------------------------------------------------------------ icons

const ICONS: Record<string, string> = {
    Folder: svg(FOLDER_BACK + FOLDER_FRONT),
    FolderOpen: svg(FOLDER_BACK + FOLDER_OPEN_FRONT),
    FolderEmpty: svg(FOLDER_EMPTY),
    Package: svg(PACKAGE),
    PackageLocked: svg(
        PACKAGE +
            '<rect x="19" y="20" width="10" height="8" rx="1.5" fill="#D9A441"/>' +
            '<path d="M21.5 20v-2.3a2.5 2.5 0 0 1 5 0V20" fill="none" stroke="#D9A441" stroke-width="1.8"/>',
    ),
    Prefab: svg(BLUE_CUBE),
    Model: svg(
        cube('#C3D0DC', '#93A7B9', '#6D8499') +
            '<path d="M10 12.5V26M22 12.5V26M4 16.3l12 6 12-6M10 6.5l12 6M22 6.5l-12 6" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="1"/>',
    ),
    Mesh: svg(
        '<path d="M4 9.5L16 3.5 28 9.5 16 15.5z M4 9.5V23L16 29V15.5 M28 9.5V23L16 29 M4 9.5L16 29 M28 9.5L16 29 M4 9.5h24" fill="none" stroke="#6EA6D8" stroke-width="1.4" stroke-linejoin="round"/>' +
            '<g fill="#6EA6D8"><circle cx="16" cy="3.5" r="1.6"/><circle cx="4" cy="9.5" r="1.6"/><circle cx="28" cy="9.5" r="1.6"/><circle cx="16" cy="15.5" r="1.6"/><circle cx="4" cy="23" r="1.6"/><circle cx="28" cy="23" r="1.6"/><circle cx="16" cy="29" r="1.6"/></g>',
    ),
    Material: svg(sphere('#5E6873', '#87919C', '#B0B8C1', '#EEF1F4')),
    PhysicsMaterial: svg(
        sphere('#4F6B45', '#6F8F62', '#97B389', '#E6F0E0') + '<path d="M3 27.5c3-3 5.5-3 8 0" fill="none" stroke="currentColor" stroke-opacity="0.6" stroke-width="1.4" stroke-linecap="round"/>',
    ),
    Script: svg(PAGE + lines('M10 9.5h6M10 13.5h11M10 17h6') + badge('TS', '#3178C6', '#fff')),
    ScriptJS: svg(PAGE + lines('M10 9.5h6M10 13.5h11M10 17h6') + badge('JS', '#E2C13A', '#222')),
    // a dark tile with a light, split-face cube: a "world" document, readable at 16 px on both themes
    Scene: svg(
        '<rect x="3" y="3" width="26" height="26" rx="5" fill="#4A5562"/>' +
            '<path d="M16 7.2l7.6 4.1-7.6 4.1-7.6-4.1z" fill="#FFFFFF"/>' +
            '<path d="M8.4 12.7l6.9 3.8v8.4l-6.9-3.8z" fill="#D3DAE2"/>' +
            '<path d="M23.6 12.7l-6.9 3.8v8.4l6.9-3.8z" fill="#9FACB9"/>',
    ),
    Texture: svg(
        '<rect x="3.5" y="5.5" width="25" height="21" rx="2" fill="' + SKY + '" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.3"/>' +
            '<path d="M4.2 24.5l7.3-9 5 6 3.5-4 7.8 8v.6H4.2z" fill="' + GREEN + '"/>' +
            '<circle cx="21.5" cy="11.5" r="2.6" fill="' + SUN + '"/>',
    ),
    Sprite: svg(
        '<rect x="4" y="4" width="24" height="24" rx="1.5" fill="none" stroke="currentColor" stroke-opacity="0.6" stroke-width="1.3" stroke-dasharray="3 2"/>' +
            '<circle cx="16" cy="11.5" r="4" fill="' + SUN + '"/>' +
            '<path d="M8.5 25c.8-5 3.8-8 7.5-8s6.7 3 7.5 8z" fill="' + SKY + '"/>',
    ),
    SpriteAtlas: svg(
        '<rect x="3.5" y="3.5" width="25" height="25" rx="2" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.3"/>' +
            '<rect x="7" y="7" width="8" height="8" rx="1" fill="' + SKY + '"/><rect x="17" y="7" width="8" height="8" rx="1" fill="' + SUN + '"/>' +
            '<rect x="7" y="17" width="8" height="8" rx="1" fill="' + GREEN + '"/><rect x="17" y="17" width="8" height="8" rx="1" fill="#D9744A"/>',
    ),
    // an animation curve through keyframes on a wide clip tile (fixed colors: same look on both themes)
    AnimationClip: svg(
        '<rect x="2.5" y="5.5" width="27" height="21" rx="3.5" fill="#7D8894"/>' +
            '<path d="M7.5 21C11.3 21 12.2 16 16 16S20.7 11 24.5 11" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>' +
            '<g fill="' + ORANGE + '" stroke="#5A3A1C" stroke-opacity="0.35" stroke-width="0.6">' +
            '<path d="M7.5 17.9l3.1 3.1-3.1 3.1-3.1-3.1z"/><path d="M16 12.9l3.1 3.1-3.1 3.1-3.1-3.1z"/><path d="M24.5 7.9l3.1 3.1-3.1 3.1-3.1-3.1z"/></g>',
    ),
    AnimatorController: svg(
        '<path d="M14 7.5h7.5v4M23.5 19.5v5H16" fill="none" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.4"/>' +
            '<path d="M19.5 10.5h4l-2 2.3z M16.3 22.5v4l-2.3-2z" fill="currentColor" opacity="0.7"/>' +
            '<rect x="3" y="4" width="11" height="7" rx="1.5" fill="' + GREEN + '"/>' +
            '<rect x="18" y="12.5" width="11" height="7" rx="1.5" fill="' + ORANGE + '"/>' +
            '<rect x="3" y="21" width="11" height="7" rx="1.5" fill="currentColor" opacity="0.55"/>',
    ),
    AudioClip: svg(
        '<path d="M5 12.5h5l7-6v19l-7-6H5z" fill="currentColor" opacity="0.8"/>' +
            '<path d="M20.5 12a5.5 5.5 0 0 1 0 8M23.5 9a9.5 9.5 0 0 1 0 14" fill="none" stroke="currentColor" stroke-opacity="0.8" stroke-width="1.6" stroke-linecap="round"/>',
    ),
    VideoClip: svg(
        '<rect x="3" y="7" width="26" height="18" rx="2" fill="currentColor" opacity="0.7"/>' +
            '<path d="M13 11.5v9l8-4.5z" fill="' + ORANGE + '"/>',
    ),
    Font: svg('<text x="16" y="23" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-size="17" font-weight="bold" fill="currentColor">Aa</text>'),
    Shader: svg(
        PAGE +
            lines('M10 9.5h6M10 13.5h8') +
            '<circle cx="21.5" cy="23" r="6.5" fill="#7A5FB0"/><circle cx="20.3" cy="21.8" r="4.4" fill="#9C82D0"/><circle cx="19.2" cy="20.7" r="1.7" fill="#E8E0F8"/>',
    ),
    Json: svg(PAGE + '<text x="16.25" y="21" text-anchor="middle" font-family="Consolas, Menlo, monospace" font-size="10" font-weight="bold" fill="#D9A441">{ }</text>'),
    TextAsset: svg(PAGE + lines('M10 9.5h6M10 13.5h12M10 17.5h12M10 21.5h12M10 25.5h8')),
    Skeleton: svg(
        '<path d="M10.5 10.5l11 11" stroke="currentColor" stroke-opacity="0.8" stroke-width="4" stroke-linecap="round"/>' +
            '<g fill="currentColor" opacity="0.8"><circle cx="7.6" cy="10.4" r="2.8"/><circle cx="10.4" cy="7.6" r="2.8"/><circle cx="21.6" cy="24.4" r="2.8"/><circle cx="24.4" cy="21.6" r="2.8"/></g>',
    ),
    ParticleAsset: svg(
        '<path d="M14 4l2.2 7.8L24 14l-7.8 2.2L14 24l-2.2-7.8L4 14l7.8-2.2z" fill="' + SUN + '"/>' +
            '<path d="M24.5 19l1.1 3.4 3.4 1.1-3.4 1.1-1.1 3.4-1.1-3.4-3.4-1.1 3.4-1.1z" fill="' + ORANGE + '"/>',
    ),
    File: svg(PAGE),
};

// ------------------------------------------------------------------ icons by file extension

/**
 * Files Cocos doesn't know (importer "*") and plain text assets get a page with a badge
 * of their extension: a colour for common kinds, a neutral grey with the extension
 * itself for anything else. [badge text, background, text colour]
 */
const EXT_BADGES: Record<string, [string, string, string]> = {
    cs: ['C#', '#68217A', '#FFFFFF'],
    md: ['MD', '#4A5562', '#FFFFFF'],
    markdown: ['MD', '#4A5562', '#FFFFFF'],
    csv: ['CSV', '#2E7D4F', '#FFFFFF'],
    tsv: ['TSV', '#2E7D4F', '#FFFFFF'],
    xml: ['XML', '#C2662D', '#FFFFFF'],
    yaml: ['YML', '#B84A4A', '#FFFFFF'],
    yml: ['YML', '#B84A4A', '#FFFFFF'],
    toml: ['TOML', '#7A5230', '#FFFFFF'],
    ini: ['INI', '#5F6670', '#FFFFFF'],
    cfg: ['CFG', '#5F6670', '#FFFFFF'],
    conf: ['CONF', '#5F6670', '#FFFFFF'],
    html: ['HTML', '#E0603A', '#FFFFFF'],
    htm: ['HTM', '#E0603A', '#FFFFFF'],
    css: ['CSS', '#2965F1', '#FFFFFF'],
    less: ['LESS', '#1D365D', '#FFFFFF'],
    scss: ['SCSS', '#C6538C', '#FFFFFF'],
    py: ['PY', '#3572A5', '#FFE873'],
    lua: ['LUA', '#2C2D72', '#FFFFFF'],
    java: ['JAVA', '#B07219', '#FFFFFF'],
    kt: ['KT', '#7F52FF', '#FFFFFF'],
    swift: ['SWFT', '#F05138', '#FFFFFF'],
    go: ['GO', '#00ADD8', '#FFFFFF'],
    rs: ['RS', '#B7410E', '#FFFFFF'],
    c: ['C', '#555555', '#FFFFFF'],
    h: ['H', '#555555', '#FFFFFF'],
    cpp: ['C++', '#F34B7D', '#FFFFFF'],
    hpp: ['H++', '#F34B7D', '#FFFFFF'],
    mm: ['OBJC', '#438EFF', '#FFFFFF'],
    sh: ['SH', '#3A3F44', '#89E051'],
    bat: ['BAT', '#3A3F44', '#C1F12E'],
    cmd: ['CMD', '#3A3F44', '#C1F12E'],
    ps1: ['PS1', '#012456', '#FFFFFF'],
    glsl: ['GLSL', '#7A5FB0', '#FFFFFF'],
    hlsl: ['HLSL', '#7A5FB0', '#FFFFFF'],
    vert: ['VERT', '#7A5FB0', '#FFFFFF'],
    frag: ['FRAG', '#7A5FB0', '#FFFFFF'],
    wgsl: ['WGSL', '#7A5FB0', '#FFFFFF'],
    proto: ['PROT', '#4A6FA5', '#FFFFFF'],
    pdf: ['PDF', '#C4302B', '#FFFFFF'],
    doc: ['DOC', '#2B579A', '#FFFFFF'],
    docx: ['DOC', '#2B579A', '#FFFFFF'],
    xls: ['XLS', '#217346', '#FFFFFF'],
    xlsx: ['XLS', '#217346', '#FFFFFF'],
    ppt: ['PPT', '#B7472A', '#FFFFFF'],
    pptx: ['PPT', '#B7472A', '#FFFFFF'],
    zip: ['ZIP', '#8A6D3B', '#FFFFFF'],
    rar: ['RAR', '#8A6D3B', '#FFFFFF'],
    '7z': ['7Z', '#8A6D3B', '#FFFFFF'],
    gz: ['GZ', '#8A6D3B', '#FFFFFF'],
    tar: ['TAR', '#8A6D3B', '#FFFFFF'],
    dll: ['DLL', '#4B4B4B', '#FFFFFF'],
    exe: ['EXE', '#4B4B4B', '#FFFFFF'],
    so: ['SO', '#4B4B4B', '#FFFFFF'],
    a: ['A', '#4B4B4B', '#FFFFFF'],
    jar: ['JAR', '#B07219', '#FFFFFF'],
    apk: ['APK', '#3DDC84', '#1A1A1A'],
    ipa: ['IPA', '#4B4B4B', '#FFFFFF'],
    bin: ['BIN', '#4B4B4B', '#FFFFFF'],
    dat: ['DAT', '#4B4B4B', '#FFFFFF'],
    log: ['LOG', '#5F6670', '#FFFFFF'],
    txt: ['TXT', '#5F6670', '#FFFFFF'],
    blend: ['BLND', '#E87D0D', '#FFFFFF'],
    max: ['MAX', '#0696D7', '#FFFFFF'],
    ma: ['MA', '#0696D7', '#FFFFFF'],
    mb: ['MB', '#0696D7', '#FFFFFF'],
    psd: ['PSD', '#31A8FF', '#001E36'],
    ai: ['AI', '#FF9A00', '#330000'],
    sketch: ['SKCH', '#F7B500', '#1A1A1A'],
    fig: ['FIG', '#A259FF', '#FFFFFF'],
    aseprite: ['ASE', '#7D929E', '#FFFFFF'],
    ase: ['ASE', '#7D929E', '#FFFFFF'],
    tmx: ['TMX', '#5D8FC4', '#FFFFFF'],
    tsx: ['TSX', '#5D8FC4', '#FFFFFF'],
};

/** Lower-case extension of a file name, without the dot ('' when there is none). */
export function extOf(name: string): string {
    const m = /\.([A-Za-z0-9_+-]{1,16})$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
}

/** Whether an extension has its own coloured badge (otherwise the grey extension badge is used). */
export function hasExtBadge(ext: string): boolean {
    return Object.prototype.hasOwnProperty.call(EXT_BADGES, ext);
}

/** The badge of an extension: its own colours, or grey with the (up to 4 letter) extension. */
export function extBadge(ext: string): { text: string; bg: string; fg: string } {
    const b = EXT_BADGES[ext];
    if (b) return { text: b[0], bg: b[1], fg: b[2] };
    const text = ext.toUpperCase().replace(/[^A-Z0-9+#_-]/g, '').slice(0, 4);
    return { text, bg: '#6B7280', fg: '#FFFFFF' };
}

/**
 * The extension whose badge icon an asset shows, or null to keep its type icon:
 * - C# sources (.cs) always;
 * - files Cocos imports as plain assets (importer "*", or the bare cc.Asset type with no drawn icon);
 * - text assets with a well-known extension (.md, .csv, .xml...), plain .txt keeps the text icon.
 */
export function extIconFor(a: { name?: string; importer?: string; type?: string; isDirectory?: boolean }, typeHasIcon: boolean): string | null {
    if (!a || a.isDirectory) return null;
    const ext = extOf(a.name || '');
    if (ext === 'cs') return ext;
    const importer = a.importer || '';
    if (importer === '*' || importer === '' || importer === 'unknown' || (a.type === 'cc.Asset' && !typeHasIcon)) return ext;
    if ((importer === 'text' || a.type === 'cc.TextAsset') && ext && ext !== 'txt' && hasExtBadge(ext)) return ext;
    return null;
}

const extIcons: Record<string, string> = {};

/** A page with the extension's badge; a plain page when there is no extension. */
export function extIconSvg(ext: string): string {
    if (!ext) return ICONS.File;
    if (extIcons[ext]) return extIcons[ext];
    const b = extBadge(ext);
    const body = PAGE + lines('M10 9.5h6M10 13.5h11M10 17h6') + (b.text ? badge(b.text.replace(/&/g, '&amp;').replace(/</g, '&lt;'), b.bg, b.fg) : '');
    return (extIcons[ext] = svg(body));
}

/** Whether there is a drawn icon for a type label (from search.typeLabel). */
export function hasIcon(kind: string): boolean {
    return Object.prototype.hasOwnProperty.call(ICONS, kind);
}

/**
 * SVG markup for a type label (from search.typeLabel) or one of Folder,
 * FolderOpen, FolderEmpty, Package, PackageLocked. `variant` 'js' gives the
 * JavaScript script page. Unknown kinds get a plain page.
 */
export function iconSvg(kind: string, variant?: string): string {
    if (kind === 'Script' && variant === 'js') return ICONS.ScriptJS;
    return ICONS[kind] || ICONS.File;
}

/** All icon names (tests, README preview). */
export function iconNames(): string[] {
    return Object.keys(ICONS);
}
