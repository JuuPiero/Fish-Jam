import { _decorator, Camera, Component, Node } from 'cc';
import { StackNavigator } from './StackNavigator';
import { EventBus } from '../EventBus';
const { ccclass, property } = _decorator;

@ccclass('NavigationContainer')
export class NavigationContainer extends Component {
    @property({type : StackNavigator}) public stack: StackNavigator = null;
    
    private uiCamera: Camera = null;
    protected onLoad(): void {
        this.uiCamera = this.getComponentInChildren(Camera)
    }
    
    protected start(): void {
        this.stack = this.getComponentInChildren(StackNavigator);
    }
}
