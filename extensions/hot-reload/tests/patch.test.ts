import assert from 'assert';
import { test, results } from './harness';
import { addMissingFields, applyClass, compare, exportedClasses, instrument, isStub, pairClasses, PropInfo, summarize } from '../source/core/patch';

/* eslint-disable @typescript-eslint/no-explicit-any, max-classes-per-file */

/** A tiny scheduler that keeps callbacks like Cocos' schedule/input.on. */
class Bus {
    list: { fn: (...a: any[]) => any; target: any }[] = [];
    on(fn: (...a: any[]) => any, target: any) {
        this.list.push({ fn, target });
    }
    emit(...a: any[]) {
        return this.list.map((e) => e.fn.apply(e.target, a));
    }
}

test('instrumented methods swap for live instances and for callbacks grabbed earlier', () => {
    class Player {
        speed = 2;
        x = 0;
        move(dt: number) {
            this.x += this.speed * dt;
            return 'v1';
        }
        tick() {
            return 'tick v1 ' + this.x;
        }
    }
    const n = instrument(Player);
    assert.strictEqual(n, 2);
    assert.ok(isStub(Player.prototype.move));
    const p = new Player();
    p.move(1);
    const bus = new Bus();
    bus.on(p.tick, p); // like this.schedule(this.tick)
    const bound = p.move.bind(p); // like input.on(..., this.move, this) wrappers
    // the "new module" version
    class Player2 {
        speed = 2;
        x = 0;
        move(dt: number) {
            this.x += this.speed * dt * 10;
            return 'v2';
        }
        tick() {
            return 'tick v2 ' + this.x;
        }
    }
    const r = applyClass(Player, Player2);
    assert.deepStrictEqual(r.updated.sort(), ['move', 'tick']);
    assert.strictEqual(p.move(1), 'v2');
    assert.strictEqual(p.x, 22, 'state kept, new formula used');
    assert.deepStrictEqual(bus.emit(), ['tick v2 22'], 'callback registered before the swap runs the new code');
    assert.strictEqual(bound(0), 'v2', 'bound function follows too');
    assert.ok(p instanceof Player);
});

test('super calls keep working (base in another module, and base in the same module)', () => {
    class Base {
        hit() {
            return 'base';
        }
    }
    class Enemy extends Base {
        hit() {
            return 'enemy>' + super.hit();
        }
    }
    instrument(Base);
    instrument(Enemy);
    const e = new Enemy();
    // new Enemy, base unchanged (imported from an unchanged module: the same Base)
    class Enemy2 extends Base {
        hit() {
            return 'enemy2>' + super.hit();
        }
    }
    assert.deepStrictEqual(compare(Enemy, Enemy2), []);
    applyClass(Enemy, Enemy2);
    assert.strictEqual(e.hit(), 'enemy2>base');
    // base and subclass both changed in the same module
    class Base3 {
        hit() {
            return 'base3';
        }
    }
    class Enemy3 extends Base3 {
        hit() {
            return 'enemy3>' + super.hit();
        }
    }
    const oldOf = (c: any) => (c === Base3 ? Base : c === Enemy3 ? Enemy : null);
    assert.deepStrictEqual(compare(Enemy, Enemy3, { oldOf }), [], 'new base from the same module maps to the running base');
    applyClass(Base, Base3);
    applyClass(Enemy, Enemy3);
    assert.strictEqual(e.hit(), 'enemy3>base3');
    assert.strictEqual(new Base().hit(), 'base3');
});

test('accessors, static methods, static state and singletons', () => {
    class GameManager {
        static instance: any = null;
        static count = 5;
        static make() {
            return 'make v1';
        }
        private _score = 1;
        get score() {
            return this._score;
        }
        init() {
            GameManager.instance = this;
        }
    }
    instrument(GameManager);
    const gm = new GameManager();
    gm.init();
    GameManager.count = 7;
    class GameManager2 {
        static instance: any = null;
        static count = 0;
        static level = 3;
        static make() {
            return 'make v2';
        }
        private _score = 1;
        get score() {
            return this._score * 100;
        }
        current() {
            // new code reads the singleton through ITS OWN class name
            return GameManager2.instance;
        }
        bump() {
            GameManager2.count++;
        }
    }
    const r = applyClass(GameManager, GameManager2);
    assert.strictEqual(gm.score, 100, 'getter replaced');
    assert.strictEqual(GameManager.make(), 'make v2', 'static method swapped');
    assert.strictEqual(GameManager.count, 7, 'running static state kept');
    assert.strictEqual((GameManager as any).level, 3, 'new static added');
    assert.deepStrictEqual(r.staticsAdded, ['level']);
    assert.strictEqual((gm as any).current(), gm, 'new code sees the running singleton');
    (gm as any).bump();
    assert.strictEqual(GameManager.count, 8, 'writes through the new class land on the running class');
    assert.ok(gm instanceof (GameManager2 as any), 'running objects pass instanceof against the new class');
    assert.strictEqual((GameManager2 as any)._sealed, false);
});

test('new fields get initial values on live instances, existing values untouched', () => {
    class Mover {
        speed = 1;
    }
    const a = new Mover();
    const b = new Mover();
    a.speed = 9;
    class Mover2 {
        speed = 1;
        trail: number[] = [];
        dir = 'up';
    }
    const added = addMissingFields([a, b], () => new Mover2());
    assert.deepStrictEqual(added.sort(), ['dir', 'trail']);
    assert.strictEqual(a.speed, 9);
    assert.deepStrictEqual((a as any).trail, []);
    assert.notStrictEqual((a as any).trail, (b as any).trail, 'mutable defaults are not shared');
    let calls = 0;
    const none = addMissingFields([a], () => {
        calls++;
        throw new Error('needs a node');
    });
    assert.deepStrictEqual(none, []);
    assert.strictEqual(calls, 1);
});

