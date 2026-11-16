import assert from 'assert';
import { fingerprint, LoggerFollower, LoggerRecord, SourceTagger, toEntry } from '../source/main/capture';
import { launchFor, editorKind, programInfo, splitArgs, vsCodeCandidates } from '../source/shared/editor-launch';
import { anySolo, chipPass, compileQuery, cycleChip, highlight, makePredicate } from '../source/shared/filter';
import { entryToText, firstLine, formatTime } from '../source/shared/format';
import { RingBuffer } from '../source/shared/ring';
import { collapseKey, LogStore } from '../source/shared/store';
import { callHead, detectTag, guessSource, headMatches, toLevel } from '../source/shared/tags';
import { Level, LogEntry, Source } from '../source/shared/types';
import { run, test } from './harness';

let nextId = 1;
function E(text: string, level: Level = 'log', source: Source = 'scene', extra: Partial<LogEntry> = {}): LogEntry {
    return Object.assign({ id: nextId++, t: 1700000000000 + nextId, level, text, stack: '', source, tag: detectTag(text) }, extra);
}

// ------------------------------------------------------------------ tags / sources

test('detectTag finds [Tag] prefixes', () => {
    assert.strictEqual(detectTag('[Hot Reload] Swapped 3 methods'), 'Hot Reload');
    assert.strictEqual(detectTag('[C#] assets/A.cs(1,1): error'), 'C#');
    assert.strictEqual(detectTag('  [Media Utils]  ready'), 'Media Utils');
    assert.strictEqual(detectTag('[12:00:01] [Net] connected'), 'Net', 'a leading time is skipped');
    assert.strictEqual(detectTag('[PreviewInEditor] [Game] hi'), 'Game', 'the PIE prefix is not a tag');
    assert.strictEqual(detectTag('PreviewInEditor [Game] hi'), 'Game');
    assert.strictEqual(detectTag('[object Object]'), '');
    assert.strictEqual(detectTag('no tag [Later]'), '');
    assert.strictEqual(detectTag('[a very long tag that is certainly more than forty characters long] x'), '');
    assert.strictEqual(detectTag('[]'), '');
});

test('guessSource by process, PIE prefix and stack hints', () => {
    assert.strictEqual(guessSource('browser', 'x', ''), 'main');
    assert.strictEqual(guessSource('renderer', 'PreviewInEditor hello', ''), 'game');
    assert.strictEqual(guessSource('renderer', 'x', '    at a (pack:///chunks/00/abc.js:1:1)'), 'scene');
    assert.strictEqual(guessSource('renderer', 'x', '    at a (D:\\Cocos\\resources\\app.asar\\builtin\\scene\\dist\\x.js:1:1)'), 'scene');
    assert.strictEqual(guessSource('renderer', 'x', '    at a (packages://project-browser/dist/panels/project.js:1:1)'), 'panel');
    assert.strictEqual(guessSource('renderer', 'x', ''), 'panel');
    assert.strictEqual(guessSource(undefined, 'x', ''), 'main');
});

test('toLevel maps Logger types', () => {
    assert.deepStrictEqual(['log', 'debug', 'info', 'warn', 'warning', 'error', 'success', 'weird'].map(toLevel), ['log', 'log', 'info', 'warn', 'warn', 'error', 'success', 'log']);
});

test('callHead / headMatches pair console calls with records', () => {
    assert.strictEqual(callHead(['Score: %d of %d', 3, 5]), 'Score: ');
    assert.strictEqual(callHead([{ a: 1 }]), '');
    assert.strictEqual(callHead(['plain']), 'plain');
    assert.ok(headMatches('Score: 3 of 5', 'Score: '));
    assert.ok(headMatches('PreviewInEditor Score: 3', 'Score: '));
    assert.ok(headMatches('[Scene] Score: 3', 'Score: '));
    assert.ok(!headMatches('Other', 'Score: '));
    assert.ok(headMatches('anything', ''));
});

// ------------------------------------------------------------------ filter

