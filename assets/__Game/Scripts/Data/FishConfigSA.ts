import { _decorator, CCBoolean, CCString, Component, Node, Prefab, sp, SpriteFrame } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';

const { ccclass, property } = _decorator;

@bh.createAssetMenu('FishConfigSA', 'Config/FishConfigSA')
@bh.scriptable('FishConfigSA')
export class FishConfigSA extends bh.ScriptableAsset {
    // @property(SpriteFrame) fishs: SpriteFrame[] = []

    @property({ type: CCString }) fishes: string[] = [];


    animationById: Map<number, string> = new Map();

    onLoaded(): void {
        for (const name of this.fishes) {
            const match = name.match(/^sprite_(\d+)$/);
            if (!match) continue;

            const id = Number(match[1]);
            this.animationById.set(id, name);
        }

    }

    getAnimationName(fishId: number) {
        const name = this.animationById.get(fishId);

        if (name === undefined) {
            throw new Error(`Không tìm thấy animation cho fish ID: ${fishId}`);
        }

        return name;
    }

}


