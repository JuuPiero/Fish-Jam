import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Order')
export class Order extends Component {
    @property({readonly: true}) id: number = -1;


    initialize(id: number) {
        
    }

}


