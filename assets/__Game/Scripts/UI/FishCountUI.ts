import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('FishCountUI')
export class FishCountUI extends Component {
    
    @property({readonly: true}) total: number = 0;
    @property({readonly: true}) count: number = 0; 
    

    protected onEnable(): void {
        
    }

    protected onDisable(): void {
        
    }


    onFishClicked = () => {
        


    }

}


