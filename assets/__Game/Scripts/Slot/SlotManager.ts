import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SlotManager')
export class SlotManager extends Component {
    @property spacing: number = 0;
    @property count: number = 5;
    initialize() {
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
    }
}


