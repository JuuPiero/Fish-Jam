/**
 * Script templates of Create > Unity Style. Pure (no editor API): tested in node.
 *
 * The TypeScript template has no spread or rest syntax, like all gameplay code here.
 */

/** A class name from a file name: "enemy spawner.ts" -> "EnemySpawner", "2d-player" -> "_2dPlayer". */
export function classNameFromFile(fileName: string, fallback = 'NewMonoBehaviour'): string {
    const base = fileName.replace(/\.(ts|cs)$/i, '');
    const parts = base.split(/[^A-Za-z0-9_]+/).filter((p) => p.length > 0);
    let name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    if (!name) name = fallback;
    if (/^[0-9]/.test(name)) name = '_' + name;
    return name;
}

export type ScriptKind = 'ts' | 'cs';

/** The TypeScript MonoBehaviour template. */
export function tsMonoBehaviour(className: string): string {
    return [
        "import { Node } from 'cc';",
        "import { MonoBehaviour, Serializable, SerializeField, Debug } from 'db://unity-style/index';",
        '',
        '@Serializable',
        `export class ${className} extends MonoBehaviour {`,
        '    @SerializeField speed = 1;',
        '    @SerializeField(Node) target: Node | null = null;',
        '',
        '    Start() {',
        '    }',
        '',
        '    Update(dt: number) {',
        '    }',
        '}',
        '',
    ].join('\n');
}

/** The C# MonoBehaviour template (the csharp extension compiles it to TypeScript). */
export function csMonoBehaviour(className: string): string {
    return [
        'using System.Collections;',
        'using cc;',
        'using static cc.Globals;',
        'using Ext.UnityStyle;',
        '',
        `public class ${className} : MonoBehaviour`,
        '{',
        '    [SerializeField] private double speed = 1;',
        '    [SerializeField] private Node target;',
        '',
        '    void Start()',
        '    {',
        '    }',
        '',
        '    void Update(double dt)',
        '    {',
        '    }',
        '}',
        '',
    ].join('\n');
}

export function templateFor(kind: ScriptKind, className: string): string {
    return kind === 'cs' ? csMonoBehaviour(className) : tsMonoBehaviour(className);
}

/** db://assets/... with the right extension for the kind. */
export function isScriptUrl(url: string, kind: ScriptKind): boolean {
    return /^db:\/\/assets\//.test(url) && (kind === 'cs' ? /\.cs$/i : /\.ts$/i).test(url) && !/\.d\.ts$/i.test(url);
}
