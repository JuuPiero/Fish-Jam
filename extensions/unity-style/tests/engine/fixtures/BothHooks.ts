import { _decorator } from 'cc';
import { MonoBehaviour } from '../../../assets/engine/MonoBehaviour';

const { ccclass, property } = _decorator;

/** Defines both the Cocos and the Unity hook (only the Cocos one may run), with @ccclass/@property. */
@ccclass('fixture.BothHooks')
export class BothHooks extends MonoBehaviour {
    @property
    speed = 2;

    calls: string[] = [];

    onLoad(): void { this.calls.push('onLoad'); }
    Awake(): void { this.calls.push('Awake'); }
    update(): void { this.calls.push('update'); }
    Update(): void { this.calls.push('Update'); }
    Start(): void { this.calls.push('Start'); }
}