test('compileQuery: plain, case, regex, invalid regex, ranges', () => {
    const p = compileQuery('err', false, false);
    assert.ok(p.test('An ERROR here') && !p.test('fine'));
    assert.deepStrictEqual(p.ranges('err Err'), [0, 3, 4, 7]);
    const c = compileQuery('Err', false, true);
    assert.ok(!c.test('error') && c.test('Error'));
    const r = compileQuery('fail(ed)?\\b', true, false);
    assert.ok(r.test('It FAILED') && r.test('fail now') && !r.test('failure'));
    const bad = compileQuery('([', true, false);
    assert.ok(bad.error.length > 0);
    assert.ok(bad.test('x (['), 'an invalid regex falls back to plain text');
    const lit = compileQuery('a.b', false, false);
    assert.ok(!lit.test('axb') && lit.test('a.b'), 'plain mode escapes regex characters');
    assert.ok(compileQuery('', false, false).empty);
    assert.deepStrictEqual(compileQuery('^', true, false).ranges('abc'), [], 'empty matches are skipped');
});

test('highlight escapes HTML and marks ranges', () => {
    assert.strictEqual(highlight('<b>err</b>', [3, 6]), '&lt;b&gt;<mark>err</mark>&lt;/b&gt;');
    assert.strictEqual(highlight('a & b', []), 'a &amp; b');
});

test('chips: hide, solo, cycle', () => {
    let s = cycleChip({}, 'Net', false);
    assert.deepStrictEqual(s, { Net: 'hide' });
    s = cycleChip(s, 'Net', false);
    assert.deepStrictEqual(s, {});
    s = cycleChip(s, 'C#', true);
    assert.ok(anySolo(s));
    assert.ok(chipPass(s, 'C#', true) && !chipPass(s, 'Net', true) && !chipPass(s, '', true));
    assert.ok(chipPass({ Net: 'hide' }, '', false) && !chipPass({ Net: 'hide' }, 'Net', false));
});

test('makePredicate combines levels, sources, tags and text', () => {
    const levels = { log: true, info: true, warn: false, error: true, success: true };
    const pred = makePredicate({ levels, tags: { Net: 'hide' }, sources: {} }, compileQuery('hit', false, false));
    assert.ok(pred(E('a hit')));
    assert.ok(!pred(E('a hit', 'warn')), 'level off');
    assert.ok(!pred(E('[Net] a hit')), 'tag hidden');
    assert.ok(!pred(E('miss')), 'text');
    const solo = makePredicate({ levels, tags: {}, sources: { game: 'solo' } }, compileQuery('', false, false));
    assert.ok(solo(E('x', 'log', 'game')) && !solo(E('x', 'log', 'scene')));
});

// ------------------------------------------------------------------ store: collapse, counts, capacity

test('LogStore: rows, counts and collapse', () => {
    const st = new LogStore(1000);
    st.add([E('A'), E('A'), E('B', 'warn'), E('A'), E('C', 'error')]);
    assert.strictEqual(st.length, 5);
    assert.deepStrictEqual(st.levelCounts, { log: 3, info: 0, warn: 1, error: 1, success: 0 });
    st.setCollapse(true);
    assert.strictEqual(st.length, 3);
    assert.strictEqual(st.rowCount(0), 3);
    assert.strictEqual(st.rowEntry(0)!.text, 'A');
    assert.strictEqual(st.rowLatest(0)!.id, st.entries[3].id, 'the newest of the group');
    assert.deepStrictEqual(st.levelCounts, { log: 1, info: 0, warn: 1, error: 1, success: 0 }, 'unique counts when collapsed');
    st.add([E('A'), E('D')]);
    assert.strictEqual(st.length, 4);
    assert.strictEqual(st.rowCount(0), 4);
    st.setCollapse(false);
    assert.strictEqual(st.length, 7);
});

test('collapse keys differ by level, source and stack', () => {
    assert.notStrictEqual(collapseKey(E('A', 'log')), collapseKey(E('A', 'warn')));
    assert.notStrictEqual(collapseKey(E('A', 'log', 'game')), collapseKey(E('A', 'log', 'scene')));
    assert.notStrictEqual(collapseKey(E('A', 'log', 'game', { stack: 'at a' })), collapseKey(E('A', 'log', 'game', { stack: 'at b' })));
    assert.strictEqual(collapseKey(E('A')), collapseKey(E('A')));
});

