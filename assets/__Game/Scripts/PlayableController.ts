import { Color } from 'cc';
import { Camera } from 'cc';
import { _decorator, Component, Node, Vec2, Vec3 } from 'cc';
import { playGroundField } from 'db://cocos-playground/PlayGroundField';
const { ccclass, property } = _decorator;

@ccclass('PlayableController')
export class PlayableController extends Component {
    @property(Node) bgNode: Node = null;
    @property(Node) lightNode: Node = null;

    @property(Node) slotManager: Node = null;

    @property(Node) orderManager: Node = null;

    @property(Camera) mainCam: Camera = null;

    @playGroundField({type: Color, label: "BG Color", group: "PLAYABLE"}) camColor: Color = Color.WHITE;

    @playGroundField({type: Vec2, label: "Vị trí BG", group: "PLAYABLE"}) bgPosition: Vec2 = new Vec2(0, -52.773)
    @playGroundField({type: Vec2, label: "Scale BG", group: "PLAYABLE"}) bgtScale: Vec2  = new Vec2(1.3, 1.3)
    @playGroundField({type: Vec2, group: "PLAYABLE"}) lightScale: Vec2  = new Vec2(1, 1)


    @playGroundField({type: Vec2, label: "Vị trí mấy cái slots", group: "PLAYABLE"}) slotPosition: Vec2 = new Vec2(0, 443.361)
    

    @playGroundField({type: Vec2, label: "Vị trí mấy cái orders", group: "PLAYABLE"}) orderPosition: Vec2 = new Vec2(0, 683.517)
    

    start() {
        this.bgNode.setPosition(new Vec3(this.bgPosition.x, this.bgPosition.y, 1));
        this.bgNode.setScale(new Vec3(this.bgtScale.x, this.bgtScale.y, 1));
        this.lightNode.setScale(new Vec3(this.lightScale.x, this.lightScale.y, 1));

        this.slotManager.setPosition(new Vec3(this.slotPosition.x, this.slotPosition.y, 1));
        this.orderManager.setPosition(new Vec3(this.orderPosition.x, this.orderPosition.y, 1));

        this.mainCam.clearColor = this.camColor;

    }
}


