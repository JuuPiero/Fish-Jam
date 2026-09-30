import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Slot')
export class Slot extends Component {
    @property(Node) container: Node = null;
}


