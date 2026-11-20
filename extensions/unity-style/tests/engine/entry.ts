import './globals';
import { DebugMode } from 'engine:/cocos/core/platform/debug';
import { builtinResMgr, CCClass, director, EffectAsset, game, Game, geometry, js, Node, Quat, Scene, settings, Vec2, Vec3, Size } from 'engine:/exports/base';
import { effects } from 'engine:/tests/fixtures/builtin-effects';
import { glsl4 } from 'engine:/tests/fixtures/builtin-glsl4';
import { initBuiltinMaterial } from 'engine:/tests/fixtures/builtin-material';
import 'engine:/cocos/gfx/empty/empty-device';
import 'engine:/exports/legacy-pipeline';
import { BoxCollider, CapsuleCollider, Collider, physics, PhysicsMaterial, PhysicsSystem, RigidBody, SphereCollider } from 'engine:/exports/physics-framework';
import 'engine:/exports/physics-physx';
import 'engine:/exports/physics-ammo';
import 'engine:/exports/physics-builtin';
import 'engine:/exports/physics-cannon';
import { BoxCollider2D, CircleCollider2D, ERigidBody2DType, PhysicsSystem2D, PolygonCollider2D, RigidBody2D } from 'engine:/exports/physics-2d-framework';
import 'engine:/exports/physics-2d-box2d-wasm';
import 'engine:/exports/physics-2d-builtin';
import { selector as selector2D } from 'engine:/cocos/physics-2d/framework/physics-selector';
import { waitForBox2dWasmInstantiation } from 'engine:/cocos/physics-2d/box2d-wasm/instantiated';
import { initPhysXLibs } from 'engine:/cocos/physics/physx/physx-adapter';
import { waitForAmmoInstantiation } from 'engine:/cocos/physics/bullet/instantiated';

import * as US from '../../assets/index';
import { LifecycleProbe } from './fixtures/LifecycleProbe';
import { BothHooks } from './fixtures/BothHooks';
import { CollisionProbe } from './fixtures/CollisionProbe';
import { DataClasses, Loot, Named, Stats } from './fixtures/DataClasses';

const { Physics, Physics2D, RaycastHit, LayerMask, QueryTriggerInteraction, PhysicsMessages, Time, MonoBehaviour, GameObject, Tag, DebugDraw } = US;