test('LogStore: filter, keys, findRow, retag', () => {
    const st = new LogStore(1000);
    const list = [E('x1'), E('[Net] x2'), E('x3', 'warn', 'game'), E('[Net] x4')];
    st.add(list);
    st.setPredicate((e) => e.tag === 'Net');
    assert.strictEqual(st.length, 2);
    assert.strictEqual(st.findRow('e:' + list[3].id), 1);
    assert.strictEqual(st.findRow('e:' + list[0].id), -1, 'filtered out');
    st.setPredicate(() => true);
    assert.strictEqual(st.indexOfId(list[2].id), 2);
    assert.ok(st.retag([{ id: list[0].id, source: 'game' }]));
    assert.strictEqual(st.sourceCounts.game, 2);
    assert.strictEqual(st.entries[0].sure, true);
    assert.ok(!st.retag([{ id: list[0].id, source: 'game' }]), 'no change');
    st.setCollapse(true);
    const key = st.rowKey(0);
    assert.ok(key.startsWith('g:'));
    assert.strictEqual(st.findRow(key), 0);
});

test('LogStore trims past its capacity and keeps the newest', () => {
    const st = new LogStore(1000);
    const batch: LogEntry[] = [];
    for (let i = 0; i < 1300; i++) batch.push(E('line ' + i));
    assert.strictEqual(st.add(batch), 'rebuild');
    assert.strictEqual(st.entries.length, 1000);
    assert.strictEqual(st.entries[0].text, 'line 300');
    assert.strictEqual(st.length, 1000);
    assert.strictEqual(st.levelCounts.log, 1000);
    assert.strictEqual(st.add([E('one more')]), 'append');
});

test('LogStore handles 100k lines quickly', () => {
    const st = new LogStore(200000);
    const batch: LogEntry[] = [];
    for (let i = 0; i < 100000; i++) batch.push(E((i % 7 === 0 ? '[Net] ' : '') + 'message number ' + (i % 500), i % 10 === 0 ? 'warn' : 'log'));
    let t = Date.now();
    st.add(batch);
    const addMs = Date.now() - t;
    t = Date.now();
    st.setPredicate(makePredicate({ levels: { log: true, info: true, warn: true, error: true, success: true }, tags: {}, sources: {} }, compileQuery('number 42', false, false)));
    const filterMs = Date.now() - t;
    assert.strictEqual(st.length, 2200);
    t = Date.now();
    st.setCollapse(true);
    const collapseMs = Date.now() - t;
    const unique = new Set(batch.filter((e) => e.text.indexOf('number 42') >= 0).map(collapseKey));
    assert.strictEqual(st.length, unique.size);
    assert.ok(unique.size > 10 && unique.size < 50);
    console.log(`       (add ${addMs} ms, filter ${filterMs} ms, collapse ${collapseMs} ms)`);
    assert.ok(addMs < 1500 && filterMs < 300 && collapseMs < 300);
});

// ------------------------------------------------------------------ ring buffer

test('RingBuffer keeps the newest items', () => {
    const r = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => r.push(n));
    assert.deepStrictEqual(r.toArray(), [3, 4, 5]);
    assert.strictEqual(r.get(0), 3);
    assert.strictEqual(r.get(3), undefined);
    const seen: number[] = [];
    r.forEachNewest((n) => (seen.push(n), n > 4));
    assert.deepStrictEqual(seen, [5, 4]);
    r.resize(5);
    r.push(6);
    assert.deepStrictEqual(r.toArray(), [3, 4, 5, 6]);
    r.resize(2);
    assert.deepStrictEqual(r.toArray(), [5, 6]);
    r.filter((n) => n !== 5);
    assert.deepStrictEqual(r.toArray(), [6]);
    r.clear();
    assert.strictEqual(r.size, 0);
});

// ------------------------------------------------------------------ capture

