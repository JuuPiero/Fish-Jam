import { _decorator, Color, Component, Gradient, GradientRange, Line, Node, Vec3 } from 'cc';
import { Spline } from './Spline';
const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

@ccclass('Gizmos')
@requireComponent(Line)
export class Gizmos extends Component {

    // public static instance: Gizmos;
    @property
    private line: Line

    @property(Spline) public spline: Spline


    protected onLoad(): void {
        this.line = this.node.getComponent(Line)
    }

    protected start(): void {
        this.spline = this.getComponent(Spline)
        this.line = this.getComponent(Line)

        
    }
    protected update(dt: number): void {
        const samples = this.spline.getSamples(50)
        this.DrawPath(samples)
    }

    public DrawPath(points: Vec3[], color: Color | null = null) {
        if (!this.line) return;

        const localPoints = points.map(p => {
            const out = new Vec3();
            this.node.inverseTransformPoint(out, p);
            return out;
        });
        if (color ) {
            this.line.color.color = color
        }

        this.line.positions = localPoints;
    }

    public DrawLine(from: Vec3, to: Vec3) {
        if (!this.line) return;

        const p1 = new Vec3();
        const p2 = new Vec3();

        this.node.inverseTransformPoint(p1, from);
        this.node.inverseTransformPoint(p2, to);

        this.line.positions = [p1, p2];
    }
}


