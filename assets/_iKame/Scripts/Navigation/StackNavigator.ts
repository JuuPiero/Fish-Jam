import { _decorator, Component, Node } from 'cc';
import { Navigator } from './Navigator';
import { ScreenBase } from './ScreenBase';
const { ccclass, property } = _decorator;

@ccclass('StackNavigator')
export class StackNavigator extends Navigator {

    @property({type : ScreenBase})
    public screenStack: ScreenBase[] = [];
    public navigate(screenName: string, param?: object ): void {
        const screen = this.screens.get(screenName);
        if (screen != null)
        {
            if (this.screenStack.length > 0)
            {
                const lastScreen: ScreenBase  = this.screenStack[this.screenStack.length - 1];
                lastScreen.exit();
            }
            this.screenStack.push(screen);
            screen.enter(param);
            this.currentScreen = screen;
        }
    }
   
}


