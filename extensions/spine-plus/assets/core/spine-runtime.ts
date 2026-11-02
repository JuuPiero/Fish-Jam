// Loads Spine exports with the matching runtime and wraps a skeleton +
// animation state behind one small API for both versions. No engine
// dependencies (shared by the component, the preview panel and the tests).
import type { S42, S43 } from './spine-libs';
import { detectVersion, RuntimeVersion, spine42, spine43, VersionInfo } from './spine-libs';
import { MeshBuilder, MeshOptions, SpineMesh } from './spine-mesh';

export type AnySkeleton = S42.Skeleton | S43.Skeleton;
export type AnyAnimationState = S42.AnimationState | S43.AnimationState;
export type AnyTrackEntry = S42.TrackEntry | S43.TrackEntry;
export type AnyBone = S42.Bone | S43.Bone;
export type AnySlot = S42.Slot | S43.Slot;
export type AnySkeletonData = S42.SkeletonData | S43.SkeletonData;

/** What a Spine export is made of, wherever it came from. */
export interface SpineSource {
    /** Parsed JSON (object or string), or null for binary exports. */
    json: any;
    /** Binary (.skel) bytes, or null for JSON exports. */
    binary: Uint8Array | null;
    atlasText: string;
    /** Texture for an atlas page (handed back in MeshBatch.texture as `.image`). */
    pageImage(name: string, index: number): any;
    /** Loader scale (bone positions, image sizes, translations). */
    scale?: number;
}

/** The object given to atlas pages; batches carry it as their texture. */
export class PageTexture {
    constructor(public image: any, public page: number, public name: string) {}
    getImage(): any {
        return this.image;
    }
    setFilters(): void {}
    setWraps(): void {}
    dispose(): void {}
}

export interface LoadedSkeleton {
    version: VersionInfo;
    runtime: RuntimeVersion;
    lib: typeof S42 | typeof S43;
    atlas: S42.TextureAtlas | S43.TextureAtlas;
    data: AnySkeletonData;
    stateData: S42.AnimationStateData | S43.AnimationStateData;
    /** True when the atlas says its pages are premultiplied. */
    pma: boolean;
    pages: PageTexture[];
}

export class SpineLoadError extends Error {}

function libFor(runtime: RuntimeVersion): typeof S42 | typeof S43 {
    return runtime === '4.3' ? spine43 : spine42;
}

/** Reads an export with the runtime that matches its version. */
export function loadSkeleton(src: SpineSource): LoadedSkeleton {
    const version = detectVersion(src.json, src.binary);
    if (!version.runtime) {
        const v = version.exported || 'unknown';
        throw new SpineLoadError(`Spine ${v} data is not supported (4.2 and 4.3 are). Re-export it from Spine 4.2+, or use Cocos's sp.Skeleton for 3.8.`);
    }
    const S: any = libFor(version.runtime);
    const atlas = new S.TextureAtlas(src.atlasText);
    const pages: PageTexture[] = [];
    atlas.pages.forEach((page: any, i: number) => {
        const tex = new PageTexture(src.pageImage(page.name, i), i, page.name);
        pages.push(tex);
        page.setTexture(tex);
    });
    const loader = new S.AtlasAttachmentLoader(atlas);
    const reader = src.json ? new S.SkeletonJson(loader) : new S.SkeletonBinary(loader);
    reader.scale = src.scale ?? 1;
    let data: AnySkeletonData;
    try {
        data = reader.readSkeletonData(src.json ?? src.binary);
    } catch (e) {
        throw new SpineLoadError(`Spine ${version.exported} data could not be read: ${(e as Error).message}`);
    }
    return {
        version,
        runtime: version.runtime,
        lib: S,
        atlas,
        data,
        stateData: new S.AnimationStateData(data),
        pma: atlas.pages.some((p: any) => p.pma),
        pages,
    };
}

export function physicsConstraintCount(loaded: LoadedSkeleton): number {
    if (loaded.runtime === '4.3') {
        const S = spine43;
        return (loaded.data as S43.SkeletonData).constraints.filter((c) => c instanceof S.PhysicsConstraintData).length;
    }
    return (loaded.data as S42.SkeletonData).physicsConstraints.length;
}

export interface SkeletonInfo {
    exported: string;
    runtime: RuntimeVersion;
    bones: number;
    slots: number;
    physics: number;
    animations: { name: string; duration: number }[];
    skins: string[];
    events: string[];
    pma: boolean;
    width: number;
    height: number;
}

export function skeletonInfo(loaded: LoadedSkeleton): SkeletonInfo {
    const d = loaded.data;
    return {
        exported: loaded.version.exported,
        runtime: loaded.runtime,
        bones: d.bones.length,
        slots: d.slots.length,
        physics: physicsConstraintCount(loaded),
        animations: d.animations.map((a: any) => ({ name: a.name, duration: a.duration })),
        skins: d.skins.map((s: any) => s.name),
        events: d.events.map((e: any) => e.name),
        pma: loaded.pma,
        width: d.width,
        height: d.height,
    };
}

/** World transform of a bone in skeleton space. */
export interface BoneWorld {
    x: number;
    y: number;
    a: number;
    b: number;
    c: number;
    d: number;
}

