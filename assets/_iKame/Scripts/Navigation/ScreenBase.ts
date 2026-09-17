import { _decorator, CCString, Component, Enum, Node, tween, UIOpacity, UITransform, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

export enum ETransactionType {
    None,
    Fade,
    Zoom,
    SlideLeft,
    SlideRight,
    SlideTop,
    SlideBottom,
    Bounce
}

@ccclass('ScreenBase')
export class ScreenBase extends Component {

    @property({ type: Enum(ETransactionType) })
    public transactionType: ETransactionType = ETransactionType.None;

    @property({ type: CCString })
    public screenName: string = '';

    protected _originalPos: Vec3 = new Vec3();
    protected _uiOpacity: UIOpacity = null!;

    onLoad() {
        this._originalPos = this.node.position.clone();
        this._uiOpacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
    }

    public async enter(param?: object): Promise<void> {
        this.node.active = true;
        this.stopAllTweens();
        
        // Reset trạng thái trước khi diễn anime
        this.prepareBeforeEnter();

        return new Promise((resolve) => {
            this.executeTransition(true, resolve);
        });
    }

    public async exit(): Promise<void> {
        this.stopAllTweens();
        return new Promise((resolve) => {
            this.executeTransition(false, () => {
                this.node.active = false;
                resolve();
            });
        });
    }

    private stopAllTweens() {
        tween(this.node).stop();
        tween(this._uiOpacity).stop();
    }

    private prepareBeforeEnter() {
        const winSize = this.node.parent!.getComponent(UITransform)!.contentSize;
        this._uiOpacity.opacity = 255;
        this.node.setScale(new Vec3(1, 1, 1));
        this.node.setPosition(this._originalPos);

        switch (this.transactionType) {
            case ETransactionType.Fade: this._uiOpacity.opacity = 0; break;
            case ETransactionType.Zoom: this.node.setScale(new Vec3(0, 0, 0)); break;
            case ETransactionType.SlideLeft: this.node.setPosition(new Vec3(-winSize.width, this._originalPos.y, 0)); break;
            case ETransactionType.SlideRight: this.node.setPosition(new Vec3(winSize.width, this._originalPos.y, 0)); break;
            case ETransactionType.SlideTop: this.node.setPosition(new Vec3(this._originalPos.x, winSize.height, 0)); break;
            case ETransactionType.SlideBottom: this.node.setPosition(new Vec3(this._originalPos.x, -winSize.height, 0)); break;
            case ETransactionType.Bounce: this.node.setScale(new Vec3(0.5, 0.5, 0.5)); this._uiOpacity.opacity = 0; break;
        }
    }

    private executeTransition(isEntering: boolean, onComplete: Function) {
        const duration = 0.4;
        const easingEnter = 'quintOut';
        const easingExit = 'quintIn';
        const currentEasing = isEntering ? easingEnter : easingExit;

        let targetOpacity = isEntering ? 255 : 0;
        let targetScale = isEntering ? new Vec3(1, 1, 1) : (this.transactionType === ETransactionType.Zoom ? new Vec3(0, 0, 0) : new Vec3(1, 1, 1));
        let targetPos = isEntering ? this._originalPos : this.calculateExitPos();

        // Tween Opacity chung
        if (this.transactionType !== ETransactionType.None) {
            tween(this._uiOpacity).to(duration, { opacity: targetOpacity }).start();
        }

        // Tween Position/Scale dựa theo loại
        let mainTween = tween(this.node);
        
        if (this.transactionType === ETransactionType.Zoom) {
            mainTween.to(duration, { scale: targetScale }, { easing: currentEasing });
        } else if (this.transactionType === ETransactionType.Bounce && isEntering) {
            mainTween.to(duration, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' });
        } else {
            mainTween.to(duration, { position: targetPos }, { easing: currentEasing });
        }

        mainTween.call(() => onComplete()).start();
    }

    private calculateExitPos(): Vec3 {
        const winSize = this.node.parent!.getComponent(UITransform)!.contentSize;
        switch (this.transactionType) {
            case ETransactionType.SlideLeft: return new Vec3(-winSize.width, this._originalPos.y, 0);
            case ETransactionType.SlideRight: return new Vec3(winSize.width, this._originalPos.y, 0);
            default: return this._originalPos;
        }
    }
}