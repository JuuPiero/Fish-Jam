import { _decorator, Component, Constructor, director, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameBehaviour')
export class GameBehaviour extends Component {
    public findFirstObjectByType<T extends Component>(typeOrMarker: new (...args: any[]) => T): T | null {
        const components = director.getScene()?.getComponentsInChildren(typeOrMarker as any) || [];
        return components?.length > 0 ? components[0].getComponent(typeOrMarker) : null;
    }
    public findObjectsByType<T extends Component>(
        type: Constructor<T>
    ): T[] {
        return (
            director.getScene()?.getComponentsInChildren(type as any) || []
        );
    }

    public getOrAddComponent<T extends Component>(
        type: new () => T
    ): T {
        let comp = this.getComponent(type);

        if (!comp) {
            comp = this.addComponent(type);
        }

        return comp;
    }



    private _invokeMap: Map<string, number> = new Map();
    private _repeatInvokeMap: Map<string, number> = new Map();

    /**
     * invoke once after delay
     *
     * this.invoke(() => {
     *     console.log("hello");
     * }, 1)
     */
    public invoke(
        callback: () => void,
        delay: number
    ): void {
        const key = this.createInvokeKey(callback);

        this.cancelInvoke(callback);

        const timerId = window.setTimeout(() => {
            callback();
            this._invokeMap.delete(key);
        }, delay * 1000);

        this._invokeMap.set(key, timerId);
    }

    /**
     * repeat invoke
     *
     * this.invokeRepeating(() => {
     *     console.log("tick");
     * }, 1, 0.5)
     */
    public invokeRepeating(
        callback: () => void,
        delay: number,
        repeatRate: number
    ): void {
        const key = this.createInvokeKey(callback);

        this.cancelInvoke(callback);

        const startTimer = window.setTimeout(() => {
            callback();

            const repeatTimer = window.setInterval(() => {
                callback();
            }, repeatRate * 1000);

            this._repeatInvokeMap.set(key, repeatTimer);
        }, delay * 1000);

        this._invokeMap.set(key, startTimer);
    }

    /**
     * cancel specific invoke
     */
    public cancelInvoke(
        callback?: () => void
    ): void {
        if (!callback) {
            this.cancelAllInvokes();
            return;
        }

        const key = this.createInvokeKey(callback);

        const timeoutId = this._invokeMap.get(key);
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            this._invokeMap.delete(key);
        }

        const intervalId = this._repeatInvokeMap.get(key);
        if (intervalId !== undefined) {
            clearInterval(intervalId);
            this._repeatInvokeMap.delete(key);
        }
    }

    /**
     * cancel all invoke
     */
    public cancelAllInvokes(): void {
        for (const timerId of this._invokeMap.values()) {
            clearTimeout(timerId);
        }

        for (const timerId of this._repeatInvokeMap.values()) {
            clearInterval(timerId);
        }

        this._invokeMap.clear();
        this._repeatInvokeMap.clear();
    }

    /*
    ========================================
    Lifecycle
    ========================================
    */

    protected onDestroy(): void {
        this.cancelAllInvokes();
    }

    /*
    ========================================
    Private
    ========================================
    */

    private createInvokeKey(
        callback: () => void
    ): string {
        return callback.toString();
    }
}
