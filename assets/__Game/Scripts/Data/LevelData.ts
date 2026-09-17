import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('BubbleData')
export class BubbleData {
    @property fishes: number[] = [];
}


@ccclass('LevelData')
export class LevelData {
    // @property()
}