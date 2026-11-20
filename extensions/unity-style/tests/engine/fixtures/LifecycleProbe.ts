import { CCInteger, Node } from 'cc';
import { MonoBehaviour } from '../../../assets/engine/MonoBehaviour';
import { Header, HideInInspector, Range, Serializable, SerializeField, Space, Tooltip } from '../../../assets/engine/decorators';
import { WaitForEndOfFrame, WaitForFixedUpdate, WaitForSeconds, WaitUntil, WaitWhile } from '../../../assets/core/coroutines';
import { Time } from '../../../assets/engine/time';

/** A user-style script: nameless @Serializable, Unity messages, generators. */
@Serializable
export class LifecycleProbe extends MonoBehaviour {
    @Header('Stats')
    @Tooltip('Hit points')
    @Range(0, 200)
    @SerializeField
    hp = 100;

    @SerializeField(Node)
    target: Node | null = null;

    @SerializeField([Node])
    waypoints: Node[] = [];

    @Space(12)
    @SerializeField({ type: CCInteger })
    count = 3;

    @HideInInspector
    @SerializeField
    secret = 'x';

    notSaved = 5;

    log: string[] = [];
    updates = 0;
    fixed = 0;
    flag = false;

    Awake(): void { this.log.push('Awake'); }
    OnEnable(): void { this.log.push('OnEnable'); }
    Start(): void { this.log.push('Start'); }
    Update(dt: number): void { this.updates++; }
    LateUpdate(): void { if (this.updates === 1) this.log.push('LateUpdate'); }
    FixedUpdate(): void { this.fixed++; }
    OnDisable(): void { this.log.push('OnDisable'); }
    OnDestroy(): void { this.log.push('OnDestroy'); }

    Ping(): void { this.log.push('Ping@' + Time.time.toFixed(2)); }

    *Seconds(): Generator<any, void, any> {
        this.log.push('co:start');
        yield null;
        this.log.push('co:frame');
        yield new WaitForSeconds(0.5);
        this.log.push('co:0.5s@' + Time.time.toFixed(2));
        yield new WaitUntil(() => this.flag);
        this.log.push('co:until');
        yield new WaitWhile(() => this.flag);
        this.log.push('co:while');
        yield this.Child();
        this.log.push('co:after-child');
        const v = yield Promise.resolve(42);
        this.log.push('co:promise=' + v);
        yield new WaitForEndOfFrame();
        this.log.push('co:eof');
        yield new WaitForFixedUpdate();
        this.log.push('co:fixed');
    }

    *Child(): Generator<any, void, any> {
        this.log.push('child:1');
        yield null;
        this.log.push('child:2');
    }

    *Forever(): Generator<any, void, any> {
        for (;;) {
            this.log.push('tick');
            yield null;
        }
    }
}
