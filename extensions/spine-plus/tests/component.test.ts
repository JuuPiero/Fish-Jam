import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { Node, Quat, Texture2D, Vec3, sp } from 'cc';
// Test-only class of the engine stub (tests/stubs/cc.ts).
const { RenderScene } = require('cc') as any;
import { SkeletonAnimation, SPINE_UI_MATERIAL, SPINE_WORLD_MATERIAL } from '../assets/SkeletonAnimation';
import { SkeletonUIRenderer } from '../assets/SkeletonUIRenderer';
import { BoneFollower } from '../assets/BoneFollower';
import { available, FIXTURES } from './fixtures';
import { done, skip, test } from './harness';

/** A spine-data asset like the Cocos importer makes (JSON export). */
function asset(fixtureName: string): any {
    const f = FIXTURES.find((x) => x.name.startsWith(fixtureName))!;
    const a: any = new (sp as any).SkeletonData();
    a.name = fixtureName;
    a._skeletonJson = JSON.parse(fs.readFileSync(path.join(f.dir, f.skeleton), 'utf8'));
    a.atlasText = fs.readFileSync(path.join(f.dir, f.atlas), 'utf8');
    a.textures = [new Texture2D('skeleton.png')];
    a.textureNames = ['skeleton.png'];
    return a;
}

function scene(): any {
    const s: any = new Node('scene');
    s.isScene = true;
    s.renderScene = new RenderScene();
    return s;
}

function skeletonNode(data: any, parent = scene()): { node: any; comp: SkeletonAnimation } {
    const node = new Node('Spine');
    node.setParent(parent);
    const comp = node.addComponent(SkeletonAnimation) as SkeletonAnimation;
    comp.skeletonData = data;
    comp.skin = 'sprite_0000';
    comp.animation = 'animation';
    return { node, comp };
}

function frame(comp: SkeletonAnimation, dt = 1 / 60): void {
    comp.update(dt);
    comp.lateUpdate();
}

const haveFish = available(FIXTURES[0]);
const have43 = available(FIXTURES[1]);

