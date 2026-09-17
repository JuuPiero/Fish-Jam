import { _decorator, CCBoolean, Component, Node, Vec3 } from 'cc';
import { Gizmos } from './Gizmos';

const { ccclass, property } = _decorator;

@ccclass('Spline')
export class Spline extends Component {

    @property({ type: Node })
    public points: Node[] = [];

    // @property({ type: Node })
    // public pointContainer: Node
    public gizmos: Gizmos

    @property(CCBoolean)
    public isLoop: boolean = false;

    protected start(): void {
        // this.points = this.pointContainer.children
        // const samples = this.getSamples(80);
        // this.gizmos = this.node.getComponent(Gizmos)
        // this.gizmos?.DrawPath(samples);
    }

    // =========================
    // CATMULL ROM
    // =========================
    private getCatmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
        const t2 = t * t;
        const t3 = t2 * t;

        const result = new Vec3();

        result.x = 0.5 * (
            (2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );

        result.y = 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );

        result.z = 0.5 * (
            (2 * p1.z) +
            (-p0.z + p2.z) * t +
            (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
        );

        return result;
    }

    // =========================
    // GET POINT ARRAY (handle loop / padding)
    // =========================
    private getControlPoints(): Vec3[] {
        const raw = this.points.map(p => p.worldPosition);

        if (raw.length < 2) return raw;

        if (this.isLoop) {
            // loop: nối vòng
            return [
                raw[raw.length - 1],
                ...raw,
                raw[0],
                raw[1]
            ];
        } else {
            // non-loop: padding đầu cuối
            return [
                raw[0],
                ...raw,
                raw[raw.length - 1]
            ];
        }
    }

    // =========================
    // GET POINT (0 → 1)
    // =========================
    public getPoint(t: number): Vec3 {
        const pts = this.getControlPoints();
        const count = pts.length;

        if (count < 4) return new Vec3();

        const totalSegments = count - 3;

        let scaledT = t * totalSegments;

        // fix edge case t = 1
        if (t >= 1) scaledT = totalSegments - 0.0001;

        const index = Math.floor(scaledT);
        const localT = scaledT - index;

        return this.getCatmullRom(
            pts[index],
            pts[index + 1],
            pts[index + 2],
            pts[index + 3],
            localT
        );
    }


    public getSamples(numSamples: number): Vec3[] {
        const result: Vec3[] = [];

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            result.push(this.getPoint(t));
        }

        return result;
    }

    public lengths: number[] = [];
    public totalLength: number = 0;

    public buildLengthTable(samples: Vec3[]) {
        this.lengths = [0];
        this.totalLength = 0;

        for (let i = 1; i < samples.length; i++) {
            const dist = Vec3.distance(samples[i - 1], samples[i]);
            this.totalLength += dist;
            this.lengths.push(this.totalLength);
        }
    }

    public getPointAtDistance(samples: Vec3[], d: number): Vec3 {
        d = d % this.totalLength;

        for (let i = 1; i < this.lengths.length; i++) {
            if (this.lengths[i] >= d) {
                const prevLen = this.lengths[i - 1];
                const segmentLen = this.lengths[i] - prevLen;

                const t = (d - prevLen) / segmentLen;

                const pos = new Vec3();
                Vec3.lerp(pos, samples[i - 1], samples[i], t);
                return pos;
            }
        }

        return samples[samples.length - 1];
    }
}