/**
 * A skeleton + animation state for either runtime.
 *
 * Per frame: `advance(dt)` (time, animations), then `pose(physics)` (world
 * transforms, physics), then `buildMesh`.
 */
export class SkeletonInstance {
    readonly skeleton: AnySkeleton;
    readonly state: AnyAnimationState;
    private builder = new MeshBuilder();

    constructor(readonly loaded: LoadedSkeleton) {
        const S: any = loaded.lib;
        this.skeleton = new S.Skeleton(loaded.data);
        this.state = new S.AnimationState(loaded.stateData);
        this.skeleton.updateWorldTransform(S.Physics.update);
    }

    get runtime(): RuntimeVersion {
        return this.loaded.runtime;
    }

    get data(): AnySkeletonData {
        return this.loaded.data;
    }

    private get physicsEnum(): any {
        return (this.loaded.lib as any).Physics;
    }

    // ---------------------------------------------------------------- pose

    setupPose(): void {
        const s: any = this.skeleton;
        if (this.runtime === '4.3') s.setupPose();
        else s.setToSetupPose();
    }

    setupPoseSlots(): void {
        const s: any = this.skeleton;
        if (this.runtime === '4.3') s.setupPoseSlots();
        else s.setSlotsToSetupPose();
    }

    /** Sets the skin ('' or 'default' = the default skin) and refreshes slot attachments. */
    setSkin(name: string): boolean {
        const s: any = this.skeleton;
        const want = name && name !== 'default' ? name : '';
        if (want && !this.data.findSkin(want)) return false;
        if (!want) s.setSkin(null);
        else if (this.runtime === '4.3') s.setSkin(want);
        else s.setSkinByName(want);
        this.setupPoseSlots();
        return true;
    }

    setAttachment(slotName: string, attachmentName: string | null): void {
        (this.skeleton as any).setAttachment(slotName, attachmentName);
    }

    findBone(name: string): AnyBone | null {
        return this.skeleton.findBone(name);
    }

    findSlot(name: string): AnySlot | null {
        return this.skeleton.findSlot(name);
    }

    boneWorld(bone: AnyBone): BoneWorld {
        return (this.runtime === '4.3' ? (bone as S43.Bone).appliedPose : bone) as unknown as BoneWorld;
    }

    get scaleX(): number {
        return this.skeleton.scaleX;
    }
    get scaleY(): number {
        return this.skeleton.scaleY;
    }
    setScale(x: number, y: number): void {
        const s: any = this.skeleton;
        if (this.runtime === '4.3') s.setScale(x, y);
        else {
            s.scaleX = x;
            s.scaleY = y;
        }
    }

    // ----------------------------------------------------------- animation

    hasAnimation(name: string): boolean {
        return !!name && !!this.data.findAnimation(name);
    }

    setAnimation(track: number, name: string, loop: boolean): AnyTrackEntry | null {
        if (!this.hasAnimation(name)) return null;
        return (this.state as any).setAnimation(track, name, loop);
    }

    addAnimation(track: number, name: string, loop: boolean, delay = 0): AnyTrackEntry | null {
        if (!this.hasAnimation(name)) return null;
        return (this.state as any).addAnimation(track, name, loop, delay);
    }

    setEmptyAnimation(track: number, mixDuration = 0): AnyTrackEntry {
        return (this.state as any).setEmptyAnimation(track, mixDuration);
    }

    addEmptyAnimation(track: number, mixDuration = 0, delay = 0): AnyTrackEntry {
        return (this.state as any).addEmptyAnimation(track, mixDuration, delay);
    }

    getCurrent(track: number): AnyTrackEntry | null {
        return (this.state as any).tracks[track] ?? null;
    }

    clearTrack(track: number): void {
        this.state.clearTrack(track);
    }

    clearTracks(): void {
        this.state.clearTracks();
    }

    setMix(from: string, to: string, duration: number): void {
        if (this.hasAnimation(from) && this.hasAnimation(to)) (this.loaded.stateData as any).setMix(from, to, duration);
    }

    // --------------------------------------------------------------- frame

    /** Advances skeleton time (used by physics) and the animation state, then applies it. */
    advance(dt: number): void {
        this.skeleton.update(dt);
        this.state.update(dt);
        (this.state as any).apply(this.skeleton);
    }

    /** Computes world transforms; with `physics`, physics constraints simulate. */
    pose(physics: boolean): void {
        const P = this.physicsEnum;
        (this.skeleton as any).updateWorldTransform(physics ? P.update : P.pose);
    }

    /** Moves physics as if the skeleton moved by (x, y) in skeleton space. */
    physicsTranslate(x: number, y: number): void {
        this.skeleton.physicsTranslate(x, y);
    }

    /** Rotates physics as if the skeleton rotated `degrees` around (x, y). */
    physicsRotate(x: number, y: number, degrees: number): void {
        this.skeleton.physicsRotate(x, y, degrees);
    }

    /** Puts every physics constraint back at rest. */
    resetPhysics(): void {
        (this.skeleton as any).updateWorldTransform(this.physicsEnum.reset);
    }

    buildMesh(options: MeshOptions, out: SpineMesh): SpineMesh {
        return this.builder.build(this.runtime, this.skeleton, options, out);
    }
}
