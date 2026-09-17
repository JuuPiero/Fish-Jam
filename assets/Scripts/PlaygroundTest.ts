import { _decorator, CCString, Color, Component, Enum, Label, Node, Vec3, Vec4 } from 'cc';
import { playGroundField } from 'db://cocos-playground/PlayGroundField';
const { ccclass, property } = _decorator;

export enum State {
    START ,
    UPDATE ,
    DESTROY 
}


@ccclass('PlaygroundTest')
export class PlaygroundTest extends Component {
    @property(Label) testLabel: Label = null;

    @playGroundField({type: Color}) labelColor: Color = Color.WHITE;
    @playGroundField({type: CCString}) labelContent: string = "";
    @playGroundField({type: Enum(State), label: "Trạng thái"}) state: State = State.START;


    @playGroundField({type: Vec4}) testVec4: Vec4 = new Vec4(0, 0, 0, 0)



    protected onLoad(): void {
        if(this.labelContent != '') {
            this.testLabel.string = this.labelContent + " " + this.state + " " + this.testVec4.toString();
            this.testLabel.color = this.labelColor;

        }

        console.log(this.state.toString());
        
    }

}


