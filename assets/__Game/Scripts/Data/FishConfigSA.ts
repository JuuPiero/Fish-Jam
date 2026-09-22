import { _decorator, CCString, Component, Node, Prefab, SpriteFrame } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';

const { ccclass, property } = _decorator;

@bh.createAssetMenu('FishConfigSA', 'Config/FishConfigSA')
@bh.scriptable('FishConfigSA')
export class FishConfigSA extends bh.ScriptableAsset {
    @property(SpriteFrame) fishs: SpriteFrame[] = []


    @property({type: CCString}) fishes: string[] = [];

    // onLoaded(): void {
    //     const basename = 'sprite_000';

    //     for (let i = 0; i < 80; i++) {
    //         this.fishes.push(basename + i);
    //     }
    // }

}


