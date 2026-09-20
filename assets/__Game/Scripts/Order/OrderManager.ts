import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('OrderManager')
export class OrderManager extends Component {
    @property spacing: number = 0;
    @property count: number = 4;

    initialize() {
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
    }
}


