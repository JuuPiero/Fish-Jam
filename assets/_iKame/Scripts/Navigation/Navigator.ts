import { _decorator, Component, Node } from 'cc';
import { IScreen } from './IScreen';
import { ScreenBase } from './ScreenBase';
const { ccclass, property } = _decorator;

@ccclass('Navigator')
export abstract class Navigator extends Component {
    @property({type : ScreenBase})
    public currentScreen: ScreenBase;
    protected screens: Map<string, ScreenBase> = new Map<string, ScreenBase>();

    protected start(): void {
        // var screens = this.getComponentsInChildren(ScreenBase);
        // screens.forEach(screen => {
        //     this.screens.set(screen.screenName, screen);
        // })
        const screens = this.node.children;
        for (const node of screens) {
            const components = node.getComponents(Component);
            for (const comp of components) {
                const scr = comp as unknown as Partial<IScreen>;
                if (scr.enter && scr.exit) {
                    this.screens.set(node.name, scr as ScreenBase);
                    break;
                }
            }
        }
    }
    public abstract navigate(screenName: string, param? : object): void;
    // public abstract navigateTo<T>(param : object): void; //  where T : IScreen;
}


