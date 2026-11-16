/**
 * The system clipboard for packages and files (main process).
 *
 * Electron's clipboard.writeBuffer can only write one named format per call
 * (each call replaces the clipboard), and CF_HDROP, the file list Explorer
 * pastes, is a predefined format it cannot name. On Windows the package is
 * therefore put on the clipboard through .NET (PowerShell): a file drop list
 * (CF_HDROP, plus FileNameW that Windows adds) and our text, in one write.
 * Elsewhere, or when that fails, Electron writes the text, or the FileNameW
 * buffer alone.
 */
import { execFile } from 'child_process';
import { decodeClipboardText, decodeFileNameW, encodeFileNameW } from './shared/package';

// .NET calls only, no cmdlet: a cmdlet makes PowerShell load (and on first use index) its modules, seconds slower
const LOAD_FORMS = "$ProgressPreference = 'SilentlyContinue'; [void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')";

const WRITE_PS = [
    LOAD_FORMS,
    '$files = [System.Collections.Specialized.StringCollection]::new()',
    'foreach ($p in ($env:PB_CLIP_FILES -split [char]10)) { if ($p) { [void]$files.Add($p) } }',
    '$d = [System.Windows.Forms.DataObject]::new()',
    'if ($files.Count) { $d.SetFileDropList($files) }',
    'if ($env:PB_CLIP_TEXT) { $d.SetText($env:PB_CLIP_TEXT, [System.Windows.Forms.TextDataFormat]::UnicodeText) }',
    '[System.Windows.Forms.Clipboard]::SetDataObject($d, $true)',
].join('\n');

const READ_FILES_PS = [
    LOAD_FORMS,
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'foreach ($f in [System.Windows.Forms.Clipboard]::GetFileDropList()) { [Console]::Out.WriteLine($f) }',
].join('\n');

function powershell(script: string, env: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
        const enc = Buffer.from(script, 'utf16le').toString('base64');
        execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
            { env: Object.assign({}, process.env, env), timeout: 15000, windowsHide: true, encoding: 'utf8' },
            (err, stdout) => (err ? reject(err) : resolve(String(stdout || ''))),
        );
    });
}

function electronClipboard(): any {
    return require('electron').clipboard;
}

/**
 * Puts files and a text on the clipboard. Returns how: 'files+text' (Explorer
 * can paste the files), 'filename' (FileNameW only, one file) or 'text'.
 */
export async function writeClipboard(files: string[], text: string): Promise<'files+text' | 'filename' | 'text'> {
    const cb = electronClipboard();
    if (process.platform === 'win32') {
        try {
            await powershell(WRITE_PS, { PB_CLIP_FILES: files.join('\n'), PB_CLIP_TEXT: text });
            if (decodeClipboardText(cb.readText()) === decodeClipboardText(text)) return 'files+text';
        } catch (e) {
            console.warn('[Project Browser] Could not put the files on the clipboard with PowerShell:', e);
        }
        if (files.length) {
            try {
                cb.writeBuffer('FileNameW', encodeFileNameW(files[0]));
                return 'filename';
            } catch (e) {
                // fall back to text
            }
        }
    }
    cb.writeText(text);
    return 'text';
}

/** What is on the clipboard: our package text, or files (copied in Explorer), or nothing we use. */
export async function readClipboard(): Promise<{ text: string; packagePath: string; files: string[] }> {
    const cb = electronClipboard();
    let text = '';
    try {
        text = cb.readText() || '';
    } catch (e) {
        text = '';
    }
    const packagePath = decodeClipboardText(text);
    let files: string[] = [];
    if (!packagePath && process.platform === 'win32') {
        let one = '';
        try {
            one = decodeFileNameW(cb.readBuffer('FileNameW'));
        } catch (e) {
            one = '';
        }
        if (one) {
            // FileNameW holds the first file only: the whole list comes from CF_HDROP
            try {
                files = (await powershell(READ_FILES_PS, {}))
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter((s) => !!s);
            } catch (e) {
                files = [];
            }
            if (!files.length) files = [one];
        }
    }
    return { text, packagePath, files };
}