test('toEntry normalizes Logger records', () => {
    const e = toEntry({ type: 'warn', message: '[Net] slow', stack: '', time: 1700000000123, process: 'browser' }, 7);
    assert.deepStrictEqual([e.id, e.level, e.tag, e.source, e.t], [7, 'warn', 'Net', 'main', 1700000000123]);
    assert.strictEqual(toEntry({ type: 'log', message: { a: 1 } as any, time: 1700000000 }, 1).t, 1700000000000, 'seconds');
    assert.strictEqual(toEntry({ type: 'log', message: { a: 1 } as any }, 1).text, '{"a":1}');
});

function fakeLogger(withEvents: boolean) {
    const list: LoggerRecord[] = [];
    const handlers: Record<string, ((...a: any[]) => void)[]> = {};
    return {
        list,
        api: {
            query: () => list,
            on: withEvents ? (a: string, f: (...a: any[]) => void) => (handlers[a] = handlers[a] || []).push(f) : undefined,
            off: () => undefined,
        },
        record(r: LoggerRecord, emit = true) {
            list.push(r);
            if (emit && handlers.record) handlers.record.forEach((f) => f(r));
        },
        clear() {
            list.length = 0;
            if (handlers.clear) handlers.clear.forEach((f) => f());
        },
    };
}

test('LoggerFollower: history, events, clear, and a fall back to polling', () => {
    const L = fakeLogger(true);
    L.record({ type: 'log', message: 'before', time: 1 });
    const got: string[] = [];
    let clears = 0;
    const f = new LoggerFollower(L.api, (rs) => rs.forEach((r) => got.push(String(r.message))), () => clears++);
    const hist = f.start();
    assert.deepStrictEqual(hist.map((r) => r.message), ['before']);
    assert.strictEqual(f.mode, 'event');
    L.record({ type: 'log', message: 'a', time: 2 });
    L.record({ type: 'log', message: 'b', time: 3 });
    f.tick();
    assert.deepStrictEqual(got, ['a', 'b'], 'the watchdog does not repeat evented records');
    L.clear();
    assert.strictEqual(clears, 1);
    L.record({ type: 'log', message: 'c', time: 4 });
    f.tick();
    assert.deepStrictEqual(got, ['a', 'b', 'c']);
    // an event that never fires: the watchdog delivers and switches to polling
    L.record({ type: 'log', message: 'silent', time: 5 }, false);
    f.tick();
    assert.deepStrictEqual(got, ['a', 'b', 'c', 'silent']);
    assert.strictEqual(f.mode, 'poll');
    f.stop();
});

test('LoggerFollower in poll mode survives a clear done behind its back', () => {
    const L = fakeLogger(false);
    const got: string[] = [];
    const f = new LoggerFollower(L.api, (rs) => rs.forEach((r) => got.push(String(r.message))), () => undefined);
    f.start();
    assert.strictEqual(f.mode, 'poll');
    L.record({ type: 'log', message: 'x', time: 1 });
    L.record({ type: 'log', message: 'y', time: 2 });
    f.tick();
    L.list.length = 0; // Cocos' clear() reassigns or empties the list
    L.record({ type: 'log', message: 'z', time: 3 });
    f.tick();
    L.record({ type: 'log', message: 'z', time: 3 });
    f.tick();
    assert.deepStrictEqual(got, ['x', 'y', 'z', 'z'], 'identical records are still delivered once each');
    assert.strictEqual(fingerprint({ time: 1, type: 'log', message: 'm' }), '1|log|m');
    f.stop();
});

