import { CCFloat, Color, Camera, CCInteger } from 'cc';
import { _decorator, Component, Node, Vec2, Vec3 } from 'cc';
import { playGroundField } from 'db://cocos-playground/PlayGroundField';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
const { ccclass, property } = _decorator;

@ccclass('PlayableController')
export class PlayableController extends Component {
    @property(Node) bgNode: Node = null;
    @property(Node) lightNode: Node = null;

    @property(Node) slotManager: Node = null;

    @property(Node) orderManager: Node = null;

    @property(Camera) mainCam: Camera = null;

    @playGroundField({ type: Color, label: "BG Color", group: "PLAYABLE" }) camColor: Color = Color.WHITE;

    @playGroundField({ type: Vec2, label: "Vị trí BG", group: "PLAYABLE" }) bgPosition: Vec2 = new Vec2(0, -52.773)
    @playGroundField({ type: Vec2, label: "Scale BG", group: "PLAYABLE" }) bgtScale: Vec2 = new Vec2(1.3, 1.3)
    @playGroundField({ type: Vec2, group: "PLAYABLE" }) lightScale: Vec2 = new Vec2(1, 1)


    @playGroundField({ type: Vec2, label: "Vị trí mấy cái slots", group: "PLAYABLE" }) slotPosition: Vec2 = new Vec2(0, 443.361)


    @playGroundField({ type: Vec2, label: "Vị trí mấy cái orders", group: "PLAYABLE" }) orderPosition: Vec2 = new Vec2(0, 683.517)



    // Read by Bubble when it is built: bubble radius in Unity units (x Bubble.unitPx) for 1, 2, 3, 4, 5+ fish.
    @playGroundField({ type: [CCFloat], group: "PLAYABLE" })
    bubbleScales: number[] = [1, 1.7, 1.8, 1.9, 2.15];

    // Read by Bubble when it is built: distance between neighbouring fish, in Unity units, by the bubble's fish count.
    @playGroundField({ type: [CCFloat], group: "PLAYABLE" })
    itemDistances: number[] = [1.4, 1.4, 1.4, 1.4, 1.2];


    @playGroundField({type: CCInteger, group: "PLAYABLE"}) forceStoreStep: number = 40;

    // Registered in onLoad, before GameManager.start builds the first level's bubbles.
    onLoad() {
        ServiceLocator.register(PlayableController, this);
    }

    start() {
        this.bgNode.setPosition(new Vec3(this.bgPosition.x, this.bgPosition.y, 1));
        this.bgNode.setScale(new Vec3(this.bgtScale.x, this.bgtScale.y, 1));
        this.lightNode.setScale(new Vec3(this.lightScale.x, this.lightScale.y, 1));

        this.slotManager.setPosition(new Vec3(this.slotPosition.x, this.slotPosition.y, 1));
        this.orderManager.setPosition(new Vec3(this.orderPosition.x, this.orderPosition.y, 1));

        this.mainCam.clearColor = this.camColor;

    }
}