test('removed methods are kept, removed/added update() is reported for the scheduler', () => {
    class Comp {
        update() {
            return 1;
        }
        helper() {
            return 'h';
        }
    }
    instrument(Comp);
    const c = new Comp();
    class Comp2 {
        lateUpdate() {
            return 2;
        }
    }
    const r = applyClass(Comp, Comp2);
    assert.deepStrictEqual(r.removed.sort(), ['helper', 'update']);
    assert.deepStrictEqual(r.lifecycleRemoved, ['update']);
    assert.deepStrictEqual(r.lifecycleAdded, ['lateUpdate']);
    assert.strictEqual((c as any).update, undefined, 'update removed so the scheduler can drop it');
    assert.strictEqual(c.helper(), 'h', 'other removed methods stay callable');
    assert.strictEqual((c as any).lateUpdate(), 2);
    assert.ok(/removed: helper, update \(kept/.test(summarize(r, [])));
});

test('restart needed: properties, types, base class, decorators', () => {
    const info: Record<string, PropInfo> = {};
    const propInfo = (C: any) => info[C.name] || { props: null, types: {} };
    class A {}
    class A2 {}
    info.A = { props: ['speed', 'target'], types: { speed: '|Number|', target: 'Node||' } };
    info.A2 = { props: ['speed', 'target', 'hp'], types: { speed: '|Number|', target: 'Node||', hp: '|Number|' } };
    assert.deepStrictEqual(compare(A, A2, { propInfo }), ["new @property 'hp'"]);
    class A3 {}
    info.A3 = { props: ['speed'], types: { speed: '|String|' } };
    assert.deepStrictEqual(compare(A, A3, { propInfo }).sort(), ["@property 'speed' changed type", "removed @property 'target'"]);
    class Base {}
    class B extends Base {}
    class B2 {}
    assert.deepStrictEqual(compare(B, B2), ['base class changed']);
    class C {
        static _executionOrder = 0;
    }
    class C2 {
        static _executionOrder = 5;
    }
    assert.deepStrictEqual(compare(C, C2), ['class decorator changed (executionOrder)']);
    class D {
        static _disallowMultiple: any = D;
    }
    class D2 {
        static _disallowMultiple: any = D2;
    }
    assert.deepStrictEqual(compare(D, D2), [], 'disallowMultiple points at its own class: compared as yes/no');
});

test('engine metadata is never copied or wrapped', () => {
    class Cc {
        static __props__ = ['a'];
        static _sealed = true;
        static _executionOrder = 1;
        run() {
            return 1;
        }
    }
    (Cc.prototype as any).__cid__ = 'old-cid';
    (Cc.prototype as any).__classname__ = 'Cc';
    instrument(Cc);
    class Cc2 {
        static __props__ = ['a', 'b'];
        static _sealed = true;
        run() {
            return 2;
        }
    }
    (Cc2.prototype as any).__cid__ = 'new-cid';
    (Cc2.prototype as any).__classname__ = 'Cc';
    applyClass(Cc, Cc2);
    assert.strictEqual((Cc.prototype as any).__cid__, 'old-cid');
    assert.deepStrictEqual(Cc.__props__, ['a']);
    assert.strictEqual(Cc._sealed, true, 'running class untouched');
    assert.strictEqual(new Cc().run(), 2);
    assert.ok(!isStub((Cc as any).__props__));
});

test('late instrumentation is reported (callbacks taken before keep the old code)', () => {
    class Late {
        go() {
            return 'old';
        }
    }
    const l = new Late();
    const grabbed = l.go;
    class Late2 {
        go() {
            return 'new';
        }
    }
    const r = applyClass(Late, Late2);
    assert.deepStrictEqual(r.late, ['go']);
    assert.strictEqual(l.go(), 'new');
    assert.strictEqual(grabbed.call(l), 'old');
});

test('pairing by @ccclass name, then export name; new and missing classes', () => {
    class P {}
    class E {}
    class H {}
    (P.prototype as any).__classname__ = 'Player';
    class P2 {}
    class E2 {}
    class N {}
    (P2.prototype as any).__classname__ = 'Player';
    const name = (C: any) => (Object.prototype.hasOwnProperty.call(C.prototype, '__classname__') ? C.prototype.__classname__ : '');
    const old = exportedClasses({ PlayerCtl: P, Enemy: E, Helper: H, VERSION: 1 });
    const neu = exportedClasses({ Player: P2, Enemy: E2, Extra: N });
    const pr = pairClasses(old, neu, name);
    assert.deepStrictEqual(pr.pairs.map((x) => [x.name, x.oldC === P || x.oldC === E, x.newC === P2 || x.newC === E2]), [
        ['Player', true, true],
        ['Enemy', true, true],
    ]);
    assert.deepStrictEqual(pr.added.map((x) => x.exportName), ['Extra']);
    assert.deepStrictEqual(pr.missing.map((x) => x.exportName), ['Helper']);
    assert.strictEqual(old.length, 3, 'non-class exports ignored');
});

test('summary text', () => {
    class S1 {
        a() {
            return 1;
        }
    }
    instrument(S1);
    class S2 {
        a() {
            return 2;
        }
        b() {
            return 3;
        }
    }
    assert.strictEqual(summarize(applyClass(S1, S2), ['dir']), '1 method updated, 1 method added, 1 field added (dir)');
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exit(1);