test('SourceTagger pairs scene-script calls with renderer records, in both orders', () => {
    let now = 1000000;
    const tg = new SourceTagger(() => now);
    // record first, call later (the usual order)
    const a = E('Score: 3', 'log', 'panel', { t: now, process: 'renderer' });
    tg.onEntry(a);
    const changed = tg.onCalls({ source: 'game', calls: [{ level: 'log', head: 'Score: ', t: now }] });
    assert.deepStrictEqual(changed, [{ id: a.id, source: 'game' }]);
    assert.ok(a.sure);
    // call first, record later
    tg.onCalls({ source: 'scene', calls: [{ level: 'warn', head: 'Gizmo', t: now }] });
    const b = E('Gizmo missing', 'warn', 'panel', { t: now + 5, process: 'renderer' });
    tg.onEntry(b);
    assert.strictEqual(b.source, 'scene');
    // a different level or text does not pair
    const c = E('Other', 'log', 'panel', { t: now, process: 'renderer' });
    tg.onEntry(c);
    assert.deepStrictEqual(tg.onCalls({ source: 'game', calls: [{ level: 'error', head: 'Other', t: now }] }), []);
    assert.strictEqual(c.source, 'panel');
    // main-process records are never paired
    const d = E('Main', 'log', 'main', { t: now, process: 'browser' });
    tg.onEntry(d);
    assert.deepStrictEqual(tg.onCalls({ source: 'game', calls: [{ level: 'log', head: 'Main', t: now }] }), []);
    // old pending calls expire
    tg.onCalls({ source: 'game', calls: [{ level: 'log', head: 'Late', t: now }] });
    now += 5000;
    const e = E('Late arrival', 'log', 'panel', { t: now, process: 'renderer' });
    tg.onEntry(e);
    assert.strictEqual(e.source, 'panel');
});

// ------------------------------------------------------------------ editor launch

test('launchFor builds goto command lines', () => {
    const f = 'E:\\G\\assets\\a.ts';
    assert.deepStrictEqual(launchFor('C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', f, 12, 5, 'E:\\G').args, ['E:\\G', '-g', f + ':12:5']);
    assert.deepStrictEqual(launchFor('C:\\x\\Cursor.exe', f, 3, 0, '').args, ['-g', f + ':3:1']);
    assert.deepStrictEqual(launchFor('C:\\JetBrains\\rider64.exe', f, 12, 5, 'E:\\G').args, ['--line', '12', '--column', '5', f]);
    assert.deepStrictEqual(launchFor('C:\\Sublime\\sublime_text.exe', f, 12, 5, '').args, [f + ':12:5']);
    assert.deepStrictEqual(launchFor('C:\\npp\\notepad++.exe', f, 12, 5, '').args, ['-n12', '-c5', f]);
    assert.deepStrictEqual(launchFor('C:\\VS\\devenv.exe', f, 12, 5, '').args, ['/Edit', f]);
    assert.deepStrictEqual(launchFor('C:\\x\\other.exe', f, 12, 5, '').args, [f]);
    assert.deepStrictEqual(launchFor('C:\\x\\other.exe', f, 12, 5, 'E:\\G', '--open "${file}" --at {line}:%col%').args, ['--open', f, '--at', '12:5']);
    assert.strictEqual(editorKind('/usr/bin/code'), 'vscode');
    assert.deepStrictEqual(splitArgs('a "b c" \'d e\''), ['a', 'b c', 'd e']);
});

test('programInfo reads both setting shapes; VS Code candidates', () => {
    assert.deepStrictEqual(programInfo('C:\\a.exe'), { path: 'C:\\a.exe', commandArgument: '' });
    assert.deepStrictEqual(programInfo({ path: 'C:\\a.exe', commandArgument: '-x' }), { path: 'C:\\a.exe', commandArgument: '-x' });
    assert.strictEqual(programInfo({}), null);
    assert.strictEqual(programInfo(''), null);
    const c = vsCodeCandidates({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32');
    assert.strictEqual(c[0], 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe');
});

// ------------------------------------------------------------------ text

test('entryToText and helpers', () => {
    const e = E('Hello\nworld', 'warn', 'game', { stack: '    at a (db://assets/a.ts:1:1)', t: new Date(2026, 0, 2, 3, 4, 5, 6).getTime() });
    assert.strictEqual(formatTime(e.t), '03:04:05.006');
    assert.strictEqual(entryToText(e, { stack: true, count: 3 }), '[03:04:05.006] [Warning] (game) (x3) Hello\nworld\n    at a (db://assets/a.ts:1:1)');
    assert.strictEqual(entryToText(e, { time: false }), '[Warning] (game) Hello\nworld');
    assert.strictEqual(firstLine('a\r\nb'), 'a');
});

run();
