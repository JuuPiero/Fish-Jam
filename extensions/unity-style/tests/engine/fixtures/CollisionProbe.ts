import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** A plain Cocos component receiving Unity physics messages (no base class). */
@ccclass('fixture.CollisionProbe')
export class CollisionProbe extends Component {
    events: string[] = [];
    last: any = null;
    lastTrigger: any = null;

    OnCollisionEnter(c: any): void { this.events.push('CollisionEnter'); this.last = c; }
    OnCollisionStay(c: any): void { if (this.events[this.events.length - 1] !== 'CollisionStay') this.events.push('CollisionStay'); }
    OnCollisionExit(c: any): void { this.events.push('CollisionExit'); }
    OnTriggerEnter(o: any): void { this.events.push('TriggerEnter'); this.lastTrigger = o; }
    OnTriggerStay(o: any): void { if (this.events[this.events.length - 1] !== 'TriggerStay') this.events.push('TriggerStay'); }
    OnTriggerExit(o: any): void { this.events.push('TriggerExit'); }
    OnCollisionEnter2D(c: any): void { this.events.push('CollisionEnter2D'); this.last = c; }
    OnCollisionStay2D(c: any): void { if (this.events[this.events.length - 1] !== 'CollisionStay2D') this.events.push('CollisionStay2D'); }
    OnCollisionExit2D(c: any): void { this.events.push('CollisionExit2D'); }
    OnTriggerEnter2D(o: any): void { this.events.push('TriggerEnter2D'); this.lastTrigger = o; }
    OnTriggerStay2D(o: any): void { if (this.events[this.events.length - 1] !== 'TriggerStay2D') this.events.push('TriggerStay2D'); }
    OnTriggerExit2D(o: any): void { this.events.push('TriggerExit2D'); }
}
