/**
 * Command lines that open a file at a line in common code editors. The executable is
 * Cocos' "Script Editor" preference when it is set, else VS Code.
 */

export interface Launch {
    cmd: string;
    args: string[];
}

function baseName(p: string): string {
    return (p || '').replace(/\\/g, '/').split('/').pop()!.toLowerCase();
}

/** Splits a command line into arguments (double or single quotes group words). */
export function splitArgs(s: string): string[] {
    const out: string[] = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s || ''))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
    return out;
}

const PLACEHOLDER = /\$\{(file|line|col|column|project|root)\}|\{(file|line|col|column|project|root)\}|%(file|line|col|column|project|root)%|\$\((file|line|col|column|project|root)\)/gi;

export function hasPlaceholders(commandArgument: string): boolean {
    PLACEHOLDER.lastIndex = 0;
    return PLACEHOLDER.test(commandArgument || '');
}

function fill(arg: string, file: string, line: number, col: number, root: string): string {
    return arg.replace(PLACEHOLDER, (_all, a, b, c, d) => {
        const k = String(a || b || c || d).toLowerCase();
        if (k === 'file') return file;
        if (k === 'line') return String(line || 1);
        if (k === 'col' || k === 'column') return String(col || 1);
        return root;
    });
}

export type EditorKind = 'vscode' | 'jetbrains' | 'sublime' | 'notepad++' | 'visualstudio' | 'vim' | 'generic';

export function editorKind(exe: string): EditorKind {
    const b = baseName(exe);
    if (/^(code|code - insiders|codium|vscodium|cursor|windsurf|trae)(\.exe|\.cmd)?$/.test(b) || /visual studio code/i.test(exe)) return 'vscode';
    if (/^(rider|webstorm|idea|phpstorm|pycharm|clion|goland|rubymine)(64)?(\.exe|\.sh|\.bat)?$/.test(b)) return 'jetbrains';
    if (/^(sublime_text|subl|zed|atom)(\.exe)?$/.test(b)) return 'sublime';
    if (/^notepad\+\+(\.exe)?$/.test(b)) return 'notepad++';
    if (/^devenv(\.exe)?$/.test(b)) return 'visualstudio';
    if (/^g?n?vim?(-qt)?(\.exe)?$/.test(b)) return 'vim';
    return 'generic';
}

/**
 * How to open `file` at `line:col` with `exe`. `commandArgument` (Cocos' program setting)
 * is used when it has placeholders such as ${file} / ${line}; otherwise the editor's own
 * "goto" syntax is used.
 */
export function launchFor(exe: string, file: string, line: number, col: number, projectRoot: string, commandArgument = ''): Launch {
    const ln = Math.max(1, line || 1);
    const cl = Math.max(1, col || 1);
    if (commandArgument && hasPlaceholders(commandArgument)) {
        return { cmd: exe, args: splitArgs(commandArgument).map((a) => fill(a, file, ln, cl, projectRoot)) };
    }
    switch (editorKind(exe)) {
        case 'vscode':
            // the project folder first, so the file opens in that workspace window
            return { cmd: exe, args: projectRoot ? [projectRoot, '-g', file + ':' + ln + ':' + cl] : ['-g', file + ':' + ln + ':' + cl] };
        case 'jetbrains':
            return { cmd: exe, args: ['--line', String(ln), '--column', String(cl), file] };
        case 'sublime':
            return { cmd: exe, args: [file + ':' + ln + ':' + cl] };
        case 'notepad++':
            return { cmd: exe, args: ['-n' + ln, '-c' + cl, file] };
        case 'visualstudio':
            return { cmd: exe, args: ['/Edit', file] };
        case 'vim':
            return { cmd: exe, args: ['+' + ln, file] };
        default:
            return { cmd: exe, args: [file] };
    }
}

/** The usual VS Code install folders on Windows / macOS (`code` is often not on the PATH Cocos sees). */
export function vsCodeCandidates(env: Record<string, string | undefined>, platform: string): string[] {
    if (platform === 'win32') {
        const local = env.LOCALAPPDATA || '';
        const pf = env.ProgramFiles || 'C:\\Program Files';
        const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const out: string[] = [];
        if (local) out.push(local + '\\Programs\\Microsoft VS Code\\Code.exe');
        out.push(pf + '\\Microsoft VS Code\\Code.exe', pf86 + '\\Microsoft VS Code\\Code.exe');
        if (local) out.push(local + '\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe', local + '\\Programs\\cursor\\Cursor.exe');
        return out;
    }
    if (platform === 'darwin') {
        return ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code', (env.HOME || '') + '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code', '/usr/local/bin/code', '/opt/homebrew/bin/code'];
    }
    return ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code'];
}

/**
 * Cocos' program setting may be stored as a string (before 3.7) or as {path, commandArgument}.
 */
export function programInfo(v: any): { path: string; commandArgument: string } | null {
    if (!v) return null;
    if (typeof v === 'string') return v.trim() ? { path: v.trim(), commandArgument: '' } : null;
    if (typeof v === 'object' && typeof v.path === 'string' && v.path.trim()) return { path: v.path.trim(), commandArgument: String(v.commandArgument || '') };
    return null;
}
