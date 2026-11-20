/**
 * C# TS Interop window: which TypeScript C# sees, and the exclude list (a project setting).
 * The stubs regenerate by themselves when .ts files change; this window edits the exclude list
 * and shows the last run.
 */
const PKG = 'csharp';

const TEMPLATE = /* html */ `
<div class="ti">
    <div class="ti-summary"></div>
    <div class="ti-row"><span class="ti-label">Reads</span><span class="ti-dbs"></span></div>
    <div class="ti-head">Exclude</div>
    <textarea class="ti-exclude" spellcheck="false" placeholder="**/Editor/**&#10;db://input-system/**&#10;assets/Legacy"></textarea>
    <div class="ti-hint">
        One pattern per line, matched against <code>db://assets/Scripts/Foo.ts</code> and
        <code>assets/Scripts/Foo.ts</code>. <code>*</code> stays in a folder, <code>**</code> crosses
        folders, a path without wildcards is a folder or a file. Saved in the project settings.
    </div>
    <div class="ti-bar">
        <button class="ti-btn report" title="temp/csharp/ts-bindings-report.txt: what was bound, made dynamic, skipped">Open Report</button>
        <span class="ti-grow"></span>
        <button class="ti-btn regen" title="Read the TypeScript again and recompile the C#">Regenerate</button>
        <button class="ti-btn ti-primary save" disabled>Save</button>
    </div>
    <div class="ti-status"></div>
    <div class="ti-note">
        C# sees the exported classes, interfaces, enums, functions and constants of the project's
        TypeScript (global namespace, no using needed) and of the extensions that mount an asset db
        (<code>using Ext.TweenPro;</code>, functions with <code>using static Ext.TweenPro.Exports;</code>).
        Exported decorators are attributes too: <code>@showIf('mode')</code> is
        <code>[ShowIf("mode")]</code>, except those that duplicate csharp's own attributes (unity-style's
        <code>@Tooltip</code> wraps cc's <code>tooltip</code>, like <code>[Tooltip]</code>): C# keeps the built-in
        one. Names two files export move to their folder's namespace, e.g.
        <code>Project.Scripts.Ui.Button</code>.
    </div>
</div>
`;

const STYLE = /* css */ `
:host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.ti { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 10px; font-size: 12px; color: var(--color-normal-contrast, #ccc); box-sizing: border-box; }
.ti-summary { line-height: 1.5; }
.ti-summary.bad { color: var(--color-danger-fill, #e35252); }
.ti-row { display: flex; gap: 6px; align-items: baseline; }
.ti-label { width: 54px; flex: none; color: var(--color-normal-contrast-emphasis, #999); }
.ti-dbs { flex: 1; min-width: 0; color: var(--color-normal-contrast-emphasis, #999); word-break: break-word; }
.ti-head { margin-top: 4px; font-weight: bold; }
.ti-exclude { flex: 1 1 120px; min-height: 90px; resize: vertical; padding: 4px 6px; color: inherit; background: var(--color-normal-fill-important, #1f1f1f); border: 1px solid var(--color-normal-border, #050505); border-radius: 2px; box-sizing: border-box; font: 12px Consolas, 'Courier New', monospace; line-height: 1.5; }
.ti-exclude:focus { outline: none; border-color: var(--color-focus-border, #3a79bb); }
.ti-hint, .ti-note { color: var(--color-normal-contrast-emphasis, #999); line-height: 1.5; }
.ti-note { margin-top: 6px; }
code { font-family: Consolas, 'Courier New', monospace; color: var(--color-normal-contrast, #ccc); }
.ti-bar { display: flex; gap: 6px; align-items: center; }
.ti-grow { flex: 1; }
.ti-btn { height: 22px; padding: 0 12px; color: inherit; background: var(--color-default-fill, #3d3d3d); border: 1px solid var(--color-default-border, #3d3d3d); border-radius: 2px; cursor: pointer; font: inherit; }
.ti-btn:hover:not(:disabled) { background: var(--color-hover-fill, #525252); }
.ti-btn:disabled { opacity: 0.45; cursor: default; }
.ti-primary { color: var(--color-primary-contrast, #fff); background: var(--color-primary-fill-emphasis, #3a79bb); border-color: var(--color-primary-border-emphasis, #3a79bb); }
.ti-primary:hover:not(:disabled) { background: var(--color-primary-fill, #4c8dd6); }
.ti-status { min-height: 16px; color: var(--color-normal-contrast-emphasis, #999); }
`;

interface View {
    exclude: string[];
    dbs: string[];
    state: { summary: string; error: string; stats: any; excluded: number };
}

type Panel = { $: Record<string, HTMLElement>; _saved: string; _busy: boolean };

function request(method: string, ...args: any[]): Promise<any> {
    return Editor.Message.request(PKG, method, ...args) as Promise<any>;
}

function area(p: Panel): HTMLTextAreaElement {
    return p.$.exclude as HTMLTextAreaElement;
}

function render(p: Panel, v: View, keepText = false) {
    p.$.summary.textContent = v.state.summary;
    p.$.summary.classList.toggle('bad', !!v.state.error);
    p.$.dbs.textContent = v.dbs.map((d) => 'db://' + d).join(', ');
    p._saved = v.exclude.join('\n');
    if (!keepText) area(p).value = p._saved;
    updateSave(p);
}

function updateSave(p: Panel) {
    (p.$.save as HTMLButtonElement).disabled = p._busy || area(p).value.trim() === p._saved.trim();
}

async function run(p: Panel, label: string, work: () => Promise<View>) {
    if (p._busy) return;
    p._busy = true;
    p.$.status.textContent = label;
    (p.$.regen as HTMLButtonElement).disabled = true;
    updateSave(p);
    try {
        render(p, await work());
        p.$.status.textContent = '';
    } catch (e: any) {
        p.$.status.textContent = String((e && e.message) || e);
    } finally {
        p._busy = false;
        (p.$.regen as HTMLButtonElement).disabled = false;
        updateSave(p);
    }
}

module.exports = Editor.Panel.define({
    template: TEMPLATE,
    style: STYLE,
    $: {
        summary: '.ti-summary',
        dbs: '.ti-dbs',
        exclude: '.ti-exclude',
        report: '.report',
        regen: '.regen',
        save: '.save',
        status: '.ti-status',
    },
    ready(this: any) {
        const p = this as Panel;
        p._saved = '';
        p._busy = false;
        area(p).addEventListener('input', () => updateSave(p));
        area(p).addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                (p.$.save as HTMLButtonElement).click();
            }
        });
        p.$.save.addEventListener('click', () => {
            // plain strings only: IPC arguments are cloned
            const lines = area(p).value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
            run(p, 'Saving and regenerating...', () => request('interop-save', lines));
        });
        p.$.regen.addEventListener('click', () => run(p, 'Regenerating...', () => request('interop-regenerate')));
        p.$.report.addEventListener('click', () => request('open-interop-report'));
        request('interop-state')
            .then((v: View) => render(p, v))
            .catch((e: any) => (p.$.status.textContent = String((e && e.message) || e)));
    },
    close() {},
});
