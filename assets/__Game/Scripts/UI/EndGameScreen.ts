import { _decorator, Button, Node } from 'cc';

import { ScreenBase } from 'db://assets/_iKame/Scripts/Navigation/ScreenBase';
import { PlayableAdsManager } from 'db://assets/_iKame/Scripts/PlayableAdsManager';
import { ETrackingEvent, TrackingManager } from 'db://assets/_iKame/Scripts/TrackingManager';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';

const { ccclass, property } = _decorator;

@ccclass('EndGameScreen')
export class EndGameScreen extends ScreenBase {

    @property(Button)
    downloadBtn: Button = null;

    // @property(Button)
    // retryBtn: Button = null;

    @property(Node)
    logo: Node = null;

   

    // public async enter(param?: { isWin, firstLose }): Promise<void> {
    //     super.enter(param);
    //     PlayableAdsManager.OpenStore();
    //     // this.downloadBtn.node.active = false;
    //     // this.retryBtn.node.active = true;

    //     // // tránh trường hợp enter nhiều lần tạo nhiều timer
    //     // this.unschedule(this.endGameCallback);

    //     // // Sau 3s không có tương tác thì EndGame
    //     // this.scheduleOnce(this.endGameCallback, 3);
    // }

    // protected start(): void {
    //     TrackingManager.TrackEvent(ETrackingEvent.ENDCARD_SHOWN);

    //     // this.downloadBtn.node.on(Button.EventType.CLICK, () => {
    //     //     // Có tương tác => hủy EndGame sau 3s
    //     //     this.unschedule(this.endGameCallback);

    //     //     TrackingManager.TrackEvent(ETrackingEvent.CTA_CLICKED);
    //     //     PlayableAdsManager.OpenStore();
    //     // });

    //     // this.retryBtn.node.on(Button.EventType.CLICK, () => {
    //     //     // Có tương tác => hủy EndGame sau 3s
    //     //     this.unschedule(this.endGameCallback);
    //     //     TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_RETRY);
    //     //     EventBus.emit(GameEvents.NEW_LEVEL);
    //     //     this.exit();
    //     // });
    // }
}