import { _decorator, Component, Node, Prefab } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';

const { ccclass, property } = _decorator;

@bh.createAssetMenu('GameConfigSA', 'Config/GameConfigSA')
@bh.scriptable('GameConfigSA')
export class GameConfigSA extends bh.ScriptableAsset {
    @property(Prefab) bubblePrefab: Prefab = null;
    @property(Prefab) fishPrefab: Prefab = null;

}


