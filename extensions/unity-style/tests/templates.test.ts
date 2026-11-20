import assert from 'assert';
import { test, results } from './harness';
import { classNameFromFile, csMonoBehaviour, isScriptUrl, tsMonoBehaviour } from '../source/templates';

test('class names from file names', () => {
    assert.strictEqual(classNameFromFile('EnemySpawner.ts'), 'EnemySpawner');
    assert.strictEqual(classNameFromFile('enemy spawner.ts'), 'EnemySpawner');
    assert.strictEqual(classNameFromFile('2d-player.cs'), '_2dPlayer');
    assert.strictEqual(classNameFromFile('.ts'), 'NewMonoBehaviour');
});

test('TypeScript template: a @Serializable MonoBehaviour with no spread', () => {
    const t = tsMonoBehaviour('Turret');
    assert.ok(/from 'db:\/\/unity-style\/index'/.test(t));
    assert.ok(/@Serializable\nexport class Turret extends MonoBehaviour \{/.test(t));
    assert.ok(/Update\(dt: number\)/.test(t));
    assert.ok(t.indexOf('...') < 0);
});

test('C# template: the cc and Ext.UnityStyle usings, a MonoBehaviour', () => {
    const t = csMonoBehaviour('Turret');
    assert.ok(/^using cc;$/m.test(t) && /^using static cc\.Globals;$/m.test(t) && /^using Ext\.UnityStyle;$/m.test(t));
    assert.ok(/public class Turret : MonoBehaviour/.test(t));
    assert.ok(/void Update\(double dt\)/.test(t));
});

test('script urls', () => {
    assert.ok(isScriptUrl('db://assets/Scripts/A.ts', 'ts'));
    assert.ok(!isScriptUrl('db://assets/Scripts/A.d.ts', 'ts'));
    assert.ok(!isScriptUrl('db://unity-style/A.ts', 'ts'));
    assert.ok(isScriptUrl('db://assets/A.cs', 'cs'));
    assert.ok(!isScriptUrl('db://assets/A.ts', 'cs'));
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exitCode = 1;