if (!haveFish) {
    skip('component tests', 'Fish sample not found');
} else {
    const fish = asset('Fish');

    test('loads the asset with the 4.2 runtime and draws one batch per texture/blend', () => {
        const { node, comp } = skeletonNode(fish);
        frame(comp);
        assert.strictEqual(comp.loadError, '');
        assert.strictEqual(comp.runtimeVersion, '4.2');
        const models = comp._collectModels();
        assert.ok(models.length >= 1, 'a batch model');
        const m: any = models[0];
        assert.ok(m.enabled, 'enabled');
        assert.strictEqual(m.node, node);
        const ia = m.subModels[0].inputAssembler;
        assert.ok(ia.indexCount > 0 && ia.indexCount % 3 === 0, 'indices');
        assert.strictEqual(ia.vertexCount, comp.mesh.vertexCount);
        // Vertex buffer holds 28 bytes per vertex.
        assert.strictEqual(ia.vertexBuffers[0].data.byteLength, comp.mesh.vertexCount * 28);
        // Material instance: parent is the default material (world, outside a Canvas), texture and blend set.
        const mat: any = m.subModels[0].material;
        assert.strictEqual(mat.parent.name, SPINE_WORLD_MATERIAL);
        assert.ok(mat.props.mainTexture instanceof Texture2D);
        const t = mat.states.blendState.targets[0];
        assert.deepStrictEqual([t.blendSrc, t.blendDst], [2, 4], 'straight alpha normal blend (SRC_ALPHA, ONE_MINUS_SRC_ALPHA)');
        // Models are in the render scene (3D path).
        assert.ok((node.scene as any).renderScene.models.includes(m));
    });

    test('alpha mode switches blend factors and vertex colors', () => {
        const { comp } = skeletonNode(fish);
        frame(comp);
        const straight = comp.mesh.colors[5];
        comp.alphaMode = 1; // Premultiplied
        frame(comp);
        const mat: any = (comp._collectModels()[0] as any).subModels[0].material;
        assert.strictEqual(mat.states.blendState.targets[0].blendSrc, 1, 'ONE for premultiplied');
        // Dark color alpha is 1 for PMA.
        assert.strictEqual(comp.mesh.colors[6] >>> 24, 255);
        assert.ok(typeof straight === 'number');
    });

    test('node movement is passed to physics in skeleton space (rotation, scale, inheritance, limits)', () => {
        const { node, comp } = skeletonNode(fish);
        frame(comp);
        const calls: number[][] = [];
        const inst: any = comp.instance;
        const orig = inst.physicsTranslate.bind(inst);
        inst.physicsTranslate = (x: number, y: number) => {
            calls.push([x, y]);
            orig(x, y);
        };
        // Rotated 90° and scaled 2: moving +10 on world X is -5 on local Y.
        node.rotation = Quat.fromEuler(new Quat(), 0, 0, 90);
        node.scale = new Vec3(2, 2, 1);
        comp.resetLastPosition();
        frame(comp);
        node.position = new Vec3(10, 0, 0);
        frame(comp);
        const last = calls[calls.length - 1];
        assert.ok(Math.abs(last[0]) < 1e-6 && Math.abs(last[1] + 5) < 1e-6, `got ${last}`);
        // Inheritance factors scale it, limits clamp it.
        comp.physicsPositionInheritance = new (require('cc').Vec2)(0.5, 0.5);
        comp.physicsPositionLimit = new (require('cc').Vec2)(0, 1);
        node.position = new Vec3(20, 0, 0);
        frame(comp);
        const l2 = calls[calls.length - 1];
        assert.ok(Math.abs(l2[1] + 1) < 1e-6, `clamped to -1, got ${l2}`);
        // Zero inheritance: nothing passed.
        comp.physicsPositionInheritance = new (require('cc').Vec2)(0, 0);
        const n = calls.length;
        node.position = new Vec3(40, 0, 0);
        frame(comp);
        assert.strictEqual(calls.length, n);
    });

    test('rotation is passed to physics (wrapped, times the factor)', () => {
        const { node, comp } = skeletonNode(fish);
        frame(comp);
        const rot: number[] = [];
        const inst: any = comp.instance;
        inst.physicsRotate = (_x: number, _y: number, d: number) => rot.push(d);
        node.rotation = Quat.fromEuler(new Quat(), 0, 0, 170);
        comp.resetLastPosition();
        frame(comp);
        node.rotation = Quat.fromEuler(new Quat(), 0, 0, -170);
        comp.physicsRotationInheritance = 0.5;
        frame(comp);
        assert.ok(Math.abs(rot[rot.length - 1] - 10) < 1e-4, `20° across ±180 times 0.5, got ${rot}`);
    });

    test('physics off: movement is ignored', () => {
        const { node, comp } = skeletonNode(fish);
        comp.usePhysics = false;
        frame(comp);
        let called = false;
        (comp.instance as any).physicsTranslate = () => (called = true);
        node.position = new Vec3(50, 0, 0);
        frame(comp);
        assert.ok(!called);
    });

    test('flip, color and UI opacity change the mesh', () => {
        const { comp, node } = skeletonNode(fish);
        frame(comp);
        const maxX = comp.mesh.maxX;
        const minX = comp.mesh.minX;
        comp.flipX = true;
        frame(comp, 0);
        assert.ok(Math.abs(comp.mesh.maxX + minX) < 2 && Math.abs(comp.mesh.minX + maxX) < 2, 'mirrored bounds');
        comp.color = new (require('cc').Color)(255, 0, 0, 128);
        (node as any)._uiProps = { opacity: 0.5 };
        frame(comp, 0);
        const c = comp.mesh.colors[5];
        assert.ok((c >>> 24) <= 64 && (c >>> 24) >= 60, `alpha 255 * 0.5 * 0.5, got ${c >>> 24}`);
        assert.strictEqual((c >>> 8) & 255, 0, 'green tinted out');
    });

    test('skin and animation can change at runtime; unknown names warn instead of throwing', () => {
        const { comp } = skeletonNode(fish);
        frame(comp);
        comp.skin = 'sprite_0005';
        frame(comp);
        assert.ok(comp.mesh.vertexCount > 0);
        const warn = console.warn;
        console.warn = () => undefined;
        try {
            assert.strictEqual(comp.setAnimation(0, 'nope', true), null);
            comp.skin = 'nope';
        } finally {
            console.warn = warn;
        }
        assert.ok(comp.setAnimation(0, 'animation', false));
        let completes = 0;
        comp.setCompleteListener(() => completes++);
        for (let i = 0; i < 400; i++) frame(comp, 1 / 30);
        assert.ok(completes >= 1, 'complete listener fired');
    });

    test('SkeletonUIRenderer commits each batch with its own material, models stay out of the 3D scene', () => {
        const parent = scene();
        const canvas = new Node('Canvas');
        canvas.setParent(parent);
        canvas.addComponent(require('cc').UITransform);
        const { node, comp } = skeletonNode(fish, canvas);
        node.addComponent(SkeletonUIRenderer);
        frame(comp);
        const ui = node.getComponent(SkeletonUIRenderer) as any;
        assert.strictEqual((comp.getSharedMaterial(0) as any).name, SPINE_UI_MATERIAL, 'UI material in a Canvas');
        const commits: any[] = [];
        ui._render({ commitModel: (c: any, model: any, mat: any) => commits.push({ c, model, mat }) });
        assert.ok(commits.length >= 1);
        assert.strictEqual(commits[0].c, ui);
        assert.strictEqual(commits[0].mat, commits[0].model.subModels[0].material, 'the batch material, not material 0');
        assert.ok(!(parent as any).renderScene.models.length, 'not in the 3D scene');
        comp.fitUITransform();
        const t: any = node.getComponent(require('cc').UITransform);
        assert.ok(t.width > 10 && t.height > 10, `fitted ${t.width}x${t.height}`);
    });

    test('BoneFollower follows a bone in world space', () => {
        const s = scene();
        const { node, comp } = skeletonNode(fish, s);
        node.position = new Vec3(100, 50, 0);
        frame(comp);
        const follower = new Node('follower');
        follower.setParent(s);
        const bf = follower.addComponent(BoneFollower) as BoneFollower;
        bf.skeletonAnimation = comp;
        bf.boneName = 'root';
        bf.lateUpdate();
        const expect = comp.getBoneWorldPosition('root')!;
        assert.ok(Vec3.distance(follower.worldPosition, expect) < 1e-4, `${JSON.stringify(follower.worldPosition)} vs ${JSON.stringify(expect)}`);
    });

    test('missing data and unsupported versions report an error and draw nothing', () => {
        const bad: any = new (sp as any).SkeletonData();
        bad._skeletonJson = { skeleton: { spine: '3.8.99' } };
        const warn = console.warn;
        console.warn = () => undefined;
        let comp: SkeletonAnimation;
        try {
            comp = skeletonNode(bad).comp;
            frame(comp);
        } finally {
            console.warn = warn;
        }
        assert.ok(/3\.8/.test(comp!.loadError));
        assert.ok(!comp!._collectModels().some((m: any) => m.enabled));
        comp!.skeletonData = null;
        frame(comp!);
        assert.strictEqual(comp!.loadError, '');
    });
}

if (have43) {
    test('4.3 export plays with the 4.3 runtime and its physics reacts to movement', () => {
        const data = asset('exports_4.3');
        const { node, comp } = skeletonNode(data);
        frame(comp);
        assert.strictEqual(comp.runtimeVersion, '4.3');
        assert.ok(comp.mesh.vertexCount > 0);
        const rest: number[] = [];
        for (const b of comp.skeleton.bones) rest.push(comp.instance!.boneWorld(b).a);
        for (let i = 0; i < 8; i++) {
            node.position = new Vec3(i % 2 ? -30 : 30, 0, 0);
            frame(comp);
        }
        let diff = 0;
        const still = skeletonNode(data).comp;
        for (let i = 0; i < 9; i++) frame(still);
        comp.skeleton.bones.forEach((b: any, i: number) => {
            diff = Math.max(diff, Math.abs(comp.instance!.boneWorld(b).a - still.instance!.boneWorld(still.skeleton.bones[i]).a));
        });
        assert.ok(diff > 1e-3, `shaken skeleton differs from a still one (${diff.toFixed(4)})`);
        void rest;
    });
}

done();
