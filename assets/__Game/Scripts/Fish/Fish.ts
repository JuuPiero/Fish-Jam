import { _decorator, Button, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Fish')
export class Fish extends Component {

    _button: Button = null;

    onclick: () => void = null;

    protected onLoad(): void {
        this._button = this.getComponent(Button)
        
    }
    protected onEnable(): void {
        this._button.node.on(Button.EventType.CLICK, this.onFishClick, this)
    }
    protected onDisable(): void {
        this._button.node.off(Button.EventType.CLICK, this.onFishClick, this)
    }
    initialize() {

    }

    onFishClick() {
        this.onclick?.();
        console.log("Hello world");
        
    }
}


