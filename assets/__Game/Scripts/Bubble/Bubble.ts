import { _decorator, Component, Node } from 'cc';
import { BubbleData } from './Data/LevelData';
const { ccclass, property } = _decorator;

@ccclass('Bubble')
export class Bubble extends Component {
    @property({readonly: true}) radius: number = 0;

    initiallize(data: BubbleData) {
        
    }

}


