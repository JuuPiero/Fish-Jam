import { _decorator, CircleCollider2D, Collider2D, Component, Contact2DType, ICollisionEvent, instantiate, IPhysics2DContact, Node, UITransform } from 'cc';
import { BubbleData } from '../Data/LevelData';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Fish } from '../Fish/Fish';
const { ccclass, property } = _decorator;

@ccclass('Bubble')
export class Bubble extends Component {
    @property({ readonly: true }) radius: number = 0;
    _uiTransform: UITransform;
    _collider: CircleCollider2D = null;


    @property({readonly: true, type: [Fish]}) fishes: Fish[] = []

    protected onLoad(): void {
        this._uiTransform = this.getComponent(UITransform);
        this._collider = this.getComponent(CircleCollider2D);
    }
    protected start(): void {
        // this._collider.on('onCollisionEnter', this.onCollisionEnter, this)
        this._collider.on(Contact2DType.BEGIN_CONTACT, this.onCollisionEnter, this);
    }
    getRadius() {
        return this._uiTransform.contentSize.x;
    }
    calculateRadius() {
        // resize _uiTransform and collider
    }

    initiallize(data: BubbleData) {
        this.calculateRadius();
        const fishPrefab = ServiceLocator.get(GameConfigSA).fishPrefab;
        //spawn fishes
        for (const fishId of data.fishes) {
            const fishNode = instantiate(fishPrefab)
            fishNode.setParent(this.node);
            const fish = fishNode.getComponent(Fish)
            this.fishes.push(fish);
            fish.initialize(fishId);
        }
    }


    onCollisionEnter(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        // console.log('2D Va chạm giữa:', selfCollider.node.name, 'và', otherCollider.node.name);
        this.bounce();
    }

    bounce() {

    }


}


