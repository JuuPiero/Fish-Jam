import { _decorator, Component, Mat4, Quat, Vec3 } from 'cc';
import { SkeletonAnimation } from './SkeletonAnimation';

const { ccclass, property, executeInEditMode, menu } = _decorator;

const _p = new Vec3();
const _m = new Mat4();
const _q = new Quat();
const _q2 = new Quat();
const _s = new Vec3();

/**
 * Keeps this node on a bone of a SkeletonAnimation (spine-unity's
 * BoneFollower): position, and optionally the bone's rotation and scale.
 * Put it on a node that isn't a child of the bone it follows... or anywhere:
 * the bone is read in world space.
 */
@ccclass('BoneFollower')
@executeInEditMode
@menu('Spine/BoneFollower')
export class BoneFollower extends Component {
    @property({ type: SkeletonAnimation, tooltip: 'The skeleton with the bone.' })
    skeletonAnimation: SkeletonAnimation | null = null;

    @property({ tooltip: 'Name of the bone to follow.' })
    boneName = '';

    @property({ tooltip: 'Follow the bone position in X and Y.' })
    followXYPosition = true;

    @property({ tooltip: 'Also take the skeleton\'s Z (off: keep this node\'s own Z).' })
    followZPosition = true;

    @property({ tooltip: 'Follow the bone rotation.' })
    followBoneRotation = true;

    @property({ tooltip: 'Scale with the bone (its world scale).' })
    followLocalScale = false;

    @property({ tooltip: 'Mirror with the skeleton when it is flipped.' })
    followSkeletonFlip = true;

    private _bone: any = null;
    private _boneFor = '';
    private _skeleton: any = null;
    private _baseScale: Vec3 | null = null;

    onLoad() {
        if (!this.skeletonAnimation) this.skeletonAnimation = this.node.parent?.getComponent(SkeletonAnimation) ?? null;
    }

    lateUpdate() {
        const skel = this.skeletonAnimation;
        if (!skel || !skel.isValid || !skel.instance || !this.boneName) return;
        if (!this._bone || this._boneFor !== this.boneName || this._skeleton !== skel.skeleton) {
            this._bone = skel.findBone(this.boneName);
            this._boneFor = this.boneName;
            this._skeleton = skel.skeleton;
        }
        const bone = this._bone;
        if (!bone) return;
        const w = skel.instance.boneWorld(bone);
        const world = skel.node.worldMatrix;
        if (this.followXYPosition) {
            Vec3.transformMat4(_p, _p.set(w.x, w.y, 0), world);
            if (!this.followZPosition) _p.z = this.node.worldPosition.z;
            this.node.setWorldPosition(_p);
        }
        // A mirrored bone (flipped skeleton): X follows the bone, Y is flipped to match.
        const flipped = this.followSkeletonFlip && w.a * w.d - w.b * w.c < 0;
        if (this.followBoneRotation) {
            // Bone angle in skeleton space, on top of the skeleton node's rotation.
            const angle = Math.atan2(w.c, w.a) * 180 / Math.PI;
            Mat4.getRotation(_q2, world);
            Quat.multiply(_q, _q2, Quat.fromAngleZ(_q, angle));
            this.node.setWorldRotation(_q);
        }
        if (this.followLocalScale || this.followSkeletonFlip) {
            if (!this._baseScale) this._baseScale = this.node.scale.clone();
            const base = this._baseScale;
            let sx = base.x;
            let sy = base.y;
            if (this.followLocalScale) {
                sx *= Math.sqrt(w.a * w.a + w.c * w.c);
                sy *= Math.sqrt(w.b * w.b + w.d * w.d);
            }
            if (flipped) sy = -sy;
            this.node.setScale(_s.set(sx, sy, base.z));
        }
    }
}
