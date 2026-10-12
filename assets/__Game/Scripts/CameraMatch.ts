import { _decorator, Camera, Component } from 'cc';
const { ccclass, property } = _decorator;

// cc.Canvas's `alignCanvasWithScreen` only keeps the ONE camera it references (`_cameraComponent`,
// here the main Camera) in sync with the real device screen: whenever the actual aspect ratio
// differs from the design resolution, it recomputes that camera's orthoHeight and node position.
// A second camera - CameraTutorial, used so TutorialController can highlight a bubble/order on the
// TUTORIAL layer without the main camera drawing it - is never touched by that mechanism, so it
// stays frozen at whatever orthoHeight the Editor happened to show when it was authored. On any
// screen whose aspect ratio differs from that moment, the two cameras disagree and the TUTORIAL
// layer renders at the wrong scale even though their Inspector values look identical.
//
// Put on the CameraTutorial node, alongside its own Camera component. `source` is the main Camera.
@ccclass('CameraMatch')
export class CameraMatch extends Component {
    @property(Camera) source: Camera = null;

    private _target: Camera | null = null;

    protected onLoad(): void {
        this._target = this.getComponent(Camera);
        if (!this._target) {
            console.error('[CameraMatch] Must be on a node with its own Camera component.');
        }
    }

    protected lateUpdate(): void {
        if (!this.source || !this._target) {
            return;
        }

        this._target.orthoHeight = this.source.orthoHeight;
        this._target.fov = this.source.fov;
        this._target.node.setWorldPosition(this.source.node.worldPosition);
    }
}
