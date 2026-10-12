import { _decorator, Component, Node, Sprite } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Slot')
export class Slot extends Component {
    @property(Node) container: Node = null;

    @property(Sprite) mask: Sprite = null;
}


