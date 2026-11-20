// A plain TypeScript singleton used from C# (TS interop sample).
import { Team } from './Health';

export interface ScoreEntry {
    name: string;
    team: Team;
    points: number;
}

export class ScoreBoard {
    private static _instance: ScoreBoard | null = null;
    static get instance(): ScoreBoard {
        if (!ScoreBoard._instance) ScoreBoard._instance = new ScoreBoard();
        return ScoreBoard._instance;
    }

    private entries: ScoreEntry[] = [];

    add(name: string, team: Team, points: number): ScoreEntry {
        let e = this.entries.find((x) => x.name === name);
        if (!e) {
            e = { name, team, points: 0 };
            this.entries.push(e);
        }
        e.points += points;
        return e;
    }

    top(count: number): ScoreEntry[] {
        return this.entries.slice().sort((a, b) => b.points - a.points).slice(0, count);
    }

    total(team?: Team): number {
        let sum = 0;
        for (const e of this.entries) if (team === undefined || e.team === team) sum += e.points;
        return sum;
    }

    onChanged: ((entry: ScoreEntry) => void) | null = null;
}
