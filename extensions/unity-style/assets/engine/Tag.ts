import { _decorator, Component, Node } from 'cc';

const { ccclass, property, menu, disallowMultiple } = _decorator;

const UNTAGGED = 'Untagged';
/** Enabled Tag components, for FindWithTag. */
const live: Tag[] = [];

/**
 * A node's Unity tag. Cocos nodes have no tag (their `layer` is the render
 * layer), so a tag is this small component: GameObject.FindWithTag,
 * CompareTag and `tag` on MonoBehaviour read it. A node without one is
 * "Untagged".
 */
@ccclass('unity.Tag')
@menu('Unity Style/Tag')
@disallowMultiple
export class Tag extends Component {
    @property({ tooltip: 'Any string. Untagged is the default, as in Unity.' })
    tag = UNTAGGED;

    onEnable(): void {
        if (live.indexOf(this) < 0) live.push(this);
    }

    onDisable(): void {
        const i = live.indexOf(this);
        if (i >= 0) live.splice(i, 1);
    }

    /** The tag of a node ('Untagged' when it has no Tag). */
    static of(node: Node | null | undefined): string {
        if (!node) return UNTAGGED;
        const t = node.getComponent(Tag);
        return t ? t.tag : UNTAGGED;
    }

    /** Sets a node's tag, adding a Tag component when needed. */
    static set(node: Node, tag: string): void {
        let t = node.getComponent(Tag);
        if (!t) t = node.addComponent(Tag);
        t.tag = tag;
    }

    /** Active, enabled tagged nodes. */
    static nodesWith(tag: string): Node[] {
        const out: Node[] = [];
        for (let i = 0; i < live.length; i++) {
            const t = live[i];
            if (t.isValid && t.tag === tag && t.node.activeInHierarchy) out.push(t.node);
        }
        return out;
    }
}
