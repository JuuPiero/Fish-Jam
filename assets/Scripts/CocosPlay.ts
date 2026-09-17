import {
    _decorator,
    CCBoolean,
    CCFloat,
    CCInteger,
    CCString,
    Color,
    Component,
    Enum,
    Label,
    Vec2,
    Vec3,
    Vec4,
} from 'cc';
import { playGroundField } from 'db://cocos-playground/PlayGroundField';
const { ccclass } = _decorator;

/**
 * A numeric TS enum declared anywhere under assets/ is picked up automatically by the extension's
 * decorator scanner (matched by name) — no extra registration needed, just reference it as the
 * @playGroundField `type`.
 */
enum RewardTier {
    Bronze,
    Silver,
    Gold,
}

/**
 * Reference sample: one @playGroundField per supported kind, so this class alone demonstrates
 * every Cocos `type` the decorator understands and how it maps to a manifest/editor field kind.
 */
@ccclass('CocosPlay')
export class CocosPlay extends Component {
    // type: String/CCString -> kind: 'string'
    @playGroundField({ type: CCString, label: 'Headline text', group: 'Text' })
    textContent: string = 'Tap to play!';

    // type: Number/CCFloat -> kind: 'number' (free decimal input)
    @playGroundField({ type: CCFloat, label: 'Speed multiplier', group: 'Gameplay' })
    speedMultiplier: number = 1.5;

    // type: CCInteger -> kind: 'number' (still a plain number field on the frontend, but the
    // Inspector in Cocos Creator will round it to a whole number)
    @playGroundField({ type: CCInteger, label: 'Lives', group: 'Gameplay' })
    lives: number = 3;

    // type: Boolean/CCBoolean -> kind: 'boolean' (renders as a toggle switch)
    @playGroundField({ type: CCBoolean, label: 'Show hint arrow', group: 'Gameplay' })
    showHintArrow: boolean = true;

    // type: Color -> kind: 'color' (renders as a real color picker on the frontend)
    @playGroundField({ type: Color, label: 'Đổi màu ', group: 'Style' })
    color: Color = new Color('#ff0000');

    // type: Vec2 -> kind: 'vec2' (x/y number inputs)
    @playGroundField({ type: Vec2, label: 'Arrow offset', group: 'Style' })
    arrowOffset: Vec2 = new Vec2(0, 0);

    // type: Vec3 -> kind: 'vec3' (x/y/z number inputs)
    @playGroundField({ type: Vec3, label: 'Test vector', group: 'Style' })
    testVector: Vec3 = new Vec3(1, 2, 3);

    // type: Vec4 -> kind: 'vec4' (x/y/z/w number inputs)
    @playGroundField({ type: Vec4, label: 'Padding (L,T,R,B)', group: 'Style' })
    padding: Vec4 = new Vec4(10, 10, 10, 10);

    // type: a numeric TS enum -> kind: 'enum' (renders as a dropdown of the enum's member names)
    @playGroundField({ type: Enum(RewardTier), label: 'Reward tier', group: 'Gameplay' })
    rewardTier: RewardTier = RewardTier.Gold;
    @playGroundField({ type: [CCString], label: 'Tags' }) tags: string[] = []
    
    protected onLoad(): void {
        const label = this.node.getComponent(Label);
        if (label) {
            label.color = this.color;
            label.string = this.textContent;
        }
    }
}
