// Hand-written TypeScript used from C# (TS interop sample): a component, a data class, enums,
// a function, a constant, and a name that clashes with Cocos' own `lerp`.
import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

export enum Team {
    Player,
    Enemy,
    Neutral = 10,
}

export enum DamageKind {
    Fire = 'fire',
    Ice = 'ice',
}

export const MAX_TEAMS = 3;

/** Nested data: a @ccclass without Component, usable as a saved C# field. */
@ccclass('Loadout')
export class Loadout {
    @property
    weapon = 'sword';
    @property
    ammo = 0;
}

@ccclass('Health')
export class Health extends Component {
    @property
    maxHp = 100;

    hp = 100;
    lastKind: DamageKind = DamageKind.Fire;

    get dead(): boolean {
        return this.hp <= 0;
    }

    /** Returns true when this hit killed the node. */
    damage(amount: number, kind: DamageKind = DamageKind.Fire): boolean {
        if (this.dead) return false;
        this.lastKind = kind;
        this.hp = Math.max(0, this.hp - amount);
        return this.dead;
    }

    heal(amount: number): this {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return this;
    }

    start() {
        this.hp = this.maxHp;
    }
}

export function formatHp(hp: number, max: number): string {
    return Math.round(hp) + ' / ' + max;
}

/** Same name as cc's lerp: C# reaches it as ts.Scripts.TsLib.Health_exports.lerp. */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(1, Math.max(0, t));
}
