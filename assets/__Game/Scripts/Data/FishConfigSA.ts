import { _decorator, Component, Node, Prefab, SpriteFrame } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';

const { ccclass, property } = _decorator;

@bh.createAssetMenu('FishConfigSA', 'Config/FishConfigSA')
@bh.scriptable('FishConfigSA')
export class FishConfigSA extends bh.ScriptableAsset {
    @property(SpriteFrame) fishs: SpriteFrame[] = []

}


