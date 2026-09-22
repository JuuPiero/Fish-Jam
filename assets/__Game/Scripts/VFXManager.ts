import { _decorator, Component, Node, Prefab } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('VFXManager')
export class VFXManager extends Component {

    @property(Prefab) bubbleEffect: Prefab = null;


    static instance: VFXManager;
    onLoad() {
        VFXManager.instance = this;

    }

}