const DT = 1 / 60;
const results: { section: string; name: string; ok: boolean; info: string }[] = [];
const matrix: { [k: string]: { [feature: string]: string } } = {};
function check(section: string, name: string, ok: boolean, info = ''): void {
    results.push({ section, name, ok, info });
    console.log((ok ? '  ok   ' : '  FAIL ') + '[' + section + '] ' + name + (info ? ' :: ' + info : ''));
}
function note(backend: string, feature: string, value: string): void {
    (matrix[backend] = matrix[backend] || {})[feature] = value;
}
function near(a: number, b: number, eps = 0.02): boolean {
    return Math.abs(a - b) <= eps;
}
function v(p: { x: number; y: number; z?: number }): string {
    return '(' + p.x.toFixed(3) + ', ' + p.y.toFixed(3) + (p.z !== undefined ? ', ' + (p.z as number).toFixed(3) : '') + ')';
}
function run(seconds: number, each?: () => void): void {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
        director.tick(DT);
        if (each) each();
    }
}
function attempt(section: string, name: string, fn: () => void): void {
    try {
        fn();
    } catch (e: any) {
        check(section, name, false, 'threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    }
}

// ------------------------------------------------------------------ 3D physics

function newScene(name: string): Scene {
    const scene = new Scene(name);
    director.runSceneImmediate(scene);
    return scene;
}

function box(scene: Node, name: string, pos: Vec3, size: Vec3, trigger = false): BoxCollider {
    const n = new Node(name);
    scene.addChild(n);
    n.setPosition(pos);
    const c = n.addComponent(BoxCollider) as BoxCollider;
    c.size = size;
    c.isTrigger = trigger;
    return c;
}

function physics3d(backend: string): void {
    const S = backend;
    newScene('empty');
    director.tick(DT);
    physics.selector.switchTo(backend);
    console.log('\n# 3D backend ' + physics.selector.id);
    const scene = newScene('p3d-' + backend);
    const ground = box(scene, 'Ground', new Vec3(0, -0.5, 0), new Vec3(40, 1, 40));
    const enemy = box(scene, 'Enemy', new Vec3(0, 1, -5), new Vec3(2, 2, 2));
    const sn = new Node('Ball');
    scene.addChild(sn);
    sn.setPosition(5, 1, 0);
    const sphere = sn.addComponent(SphereCollider) as SphereCollider;
    sphere.radius = 1;
    const cn = new Node('Pill');
    scene.addChild(cn);
    cn.setPosition(-5, 1, 0);
    const capsule = cn.addComponent(CapsuleCollider) as CapsuleCollider;
    const trig = box(scene, 'Trigger', new Vec3(0, 1, 5), new Vec3(2, 2, 2), true);
    director.tick(DT);
    const enemyLayer = LayerMask.NameToLayer('Enemy');
    enemy.setGroup(1 << enemyLayer);
    director.tick(DT);
    const hit = new RaycastHit();

    attempt(S, 'Raycast down onto the box (hit filled)', () => {
        const ok = Physics.Raycast(new Vec3(0, 10, -5), new Vec3(0, -1, 0), hit, 100);
        const good = ok && hit.collider === enemy && near(hit.point.y, 2) && near(hit.distance, 8) && near(hit.normal.y, 1, 0.01);
        check(S, 'Raycast down onto the box (hit filled)', good, 'ok=' + ok + ' p=' + v(hit.point) + ' n=' + v(hit.normal) + ' d=' + hit.distance.toFixed(3) + ' col=' + (hit.collider && hit.collider.node.name));
        note(S, 'Raycast', good ? 'yes' : 'NO');
        note(S, 'ray normal', hit.normal.lengthSqr() > 0.5 ? 'yes' : 'zero');
    });
    attempt(S, 'Raycast(Ray, hit) and Infinity distance', () => {
        const r = new geometry.Ray(0, 10, -5, 0, -1, 0);
        const ok = Physics.Raycast(r, hit, Infinity);
        check(S, 'Raycast(Ray, hit) and Infinity distance', ok && hit.collider === enemy, 'd=' + hit.distance.toFixed(3));
    });
    attempt(S, 'Raycast layer mask skips the Enemy layer', () => {
        const mask = ~LayerMask.GetMask('Enemy');
        const ok = Physics.Raycast(new Vec3(0, 10, -5), new Vec3(0, -1, 0), hit, 100, mask);
        check(S, 'Raycast layer mask skips the Enemy layer', ok && hit.collider === ground && near(hit.distance, 10), 'col=' + (hit.collider && hit.collider.node.name) + ' d=' + hit.distance.toFixed(3));
        const only = Physics.Raycast(new Vec3(0, 10, -5), new Vec3(0, -1, 0), 100, LayerMask.GetMask('Enemy'));
        check(S, 'Raycast with only the Enemy layer hits', only);
        note(S, 'layer mask', ok && hit.collider === ground && only ? 'yes' : 'NO');
    });
    attempt(S, 'RaycastAll through a trigger; trigger interaction', () => {
        const all = Physics.RaycastAll(new Vec3(0, 10, 5), new Vec3(0, -1, 0), 100);
        const ign = Physics.RaycastAll(new Vec3(0, 10, 5), new Vec3(0, -1, 0), 100, -1, QueryTriggerInteraction.Ignore);
        Physics.queriesHitTriggers = false;
        const glob = Physics.RaycastAll(new Vec3(0, 10, 5), new Vec3(0, -1, 0), 100);
        const closest = Physics.Raycast(new Vec3(0, 10, 5), new Vec3(0, -1, 0), hit, 100);
        Physics.queriesHitTriggers = true;
        const good = all.length === 2 && all[0].collider === trig && ign.length === 1 && ign[0].collider === ground && glob.length === 1 && closest && hit.collider === ground;
        check(S, 'RaycastAll through a trigger; trigger interaction', good, 'all=' + all.map((h) => h.collider!.node.name + '@' + h.distance.toFixed(2)).join(',') + ' ignore=' + ign.length + ' global=' + glob.length + ' closest(no triggers)=' + (hit.collider && hit.collider.node.name));
        note(S, 'triggers filter', good ? 'yes' : 'NO');
    });
    attempt(S, 'Linecast short of the box misses', () => {
        const miss = Physics.Linecast(new Vec3(0, 10, -5), new Vec3(0, 3, -5));
        const reach = Physics.Linecast(new Vec3(0, 10, -5), new Vec3(0, 1, -5), hit);
        check(S, 'Linecast short of the box misses', !miss && reach && hit.collider === enemy);
    });
    attempt(S, 'SphereCast down onto the box', () => {
        const ok = Physics.SphereCast(new Vec3(0, 10, -5), 0.5, new Vec3(0, -1, 0), hit, 100);
        const good = ok && hit.collider === enemy && near(hit.distance, 7.5, 0.05) && near(hit.normal.y, 1, 0.05) && near(hit.point.y, 2, 0.05);
        check(S, 'SphereCast down onto the box', good, 'ok=' + ok + ' d=' + hit.distance.toFixed(3) + ' p=' + v(hit.point) + ' n=' + v(hit.normal));
        note(S, 'SphereCast', ok ? (good ? 'yes' : 'approx d=' + hit.distance.toFixed(3)) : 'NO');
    });
    attempt(S, 'SphereCast sideways onto the sphere', () => {
        const ok = Physics.SphereCast(new Vec3(0, 1, 0), 0.5, new Vec3(1, 0, 0), hit, 100);
        const good = ok && hit.collider === sphere && near(hit.distance, 3.5, 0.05) && near(hit.normal.x, -1, 0.05);
        check(S, 'SphereCast sideways onto the sphere', good, 'ok=' + ok + ' d=' + hit.distance.toFixed(3) + ' n=' + v(hit.normal) + ' col=' + (hit.collider && hit.collider.node.name));
    });
    attempt(S, 'BoxCast toward the box', () => {
        const ok = Physics.BoxCast(new Vec3(0, 1, 0), new Vec3(0.5, 0.5, 0.5), new Vec3(0, 0, -1), hit, Quat.IDENTITY, 100);
        const good = ok && hit.collider === enemy && near(hit.distance, 3.5, 0.05) && near(hit.normal.z, 1, 0.05);
        check(S, 'BoxCast toward the box', good, 'ok=' + ok + ' d=' + hit.distance.toFixed(3) + ' n=' + v(hit.normal) + ' col=' + (hit.collider && hit.collider.node.name));
        const rot = Quat.fromEuler(new Quat(), 0, 45, 0);
        const ok2 = Physics.BoxCast(new Vec3(0, 1, 0), new Vec3(0.5, 0.5, 0.5), new Vec3(0, 0, -1), hit, rot, 100);
        const exp2 = 4 - Math.SQRT2 * 0.5;
        check(S, 'BoxCast rotated 45 deg (corner first)', ok2 && near(hit.distance, exp2, 0.05), 'd=' + hit.distance.toFixed(3) + ' expected ' + exp2.toFixed(3));
        note(S, 'BoxCast', ok ? (good ? 'yes' : 'approx d=' + hit.distance.toFixed(3)) : 'NO');
    });
    attempt(S, 'CapsuleCast toward the capsule', () => {
        const ok = Physics.CapsuleCast(new Vec3(0, 0.75, 0), new Vec3(0, 1.25, 0), 0.25, new Vec3(-1, 0, 0), hit, 100);
        const good = ok && hit.collider === capsule && near(hit.distance, 4.25, 0.05) && near(hit.normal.x, 1, 0.05);
        if (backend === 'cannon.js') {
            // cannon.js has no capsule collider at all ("does not support CapsuleCollider"): nothing to hit
            check(S, 'CapsuleCast ignores the unsupported capsule collider', !ok);
        } else {
            check(S, 'CapsuleCast toward the capsule', good, 'ok=' + ok + ' d=' + hit.distance.toFixed(3) + ' n=' + v(hit.normal) + ' col=' + (hit.collider && hit.collider.node.name));
        }
        const ok2 = Physics.CapsuleCast(new Vec3(0, 0.75, 0), new Vec3(0, 1.25, 0), 0.25, new Vec3(1, 0, 0), hit, 100);
        const good2 = ok2 && hit.collider === sphere && near(hit.distance, 3.75, 0.05) && near(hit.normal.x, -1, 0.05);
        check(S, 'CapsuleCast toward the sphere', good2, 'd=' + hit.distance.toFixed(3) + ' n=' + v(hit.normal));
        note(S, 'CapsuleCast', good2 ? 'yes' : ok2 ? 'approx d=' + hit.distance.toFixed(3) : 'NO');
    });
    attempt(S, 'SphereCastAll down through trigger and ground', () => {
        const all = Physics.SphereCastAll(new Vec3(0, 10, 5), 0.25, new Vec3(0, -1, 0), 100);
        check(S, 'SphereCastAll down through trigger and ground', all.length === 2 && all[0].collider === trig && all[1].collider === ground, all.map((h) => h.collider!.node.name + '@' + h.distance.toFixed(2)).join(','));
    });
    attempt(S, 'A cast starting inside a collider skips it', () => {
        const ok = Physics.SphereCast(new Vec3(0, 1, -5), 0.25, new Vec3(0, 0, 1), hit, 3);
        check(S, 'A cast starting inside a collider skips it', !ok, 'ok=' + ok + (ok ? ' col=' + hit.collider!.node.name + ' d=' + hit.distance.toFixed(3) : ''));
    });
    attempt(S, 'Overlaps and checks', () => {
        const a = Physics.OverlapSphere(new Vec3(5, 1, 0), 0.1);
        const b = Physics.OverlapSphere(new Vec3(0, 0.05, 0), 0.1);
        const c = Physics.OverlapBox(new Vec3(0, 1, -3.6), new Vec3(0.5, 0.5, 0.5));
        const d = Physics.OverlapBox(new Vec3(0, 1, -3.4), new Vec3(0.5, 0.5, 0.5));
        const e = Physics.OverlapCapsule(new Vec3(-4.4, 1, 0), new Vec3(-3, 1, 0), 0.2);
        const f = Physics.CheckSphere(new Vec3(0, 5, 0), 1);
        const g = Physics.CheckBox(new Vec3(0, 2.05, -5), new Vec3(0.5, 0.1, 0.5), Quat.IDENTITY);
        const tr = Physics.OverlapSphere(new Vec3(0, 1, 5), 0.1, -1, QueryTriggerInteraction.Ignore);
        const good = a.length === 1 && a[0] === sphere && b.length === 1 && b[0] === ground && c.indexOf(enemy) >= 0 && d.indexOf(enemy) < 0 && e.length === 1 && e[0] === capsule && !f && g && tr.length === 0;
        check(S, 'Overlaps and checks', good, [a.length, b.length, c.length, d.length, e.length, f, g, tr.length].join(' '));
        note(S, 'Overlap*/Check*', good ? 'yes (geometric)' : 'NO');
    });
    attempt(S, 'ClosestPoint on the box', () => {
        const p = Physics.ClosestPoint(new Vec3(0, 10, -5), enemy);
        const q = Physics.ClosestPoint(new Vec3(0, 10, -5), enemy, new Vec3(0, 5, -5), Quat.IDENTITY);
        check(S, 'ClosestPoint on the box', near(p.y, 2) && near(q.y, 6), v(p) + ' / moved ' + v(q));
    });
    attempt(S, 'debugDrawQueries stores lines', () => {
        DebugDraw.clear();
        Physics.debugDrawQueries = true;
        Physics.Raycast(new Vec3(0, 10, -5), new Vec3(0, -1, 0));
        Physics.SphereCast(new Vec3(0, 10, -5), 0.5, new Vec3(0, -1, 0));
        Physics.debugDrawQueries = false;
        check(S, 'debugDrawQueries stores lines', DebugDraw.count > 10, 'lines ' + DebugDraw.count);
        director.tick(DT);
    });
    if (backend === 'bullet' || backend === 'physx') {
        attempt(S, 'Emulated shape casts agree with the native ones', () => {
            const nat: number[] = [];
            const emu: number[] = [];
            for (let k = 0; k < 2; k++) {
                Physics.emulateShapeCasts = k === 1;
                const out = k === 0 ? nat : emu;
                out.push(Physics.SphereCast(new Vec3(0, 10, -5), 0.5, new Vec3(0, -1, 0), hit, 100) ? hit.distance : -1);
                out.push(Physics.BoxCast(new Vec3(0, 1, 0), new Vec3(0.5, 0.5, 0.5), new Vec3(0, 0, -1), hit, Quat.IDENTITY, 100) ? hit.distance : -1);
                out.push(Physics.CapsuleCast(new Vec3(0, 0.75, 0), new Vec3(0, 1.25, 0), 0.25, new Vec3(-1, 0, 0), hit, 100) ? hit.distance : -1);
            }
            Physics.emulateShapeCasts = false;
            let ok = true;
            for (let i = 0; i < nat.length; i++) if (!near(nat[i], emu[i], 0.05)) ok = false;
            check(S, 'Emulated shape casts agree with the native ones', ok, 'native ' + nat.map((x) => x.toFixed(3)).join(',') + ' / emulated ' + emu.map((x) => x.toFixed(3)).join(','));
        });
    }

    // ---- dynamics: messages, layer collision, ignore collision
    const dyn = backend !== 'builtin';
    attempt(S, 'Collision / trigger messages', () => {
        const bn = new Node('Faller');
        scene.addChild(bn);
        bn.setPosition(10, 6, 10);
        const col = bn.addComponent(SphereCollider) as SphereCollider;
        col.radius = 0.5;
        const rb = bn.addComponent(RigidBody) as RigidBody;
        rb.mass = 1;
        const probe = bn.addComponent(CollisionProbe) as CollisionProbe;
        const tz = box(scene, 'Zone', new Vec3(10, 2, 10), new Vec3(1, 0.5, 1), true);
        void tz;
        run(0.6); // the scene scan (every 0.5 s) adds PhysicsMessages
        const auto = !!bn.getComponent(PhysicsMessages);
        if (!auto) bn.addComponent(PhysicsMessages);
        if (!dyn) {
            // builtin: no dynamics; move it through the trigger by hand
            for (let i = 0; i < 60; i++) {
                bn.setPosition(10, 3 - i * 0.05, 10);
                director.tick(DT);
            }
        } else {
            run(2);
        }
        const c = probe.last as any;
        const n0 = c && c.contacts && c.contacts.length ? c.contacts[0].normal : null;
        check(S, 'PhysicsMessages auto-attached by the scene scan', auto);
        check(S, 'OnTriggerEnter received', probe.events.indexOf('TriggerEnter') >= 0, probe.events.join(','));
        note(S, 'OnTrigger*', probe.events.indexOf('TriggerEnter') >= 0 ? 'yes' : 'NO');
        if (dyn) {
            const good = probe.events.indexOf('CollisionEnter') >= 0 && !!n0 && n0.y > 0.9 && c.collider === ground && c.relativeVelocity.y > 1;
            check(S, 'OnCollisionEnter: ground contact, normal up into the ball, relativeVelocity up', good, 'events=' + probe.events.join(',') + ' n=' + (n0 ? v(n0) : '-') + ' p=' + (c && c.contacts.length ? v(c.contacts[0].point) : '-') + ' rv=' + (c ? v(c.relativeVelocity) : '-') + ' contacts=' + (c ? c.contacts.length : 0));
            note(S, 'OnCollision*', good ? 'yes' : probe.events.indexOf('CollisionEnter') >= 0 ? 'events yes, data off' : 'NO');
        } else {
            note(S, 'OnCollision*', 'no (builtin has no contacts)');
        }
        bn.destroy();
        director.tick(DT);
    });
    if (dyn) {
        attempt(S, 'IgnoreLayerCollision lets a body fall through', () => {
            const l = LayerMask.NameToLayer('Ghost');
            Physics.IgnoreLayerCollision(0, l, true);
            const gn = new Node('Ghosty');
            scene.addChild(gn);
            gn.setPosition(-10, 2, -10);
            (gn.addComponent(SphereCollider) as SphereCollider).radius = 0.5;
            const rb = gn.addComponent(RigidBody) as RigidBody;
            rb.group = 1 << l;
            director.tick(DT);
            LayerMask.SetLayer(gn, l);
            run(1.5);
            const y = gn.worldPosition.y;
            Physics.IgnoreLayerCollision(0, l, false);
            const back = !Physics.GetIgnoreLayerCollision(0, l);
            check(S, 'IgnoreLayerCollision lets a body fall through', y < -1 && back, 'y=' + y.toFixed(2));
            note(S, 'IgnoreLayerCollision', y < -1 ? 'yes' : 'NO');
            gn.destroy();
            director.tick(DT);
        });
        attempt(S, 'IgnoreCollision', () => {
            const gn = new Node('Ignored');
            scene.addChild(gn);
            gn.setPosition(-12, 2, -12);
            const sc = gn.addComponent(SphereCollider) as SphereCollider;
            sc.radius = 0.5;
            gn.addComponent(RigidBody);
            director.tick(DT);
            const native = Physics.IgnoreCollision(sc, ground, true);
            run(1.5);
            const y = gn.worldPosition.y;
            check(S, 'IgnoreCollision (native only on Bullet)', backend === 'bullet' ? native && y < -1 : Physics.GetIgnoreCollision(sc, ground), 'native=' + native + ' y=' + y.toFixed(2));
            note(S, 'IgnoreCollision', native && y < -1 ? 'yes' : 'messages only');
            Physics.IgnoreCollision(sc, ground, false);
            gn.destroy();
            director.tick(DT);
        });
    } else {
        note(S, 'IgnoreLayerCollision', 'n/a (no dynamics)');
        note(S, 'IgnoreCollision', 'messages only');
    }
}

// ------------------------------------------------------------------ 2D physics

function body2d(scene: Node, name: string, x: number, y: number, kind: 'box' | 'circle' | 'poly', a: number, b: number, type = ERigidBody2DType.Static, sensor = false): any {
    const n = new Node(name);
    scene.addChild(n);
    n.setPosition(x, y, 0);
    const rb = n.addComponent(RigidBody2D) as RigidBody2D;
    rb.type = type;
    rb.gravityScale = 1;
    let c: any;
    if (kind === 'box') {
        c = n.addComponent(BoxCollider2D);
        c.size = new Size(a, b);
    } else if (kind === 'circle') {
        c = n.addComponent(CircleCollider2D);
        c.radius = a;
    } else {
        c = n.addComponent(PolygonCollider2D);
        c.points = [new Vec2(-a, -a), new Vec2(a, -a), new Vec2(0, a)];
    }
    c.sensor = sensor;
    c.apply();
    return c;
}

function physics2d(backend: string): void {
    const S = '2d/' + backend;
    newScene('empty2');
    director.tick(DT);
    selector2D.switchTo(backend);
    console.log('\n# 2D backend ' + selector2D.id);
    const scene = newScene('p2d-' + backend);
    const ground = body2d(scene, 'Ground', 0, -50, 'box', 2000, 100);
    const crate = body2d(scene, 'Crate', 200, 100, 'box', 100, 100);
    const ball = body2d(scene, 'Ball', -200, 100, 'circle', 50, 0);
    const tri = body2d(scene, 'Tri', 0, 300, 'poly', 50, 0);
    const sensor = body2d(scene, 'Sensor', 400, 100, 'box', 100, 100, ERigidBody2DType.Static, true);
    const enemyLayer = LayerMask.NameToLayer('Enemy');
    crate.group = 1 << enemyLayer;
    director.tick(DT);
    void tri;

    attempt(S, 'Raycast down onto the crate', () => {
        const h = Physics2D.Raycast(new Vec2(200, 500), new Vec2(0, -1));
        const good = !!h && h.collider === crate && near(h.point.y, 150, 0.5) && near(h.distance, 350, 0.5) && near(h.normal.y, 1, 0.01);
        check(S, 'Raycast down onto the crate', good, h ? 'p=' + v(h.point) + ' n=' + v(h.normal) + ' d=' + h.distance.toFixed(2) + ' f=' + h.fraction.toFixed(5) : 'null');
        note(S, 'Raycast', good ? 'yes' : 'NO');
        const miss = Physics2D.Raycast(new Vec2(200, 500), new Vec2(0, 1));
        check(S, 'Raycast miss returns null', miss === null);
    });
    attempt(S, 'Raycast onto the circle', () => {
        const h = Physics2D.Raycast(new Vec2(0, 100), new Vec2(-1, 0), 1000);
        check(S, 'Raycast onto the circle', !!h && h.collider === ball && near(h.point.x, -150, 0.5) && near(h.normal.x, 1, 0.01), h ? v(h.point) + ' n=' + v(h.normal) : 'null');
    });
    attempt(S, 'Raycast layer mask', () => {
        const h = Physics2D.Raycast(new Vec2(200, 500), new Vec2(0, -1), Infinity, ~LayerMask.GetMask('Enemy'));
        check(S, 'Raycast layer mask', !!h && h.collider === ground, h ? h.collider!.node.name : 'null');
    });
    attempt(S, 'RaycastAll through the sensor; queriesHitTriggers', () => {
        const all = Physics2D.RaycastAll(new Vec2(400, 500), new Vec2(0, -1));
        Physics2D.queriesHitTriggers = false;
        const noT = Physics2D.RaycastAll(new Vec2(400, 500), new Vec2(0, -1));
        const first = Physics2D.Raycast(new Vec2(400, 500), new Vec2(0, -1));
        Physics2D.queriesHitTriggers = true;
        const good = all.length === 2 && all[0].collider === sensor && noT.length === 1 && !!first && first.collider === ground;
        check(S, 'RaycastAll through the sensor; queriesHitTriggers', good, all.map((h) => h.collider!.node.name + '@' + h.distance.toFixed(1)).join(',') + ' / no triggers ' + noT.length);
        note(S, 'triggers filter', good ? 'yes' : 'NO');
    });
    attempt(S, 'Raycast starting inside reports distance 0', () => {
        const h = Physics2D.Raycast(new Vec2(200, 100), new Vec2(1, 0));
        check(S, 'Raycast starting inside reports distance 0', !!h && h.collider === crate && h.distance === 0, h ? h.collider!.node.name + '@' + h.distance : 'null');
    });
    attempt(S, 'CircleCast / BoxCast / CapsuleCast down onto the crate', () => {
        const c = Physics2D.CircleCast(new Vec2(200, 500), 10, new Vec2(0, -1));
        const b = Physics2D.BoxCast(new Vec2(200, 500), new Vec2(20, 20), 0, new Vec2(0, -1));
        const k = Physics2D.CapsuleCast(new Vec2(200, 500), new Vec2(20, 40), US.CapsuleDirection2D.Vertical, 0, new Vec2(0, -1));
        const good = !!c && near(c.distance, 340, 0.5) && near(c.point.y, 150, 0.5) && !!b && near(b.distance, 340, 0.5) && !!k && near(k.distance, 330, 0.5) && near(c.normal.y, 1, 0.01) && near(b.centroid.y, 160, 0.5);
        check(S, 'CircleCast / BoxCast / CapsuleCast down onto the crate', good, [c, b, k].map((h) => (h ? h.distance.toFixed(2) + ' p' + v(h.point) + ' n' + v(h.normal) : 'null')).join(' | '));
        note(S, 'Circle/Box/CapsuleCast', good ? 'yes (geometric)' : 'NO');
        const r = Physics2D.BoxCast(new Vec2(200, 500), new Vec2(20, 20), 45, new Vec2(0, -1));
        check(S, 'BoxCast rotated 45 deg', !!r && near(r.distance, 350 - 10 * Math.SQRT2, 0.5), r ? r.distance.toFixed(2) : 'null');
    });
    attempt(S, 'Overlaps', () => {
        const p = Physics2D.OverlapPoint(new Vec2(200, 100));
        const pc = Physics2D.OverlapPoint(new Vec2(-200, 140));
        const pn = Physics2D.OverlapPoint(new Vec2(-160, 140)); // outside the circle, inside its box
        const c = Physics2D.OverlapCircleAll(new Vec2(130, 100), 25);
        const bx = Physics2D.OverlapBox(new Vec2(300, 200), new Vec2(60, 60), 45); // rotated corner reaches (257.6,157.6)? no; diamond tip at y=157.6 -> no crate (corner at 250,150)
        const area = Physics2D.OverlapAreaAll(new Vec2(-1000, 120), new Vec2(1000, 200));
        const good = p === crate && pc === ball && pn === null && c.length === 1 && c[0] === crate && bx === null && area.length === 3;
        check(S, 'Overlaps', good, 'point=' + (p && p.node.name) + ' circle-pt=' + (pc && pc.node.name) + ' corner=' + (pn && pn.node.name) + ' circle=' + c.length + ' rotbox=' + (bx && bx.node.name) + ' area=' + area.map((x) => x.node.name).join(','));
        note(S, 'Overlap*', good ? 'yes' : 'NO');
    });
    attempt(S, 'Collision2D / trigger messages', () => {
        const faller = body2d(scene, 'Faller', 600, 300, 'circle', 20, 0, ERigidBody2DType.Dynamic);
        const zone = body2d(scene, 'Zone2', 600, 150, 'box', 60, 20, ERigidBody2DType.Static, true);
        void zone;
        const probe = faller.node.addComponent(CollisionProbe) as CollisionProbe;
        faller.node.addComponent(PhysicsMessages);
        if (backend === 'builtin') {
            for (let i = 0; i < 60; i++) {
                faller.node.setPosition(600, 300 - i * 5, 0);
                director.tick(DT);
            }
        } else {
            run(3);
        }
        const c = probe.last as any;
        const n0 = c && c.contacts && c.contacts.length ? c.contacts[0].normal : null;
        check(S, 'OnTriggerEnter2D / Exit2D', probe.events.indexOf('TriggerEnter2D') >= 0, probe.events.join(','));
        note(S, 'OnTrigger*2D', probe.events.indexOf('TriggerEnter2D') >= 0 ? 'yes' : 'NO');
        if (backend !== 'builtin') {
            const good = probe.events.indexOf('CollisionEnter2D') >= 0 && probe.events.indexOf('CollisionStay2D') >= 0 && !!n0 && n0.y > 0.9 && c.collider === ground;
            check(S, 'OnCollisionEnter2D (normal up into the ball) and Stay2D', good, 'events=' + probe.events.join(',') + ' n=' + (n0 ? v(n0) : '-') + ' contacts=' + (c ? c.contacts.length : 0) + ' rv=' + (c ? v(c.relativeVelocity) : '-'));
            note(S, 'OnCollision*2D', good ? 'yes' : 'NO');
        } else {
            note(S, 'OnCollision*2D', 'events only (no dynamics)');
        }
    });
}

// ------------------------------------------------------------------ engine module

function engineSection(): void {
    const S = 'engine';
    physics.selector.switchTo('bullet');
    const scene = newScene('engine');
    director.tick(DT);

    attempt(S, 'Decorators register properties', () => {
        const name = js.getClassName(LifecycleProbe);
        const props: string[] = (LifecycleProbe as any).__props__ || [];
        const attr = (k: string): any => (CCClass as any).Attr.attr(LifecycleProbe, k) || {};
        const hp = attr('hp');
        const tgt = attr('target');
        const wps = attr('waypoints');
        const cnt = attr('count');
        const sec = attr('secret');
        const meta = (LifecycleProbe as any).__advInspectorMeta__;
        const titles = meta ? meta.members.filter((m: any) => m.title || m.spaceBefore).map((m: any) => m.name + (m.title ? ':title' : ':space')).join(',') : '';
        const conds: { [k: string]: boolean } = {
            name: name === 'LifecycleProbe', hp: props.indexOf('hp') >= 0, notSaved: props.indexOf('notSaved') < 0, log: props.indexOf('log') < 0,
            range: hp.min === 0 && hp.max === 200 && hp.slide === true, tooltip: hp.tooltip === 'Hit points', target: tgt.ctor === Node, waypoints: wps.type === 'Object' && wps.ctor === Node,
            count: String(cnt.type) === 'Integer', hidden: sec.visible === false, saved: hp.serializable !== false && sec.serializable !== false && cnt.serializable !== false, meta: titles === 'hp:title,count:space',
        };
        const bad = Object.keys(conds).filter((k) => !conds[k]);
        const good = bad.length === 0;
        check(S, 'Decorators register properties', good, (bad.length ? 'failed: ' + bad.join(',') + ' ' : '') + 'class=' + name + ' props=' + props.join(',') + ' hp=' + JSON.stringify({ min: hp.min, max: hp.max, slide: hp.slide, tooltip: hp.tooltip }) + ' target.ctor=' + (tgt.ctor && js.getClassName(tgt.ctor)) + ' waypoints=' + JSON.stringify({ type: wps.type, ctor: wps.ctor && js.getClassName(wps.ctor) }) + ' count.type=' + cnt.type + ' secret.visible=' + sec.visible + ' meta=' + titles);
    });
    attempt(S, '@ccclass/@property still work beside MonoBehaviour', () => {
        const props: string[] = (BothHooks as any).__props__ || [];
        check(S, '@ccclass/@property still work beside MonoBehaviour', js.getClassName(BothHooks) === 'fixture.BothHooks' && props.indexOf('speed') >= 0);
    });
    attempt(S, 'Nameless data classes get stable names', () => {
        const a = js.getClassName(Stats);
        const b = js.getClassName(Named);
        const c = js.getClassName(Loot);
        const d = js.getClassName(DataClasses);
        const statsProps: string[] = (Stats as any).__props__ || [];
        check(S, 'Nameless data classes get stable names', a === 'DataClasses.1' && b === 'fixture.NamedData' && c === 'DataClasses.2' && d === 'DataClasses' && statsProps.indexOf('speed') >= 0, [a, b, c, d].join(' '));
    });
    attempt(S, 'RequireComponent adds the required component', () => {
        const n = new Node('Req');
        scene.addChild(n);
        n.addComponent(DataClasses);
        check(S, 'RequireComponent adds the required component', !!n.getComponent(Tag));
        n.destroy();
    });

    attempt(S, 'Lifecycle mapping and FixedUpdate', () => {
        const n = new Node('Probe');
        scene.addChild(n);
        const p = n.addComponent(LifecycleProbe) as LifecycleProbe;
        const both = n.addComponent(BothHooks) as BothHooks;
        const plog = p.log; // Cocos nulls a destroyed component's fields: keep the arrays
        const bcalls = both.calls;
        run(1);
        const fixedPerSec = p.fixed;
        const updates = p.updates;
        n.active = false;
        n.active = true;
        n.destroy();
        director.tick(DT);
        const seq = plog.join(',');
        const expect = 'Awake,OnEnable,Start,LateUpdate,OnDisable,OnEnable,OnDisable,OnDestroy';
        check(S, 'Unity messages run in Cocos order', seq === expect, seq);
        check(S, 'Update called each frame', updates >= 59 && updates <= 62, 'updates=' + updates);
        check(S, 'FixedUpdate at the fixed step', fixedPerSec >= 58 && fixedPerSec <= 61, 'fixed=' + fixedPerSec + ' step=' + Time.fixedDeltaTime);
        const counts: { [k: string]: number } = {};
        for (const c of bcalls) counts[c] = (counts[c] || 0) + 1;
        check(S, 'camelCase hook wins, no double calls', !counts.Awake && counts.onLoad === 1 && !counts.Update && counts.update >= 59 && counts.Start === 1, JSON.stringify(counts));
    });

    attempt(S, 'GetComponentInChildren / InParent', () => {
        const root = new Node('Root');
        scene.addChild(root);
        const a = new Node('A');
        root.addChild(a);
        const b = new Node('B');
        a.addChild(b);
        const host = root.addComponent(LifecycleProbe) as LifecycleProbe;
        const deep = b.addComponent(Tag) as any;
        a.active = false;
        const hidden = host.GetComponentInChildren(Tag);
        const found = host.GetComponentInChildren(Tag, true);
        a.active = true;
        const found2 = host.GetComponentInChildren(Tag);
        const all = host.GetComponentsInChildren(LifecycleProbe);
        const up = (deep.node as Node).getComponent(Tag) ? MonoBehaviour.inChildren(root, Tag, false) : null;
        const bProbe = b.addComponent(LifecycleProbe) as LifecycleProbe;
        const par = bProbe.GetComponentInParent(LifecycleProbe);
        const pars = bProbe.GetComponentsInParent(LifecycleProbe);
        const self = { value: null as any };
        const tried = host.TryGetComponent(LifecycleProbe, self);
        check(S, 'GetComponentInChildren / InParent', hidden === null && found === deep && found2 === deep && all.length === 1 && up === deep && par === bProbe && pars.length === 2 && tried && self.value === host, [hidden, !!found, !!found2, all.length, !!up, par === bProbe, pars.length, tried].join(' '));
        root.destroy();
        director.tick(DT);
    });

    attempt(S, 'Invoke / InvokeRepeating / CancelInvoke', () => {
        const n = new Node('Inv');
        scene.addChild(n);
        const p = n.addComponent(LifecycleProbe) as LifecycleProbe;
        director.tick(DT);
        p.log.length = 0;
        const t0 = Time.time;
        p.Invoke('Ping', 0.5);
        let count = 0;
        p.InvokeRepeating(() => count++, 0.1, 0.1);
        const inv = p.IsInvoking('Ping');
        run(0.75);
        p.CancelInvoke();
        const after = count;
        run(0.3);
        const pinged = p.log.filter((l) => l.indexOf('Ping@') === 0);
        const at = pinged.length ? parseFloat(pinged[0].slice(5)) - t0 : -1;
        check(S, 'Invoke / InvokeRepeating / CancelInvoke', inv && pinged.length === 1 && near(at, 0.5, 0.04) && after >= 6 && after <= 7 && count === after && !p.IsInvoking(), 'ping after ' + at.toFixed(3) + ' s, repeats ' + after + ' then ' + count);
        n.destroy();
        director.tick(DT);
    });

}

async function coroutineSection(): Promise<void> {
    const S = 'engine';
    const scene = director.getScene() as Scene;
    try {
        const n = new Node('Co');
        scene.addChild(n);
        const p = n.addComponent(LifecycleProbe) as LifecycleProbe;
        director.tick(DT);
        p.log.length = 0;
        const t0 = Time.time;
        const co = p.StartCoroutine(p.Seconds());
        const sync = p.log.join(',');
        director.tick(DT);
        run(0.6);
        p.flag = true;
        director.tick(DT);
        director.tick(DT);
        p.flag = false;
        run(0.2);
        // let the promise settle (microtasks run between frames in a real game)
        await new Promise((r) => setTimeout(r, 1));
        {
            run(0.2);
            const s = p.log.join(',');
            const halfs = p.log.filter((l) => l.indexOf('co:0.5s@') === 0).map((l) => parseFloat(l.slice(8)) - t0);
            const order = ['co:start', 'co:frame', 'co:0.5s', 'co:until', 'co:while', 'child:1', 'child:2', 'co:after-child', 'co:promise=42', 'co:eof', 'co:fixed'];
            let at = 0;
            let ordered = true;
            for (const o of order) {
                const i = p.log.findIndex((l, k) => k >= at && l.indexOf(o) === 0);
                if (i < 0) ordered = false;
                else at = i;
            }
            check(S, 'Coroutine: yields, nesting, promise, end of frame, fixed', sync === 'co:start' && ordered && !!co && co.isDone && halfs.length === 1 && halfs[0] >= 0.5 && halfs[0] < 0.55, s + ' | 0.5s at ' + (halfs[0] || -1).toFixed(3));
            // stop on deactivate, and StopCoroutine by name
            p.log.length = 0;
            p.StartCoroutine('Forever');
            run(0.1);
            const ticks = p.log.filter((l) => l === 'tick').length;
            n.active = false;
            run(0.1);
            n.active = true;
            run(0.1);
            const after = p.log.filter((l) => l === 'tick').length;
            p.StartCoroutine('Forever');
            run(0.05);
            p.StopCoroutine('Forever');
            const c1 = p.log.filter((l) => l === 'tick').length;
            run(0.1);
            check(S, 'Coroutines stop on deactivate and by name', ticks >= 5 && after === ticks && p.log.filter((l) => l === 'tick').length === c1, 'ticks ' + ticks + ' after reactivate ' + after + ' after stop ' + (p.log.filter((l) => l === 'tick').length - c1));
            n.destroy();
            director.tick(DT);
        }
    } catch (e: any) {
        check(S, 'Coroutines', false, 'threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    }
}

function engineSection2(): void {
    const S = 'engine';
    const scene = director.getScene() as Scene;
    attempt(S, 'Time.timeScale scales the frame', () => {
        const n = new Node('TS');
        scene.addChild(n);
        const p = n.addComponent(LifecycleProbe) as LifecycleProbe;
        director.tick(DT);
        Time.timeScale = 0.5;
        const t0 = Time.time;
        const f0 = p.fixed;
        run(1);
        const dt = Time.deltaTime;
        const t1 = Time.time - t0;
        const fixed = p.fixed - f0;
        Time.timeScale = 0;
        const f1 = p.fixed;
        run(0.5);
        const frozen = p.fixed === f1;
        Time.timeScale = 1;
        check(S, 'Time.timeScale scales the frame', Time.timeScaleSupported && near(dt, DT / 2, 1e-6) && near(t1, 0.5, 0.02) && fixed >= 28 && fixed <= 31 && frozen && near(Time.unscaledDeltaTime, DT, 1e-6), 'dt=' + dt.toFixed(5) + ' time+=' + t1.toFixed(3) + ' fixed=' + fixed + ' frozen=' + frozen);
        n.destroy();
        director.tick(DT);
    });
    attempt(S, 'Tags, Find, Instantiate, Destroy(t)', () => {
        const a = new Node('Player');
        scene.addChild(a);
        Tag.set(a, 'Player');
        const p = a.addComponent(LifecycleProbe) as LifecycleProbe;
        p.hp = 7;
        a.setPosition(1, 2, 3);
        director.tick(DT);
        const byTag = GameObject.FindWithTag('Player');
        const byName = GameObject.Find('Player');
        const clone = US.Instantiate(p, new Vec3(5, 0, 0), Quat.IDENTITY);
        const clones = US.FindObjectsOfType(LifecycleProbe);
        const cloneX = clone.node.worldPosition.x;
        const cloneHp = clone.hp;
        US.Destroy(clone, 0.5);
        run(0.3);
        const alive = clone.isValid;
        run(0.4);
        const gone = !clone.isValid;
        const prim = GameObject.CreatePrimitive(US.PrimitiveType.Cube);
        check(S, 'Tags, Find, Instantiate, Destroy(t)', byTag === a && byName === a && p.CompareTag('Player') && clone !== p && cloneHp === 7 && near(cloneX, 5) && clones.length === 2 && alive && gone && !!prim.getComponent(BoxCollider),
            [byTag === a, byName === a, cloneHp, cloneX, clones.length, alive, gone, !!prim.getComponent(BoxCollider)].join(' '));
        a.destroy();
        prim.destroy();
        director.tick(DT);
    });
    attempt(S, 'Transform helpers', () => {
        const n = new Node('T');
        scene.addChild(n);
        const p = n.addComponent(LifecycleProbe) as LifecycleProbe;
        p.Translate(new Vec3(0, 0, -1));
        p.Rotate(0, 90, 0);
        p.Translate(new Vec3(0, 0, -1));
        const pos = p.position;
        p.LookAt(new Vec3(pos.x, pos.y, pos.z - 10));
        const f = p.forward;
        check(S, 'Transform helpers', near(pos.x, -1, 1e-4) && near(pos.z, -1, 1e-4) && near(f.z, -1, 1e-4), 'pos=' + v(pos) + ' forward after LookAt=' + v(f));
        n.destroy();
    });
}

async function main(): Promise<void> {
    await waitForAmmoInstantiation();
    await initPhysXLibs();
    await waitForBox2dWasmInstantiation();
    game.on(Game.EVENT_POST_SUBSYSTEM_INIT, () => {
        effects.forEach((e: any, ei: number) => {
            const effect = Object.assign(new EffectAsset(), e);
            effect.shaders.forEach((si: any, k: number) => {
                const src = (glsl4 as any)[ei][k];
                if (src) si['glsl4'] = src;
            });
            effect.hideInEditor = true;
            effect.onLoaded();
        });
        initBuiltinMaterial();
    });
    await game.init({ debugMode: DebugMode.INFO, overrideSettings: { rendering: { renderMode: 3 } } } as any);
    await game.run();
    game.pause();
    if (!PhysicsSystem.instance) (PhysicsSystem as any).constructAndRegister();
    PhysicsSystem.instance.setDefaultPhysicsMaterial(builtinResMgr.get<PhysicsMaterial>('default-physics-material') || new PhysicsMaterial());
    // project collision groups, as Project Settings > Physics would write them
    settings.overrideSettings('physics', 'collisionGroups', [{ index: 1, name: 'Enemy' }, { index: 2, name: 'IGNORE_RAYCAST' }, { index: 3, name: 'Ghost' }]);
    const cm: any = PhysicsSystem.instance.collisionMatrix;
    for (let i = 0; i < 4; i++) cm[1 << i] = 0xf;
    const cm2: any = PhysicsSystem2D.instance.collisionMatrix;
    for (let i = 0; i < 4; i++) cm2[1 << i] = 0xf;
    LayerMask.refresh();
    const only = process.argv[2];

    if (!only || only === 'layers') {
        const S = 'layers';
        check(S, 'NameToLayer / LayerToName / GetMask', LayerMask.NameToLayer('Default') === 0 && LayerMask.NameToLayer('enemy') === 1 && LayerMask.NameToLayer('Ignore Raycast') === 2 && LayerMask.LayerToName(3) === 'Ghost' && LayerMask.GetMask('Enemy', 'Ghost') === 10 && LayerMask.GetMask(['Default', 'Nope']) === 1,
            LayerMask.table.names.slice(0, 5).join('|'));
        check(S, 'DefaultRaycastLayers excludes Ignore Raycast', Physics.IgnoreRaycastLayer === 4 && (Physics.DefaultRaycastLayers & 4) === 0);
    }
    if (!only || only === 'physics3d') {
        for (const b of ['builtin', 'cannon.js', 'bullet', 'physx']) physics3d(b);
    }
    if (!only || only === 'physics2d') {
        for (const b of ['box2d-wasm', 'builtin']) {
            if (!(selector2D as any).backend[b]) {
                console.log('2D backend ' + b + ' not registered, skipped');
                continue;
            }
            physics2d(b);
        }
    }
    if (!only || only === 'engine') {
        engineSection();
        await coroutineSection();
        engineSection2();
    }

    console.log('\n# support matrix (measured)');
    const feats: string[] = [];
    for (const k in matrix) for (const f in matrix[k]) if (feats.indexOf(f) < 0) feats.push(f);
    for (const k in matrix) console.log('  ' + k + ': ' + feats.filter((f) => matrix[k][f] !== undefined).map((f) => f + '=' + matrix[k][f]).join('; '));
    const failed = results.filter((r) => !r.ok).length;
    console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error('CRASH', e);
    process.exit(2);
});
